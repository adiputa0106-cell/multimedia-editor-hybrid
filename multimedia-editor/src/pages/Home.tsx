import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project } from '../core/types';
import {
  getAllProjects,
  deleteProject,
  duplicateProject,
  importProjectFromFile,
  exportProjectToFile,
  getStorageQuotaInfo,
} from '../core/storage';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const fileImportRef = useRef<HTMLInputElement>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [quotaInfo, setQuotaInfo] = useState<{ formattedUsed: string; percentage: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

  const loadProjects = async () => {
    try {
      const all = await getAllProjects();
      setProjects(all);
      const quota = await getStorageQuotaInfo();
      setQuotaInfo(quota);
    } catch {
      // Ignored
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([getAllProjects(), getStorageQuotaInfo()])
      .then(([all, quota]) => {
        if (active) {
          setProjects(all);
          setQuotaInfo(quota);
          setLoadingProjects(false);
        }
      })
      .catch(() => {
        if (active) setLoadingProjects(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const showToast = (message: string, type: string) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleDeleteProject = async (projectId: string, name: string) => {
    if (!window.confirm(`Hapus proyek '${name}' dari penyimpanan lokal browser?`)) {
      return;
    }
    try {
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.projectId !== projectId));
      showToast(`Proyek '${name}' berhasil dihapus`, 'info');
      const quota = await getStorageQuotaInfo();
      setQuotaInfo(quota);
    } catch {
      showToast('Gagal menghapus proyek', 'error');
    }
  };

  const handleDuplicateProject = async (projectId: string, name: string) => {
    try {
      const dup = await duplicateProject(projectId);
      showToast(`Proyek '${name}' berhasil diduplikasi sebagai '${dup.name}'`, 'success');
      await loadProjects();
    } catch (err: unknown) {
      const e = err as Error;
      showToast(`Gagal menduplikasi: ${e.message}`, 'error');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await importProjectFromFile(file);
      showToast(`Proyek '${imported.name}' berhasil diimpor`, 'success');
      await loadProjects();

      // Langsung buka photo editor
      navigate(`/photo?project=${imported.projectId}`);
    } catch (err: unknown) {
      const e = err as Error;
      showToast(`Gagal impor proyek: ${e.message || 'Format tidak valid'}`, 'error');
    } finally {
      if (fileImportRef.current) fileImportRef.current.value = '';
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="home">
      {/* Ambient background glow */}
      <div className="home-glow home-glow--purple" />
      <div className="home-glow home-glow--teal" />

      <header className="home-header">
        <div className="home-logo">
          <svg className="home-logo-icon" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="url(#logoGrad)" />
            <path d="M9 12l5 8h4l5-8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 16h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32">
                <stop stopColor="#7c5cfc" />
                <stop offset="1" stopColor="#00d4aa" />
              </linearGradient>
            </defs>
          </svg>
          <span className="home-logo-text">MediaStudio</span>
        </div>
        <div className="home-header-right">
          {quotaInfo && quotaInfo.formattedUsed !== 'Tidak tersedia' && (
            <span className="home-storage-badge" title="Penggunaan penyimpanan IndexedDB lokal">
              💾 Storage: {quotaInfo.formattedUsed} ({quotaInfo.percentage}%)
            </span>
          )}
          <span className="home-badge">Local-First Editor</span>
        </div>
      </header>

      <main className="home-main">
        <div className="home-hero">
          <h1 className="home-title">
            Edit media Anda.
            <br />
            <span className="home-title-accent">Langsung di perangkat.</span>
          </h1>
          <p className="home-subtitle">
            Photo editor profesional lokal tanpa upload ke server. Privasi terjaga, performa real-time, dan hasil kualitas tinggi.
          </p>
        </div>

        {/* Action Cards */}
        <div className="home-cards">
          {/* Photo Card */}
          <button
            className="home-card home-card--photo"
            onClick={() => navigate('/photo')}
            id="btn-open-photo"
          >
            <div className="home-card-icon">
              <svg viewBox="0 0 48 48" fill="none">
                <rect x="4" y="8" width="40" height="32" rx="4" stroke="currentColor" strokeWidth="2.5" />
                <circle cx="16" cy="20" r="4" stroke="currentColor" strokeWidth="2" />
                <path d="M4 32l10-8 6 5 8-10 16 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="home-card-content">
              <h2 className="home-card-title">Photo Editor Web</h2>
              <p className="home-card-desc">
                Adjustments ala Lightroom, filter mood spektral, riset AI Copier, crop, rotasi, dan teks langsung di browser.
              </p>
            </div>
            <div className="home-card-arrow">→</div>
            <div className="home-card-status home-card-status--ready">
              <span className="status-dot status-dot--green" />
              Web App
            </div>
          </button>
        </div>

        {/* Mobile APK Download Section */}
        <div className="home-apk-card" id="card-download-apk">
          <div className="home-apk-icon">📱</div>
          <div className="home-apk-info">
            <div className="home-apk-tag">Android App (.apk)</div>
            <h3 className="home-apk-title">Unduh Aplikasi Mobile MediaStudio</h3>
            <p className="home-apk-desc">
              Instal aplikasi langsung di smartphone Android Anda. Bebas internet, penyimpanan galeri native, dan pemrosesan lokal secepat kilat.
            </p>
          </div>
          <a
            href="/mediastudio-android.apk"
            download="mediastudio-android.apk"
            className="btn btn-primary home-apk-btn"
            id="btn-download-apk-mobile"
          >
            📥 Unduh APK Android
          </a>
        </div>

        {/* Recent Projects Section (Tahap 7) */}
        <section className="home-projects-section">
          <div className="home-projects-header">
            <div>
              <h2 className="home-projects-title">Proyek Tersimpan Lokal</h2>
              <p className="home-projects-desc">
                Metadata dan riwayat edit disimpan di IndexedDB peramban Anda (tanpa upload biner).
              </p>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => fileImportRef.current?.click()}
              id="btn-import-project"
            >
              📥 Impor Proyek (.json)
            </button>
          </div>

          {loadingProjects ? (
            <div className="home-projects-empty">Memuat daftar proyek...</div>
          ) : projects.length === 0 ? (
            <div className="home-projects-empty">
              Belum ada proyek tersimpan. Mulai edit foto atau video dan klik &quot;Simpan&quot; di editor.
            </div>
          ) : (
            <div className="home-projects-grid">
              {projects.map((proj) => (
                <div key={proj.projectId} className="home-project-card">
                  <div className="home-project-card-header">
                    <span
                      className={`home-project-tag ${
                        proj.mediaType === 'photo' ? 'home-project-tag--photo' : 'home-project-tag--video'
                      }`}
                    >
                      {proj.mediaType === 'photo' ? '📷 Foto' : '🎬 Video'}
                    </span>
                    <span className="home-project-date">{formatDate(proj.updatedAt)}</span>
                  </div>

                  {proj.thumbnail && (
                    <div className="home-project-thumb">
                      <img src={proj.thumbnail} alt={proj.name} loading="lazy" />
                    </div>
                  )}

                  <h3 className="home-project-name">{proj.name}</h3>

                  <div className="home-project-meta">
                    <span>Berkas: {proj.source.fileName}</span>
                    <span>Resolusi: {proj.source.width}×{proj.source.height}</span>
                  </div>

                  <div className="home-project-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/photo?project=${proj.projectId}`)}
                      id={`btn-open-proj-${proj.projectId}`}
                    >
                      Buka
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDuplicateProject(proj.projectId, proj.name)}
                      title="Duplikasi proyek ini"
                      id={`btn-dup-proj-${proj.projectId}`}
                    >
                      📑 Duplikasi
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => exportProjectToFile(proj)}
                      title="Unduh paket proyek (.json)"
                      id={`btn-export-proj-${proj.projectId}`}
                    >
                      📦 .json
                    </button>
                    <button
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => handleDeleteProject(proj.projectId, proj.name)}
                      title="Hapus proyek ini"
                      id={`btn-del-proj-${proj.projectId}`}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Feature Highlights */}
        <div className="home-features">
          <div className="home-feature">
            <span className="home-feature-icon">🔒</span>
            <span>Privasi Penuh — media tidak diunggah ke cloud</span>
          </div>
          <div className="home-feature">
            <span className="home-feature-icon">⚡</span>
            <span>Pemrosesan Lokal — GPU &amp; Canvas Native</span>
          </div>
          <div className="home-feature">
            <span className="home-feature-icon">📱</span>
            <span>Hybrid Ready — Web &amp; Android APK</span>
          </div>
        </div>
      </main>

      {/* Hidden file input for project import */}
      <input
        ref={fileImportRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportFile}
        className="sr-only"
        id="input-import-project"
      />

      {/* Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.message}</div>
        </div>
      )}

      <footer className="home-footer">
        <p>
          Data proyek tersimpan di IndexedDB browser Anda. Membersihkan cache browser
          dapat menghapus proyek lokal. Gunakan tombol &quot;Unduh .json&quot; untuk mencadangkan paket proyek.
        </p>
      </footer>
    </div>
  );
}
