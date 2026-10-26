/**
 * Local Storage Service — IndexedDB wrapper via idb & Project Package Handler
 *
 * Menyimpan metadata proyek dan edit-state saja, BUKAN bytes media mentah/base64.
 * Dilengkapi dengan fitur ekspor/impor berkas paket proyek (.json),
 * validasi skema migrasi, serta pemantauan kuota penyimpanan browser.
 */

import { openDB, type IDBPDatabase } from 'idb';
import { generateId, type Project } from './types';

const DB_NAME = 'multimedia-editor';
const DB_VERSION = 2;
const PROJECTS_STORE = 'projects';
const ASSETS_STORE = 'media_assets';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          const store = db.createObjectStore(PROJECTS_STORE, {
            keyPath: 'projectId',
          });
          store.createIndex('updatedAt', 'updatedAt');
          store.createIndex('mediaType', 'mediaType');
        }
        if (!db.objectStoreNames.contains(ASSETS_STORE)) {
          db.createObjectStore(ASSETS_STORE);
        }
      },
    });
  }
  return dbPromise;
}

/**
 * ─── Asset Manager (Binary Media Persistence) ─────────────────
 * Menyimpan Blob media terpisah dari metadata proyek untuk performa optimal.
 */
export async function saveMediaAsset(assetId: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put(ASSETS_STORE, blob, assetId);
}

export async function getMediaAsset(assetId: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get(ASSETS_STORE, assetId);
}

export async function deleteMediaAsset(assetId: string): Promise<void> {
  const db = await getDb();
  await db.delete(ASSETS_STORE, assetId);
}

/**
 * ─── Project Store Operations ─────────────────────────────────
 */
export async function saveProject(project: Project): Promise<void> {
  const db = await getDb();
  await db.put(PROJECTS_STORE, {
    ...project,
    updatedAt: new Date().toISOString(),
  });
}

export async function getProject(projectId: string): Promise<Project | undefined> {
  const db = await getDb();
  return db.get(PROJECTS_STORE, projectId);
}

export async function getAllProjects(): Promise<Project[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex(PROJECTS_STORE, 'updatedAt');
  return all.reverse(); // Urutan terbaru di awal
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await getDb();
  const proj = (await db.get(PROJECTS_STORE, projectId)) as Project | undefined;
  if (proj?.source?.assetId) {
    const all = (await db.getAll(PROJECTS_STORE)) as Project[];
    const otherWithAsset = all.some(
      (p) => p.projectId !== projectId && p.source?.assetId === proj.source.assetId
    );
    if (!otherWithAsset) {
      await db.delete(ASSETS_STORE, proj.source.assetId);
    }
  }
  await db.delete(PROJECTS_STORE, projectId);
}

export async function duplicateProject(projectId: string): Promise<Project> {
  const db = await getDb();
  const original = (await db.get(PROJECTS_STORE, projectId)) as Project | undefined;
  if (!original) {
    throw new Error('Proyek yang ingin diduplikasi tidak ditemukan.');
  }

  const now = new Date().toISOString();
  const newId = generateId();
  const duplicate: Project = {
    ...structuredClone(original),
    projectId: newId,
    name: `${original.name} (Salinan)`,
    createdAt: now,
    updatedAt: now,
  };
  await db.put(PROJECTS_STORE, duplicate);
  return duplicate;
}

/**
 * Validasi ketat skema objek Proyek untuk mencegah kerusakan data atau injeksi skrip.
 */
export function validateProjectSchema(data: unknown): Project {
  if (!data || typeof data !== 'object') {
    throw new Error('Format berkas proyek tidak valid (bukan JSON objek).');
  }

  const p = data as Partial<Project>;

  if (typeof p.schemaVersion !== 'number' || p.schemaVersion < 1) {
    throw new Error('Versi skema proyek tidak dikenali atau usang.');
  }

  if (typeof p.projectId !== 'string' || !p.projectId) {
    throw new Error('Project ID hilang atau tidak valid.');
  }

  if (p.mediaType !== 'photo' && p.mediaType !== 'video') {
    throw new Error(`Media type '${p.mediaType}' tidak didukung.`);
  }

  if (!p.source || typeof p.source !== 'object') {
    throw new Error('Metadata sumber proyek tidak lengkap.');
  }

  if (!p.editState || typeof p.editState !== 'object') {
    throw new Error('Edit-state proyek tidak ditemukan.');
  }

  return p as Project;
}

/**
 * Ekspor data proyek menjadi berkas paket .json yang dapat dibagikan / dicadangkan.
 */
export function exportProjectToFile(project: Project): void {
  const jsonStr = JSON.stringify(project, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const cleanName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanName}_project.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Impor berkas paket proyek .json dari peramban dan validasi isinya.
 */
export async function importProjectFromFile(file: File): Promise<Project> {
  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    throw new Error('Harap pilih berkas dengan format .json.');
  }

  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gagal membaca berkas JSON. Berkas mungkin rusak.');
  }

  const validated = validateProjectSchema(parsed);
  // Simpan ke IndexedDB lokal agar langsung tersimpan di peramban
  await saveProject(validated);
  return validated;
}

/**
 * Menghitung perkiraan penggunaan ruang penyimpanan lokal browser.
 */
export async function getStorageQuotaInfo(): Promise<{
  usedBytes: number;
  quotaBytes: number;
  percentage: number;
  formattedUsed: string;
}> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 1;
      const pct = Math.min(100, Math.round((used / quota) * 100));
      const usedMb = (used / (1024 * 1024)).toFixed(1);

      return {
        usedBytes: used,
        quotaBytes: quota,
        percentage: pct,
        formattedUsed: `${usedMb} MB`,
      };
    } catch {
      // Fallback
    }
  }

  return {
    usedBytes: 0,
    quotaBytes: 0,
    percentage: 0,
    formattedUsed: 'Tidak tersedia',
  };
}

/**
 * ─── Thumbnail Generator ──────────────────────────────────────
 * Menghasilkan pratinjau thumbnail berukuran kecil (<15 KB) dari kanvas atau gambar
 * untuk memperkaya tampilan kartu proyek di Beranda tanpa membebani IndexedDB.
 */
export function generateThumbnail(
  sourceCanvasOrImage: HTMLCanvasElement | HTMLImageElement,
  maxW: number = 240,
  maxH: number = 160
): string {
  try {
    const canvas = document.createElement('canvas');
    let sw = 0;
    let sh = 0;
    if (sourceCanvasOrImage instanceof HTMLCanvasElement) {
      sw = sourceCanvasOrImage.width;
      sh = sourceCanvasOrImage.height;
    } else {
      sw = sourceCanvasOrImage.naturalWidth || sourceCanvasOrImage.width;
      sh = sourceCanvasOrImage.naturalHeight || sourceCanvasOrImage.height;
    }
    if (sw === 0 || sh === 0) return '';
    const aspect = sw / sh;
    let targetW = maxW;
    let targetH = Math.round(maxW / aspect);
    if (targetH > maxH) {
      targetH = maxH;
      targetW = Math.round(maxH * aspect);
    }
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(sourceCanvasOrImage, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return '';
  }
}

/**
 * ─── Crash & Session Recovery ─────────────────────────────────
 * Melacak proyek yang sedang diedit secara aktif agar dapat dipulihkan otomatis
 * jika browser crash, tertutup tidak sengaja, atau di-reload oleh pengguna.
 */
const LAST_SESSION_KEY = 'media_editor_last_session';

export function saveLastActiveSession(projectId: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_SESSION_KEY, projectId);
    }
  } catch {}
}

export function getLastActiveSession(): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(LAST_SESSION_KEY);
    }
  } catch {}
  return null;
}

export function clearLastActiveSession(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LAST_SESSION_KEY);
    }
  } catch {}
}

