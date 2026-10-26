/**
 * AI Provider Adapter Layer
 *
 * Mengabstraksikan penyedia komputasi AI (Local Computer Vision vs Remote Generative AI).
 * Menjamin prinsip:
 * 1. Operasi lokal berjalan instan, gratis, dan tanpa koneksi internet (offline-first).
 * 2. Operasi generatif online diarahkan melalui backend proxy aman tanpa mengekspos API key di client.
 * 3. Plug-and-play: provider dapat diganti tanpa merombak UI atau Core Engine.
 */

import type { PhotoEditState } from './types';
import type {
  AIProviderAdapter,
  StructuredOperation,
  EditSessionContext,
} from './conversationTypes';
import { executeStructuredOperation } from './aiOrchestrator';

/**
 * Local Computer Vision Provider
 * Berjalan langsung di peramban / runtime Capacitor menggunakan Canvas 2D & WebGL.
 */
export class LocalComputerVisionProvider implements AIProviderAdapter {
  id = 'local_cv_provider';
  name = 'Local Computer Vision Engine';
  type = 'local' as const;

  isAvailable(): boolean {
    return true; // Selalu tersedia di semua platform (Web & Android)
  }

  async executeOperation(
    operation: StructuredOperation,
    context: EditSessionContext
  ): Promise<{ nextState: PhotoEditState; summary: string[] }> {
    const res = executeStructuredOperation(operation, context.currentState);
    return {
      nextState: res.nextState,
      summary: res.summary,
    };
  }
}

/**
 * Remote Generative AI Provider (Proxy Architecture)
 * Mengarahkan perintah manipulasi generatif tingkat tinggi (inpainting, background removal)
 * ke endpoint backend terenkripsi.
 */
export class RemoteGenerativeProvider implements AIProviderAdapter {
  id = 'remote_generative_proxy';
  name = 'Remote Generative AI (Backend Proxy)';
  type = 'remote' as const;
  private endpointUrl: string;

  constructor(endpointUrl: string = '/api/ai/generate') {
    this.endpointUrl = endpointUrl;
  }

  isAvailable(): boolean {
    if (typeof window === 'undefined') return true; // Node.js test environment
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  async checkHealth(): Promise<{
    available: boolean;
    providerConfigured: boolean;
    activeProvider?: string;
    model?: string;
    message?: string;
  }> {
    try {
      const response = await fetch('/api/ai/health');
      if (!response.ok) {
        return {
          available: false,
          providerConfigured: false,
          message: `Server kesehatan mengembalikan status HTTP ${response.status}`,
        };
      }
      const data = await response.json();
      return {
        available: data.status === 'ok',
        providerConfigured: Boolean(data.providerConfigured),
        activeProvider: data.provider,
        model: data.model,
      };
    } catch {
      return {
        available: false,
        providerConfigured: false,
        message: 'Backend server offline atau belum berjalan di port 3001.',
      };
    }
  }

  async executeOperation(
    operation: StructuredOperation,
    context: EditSessionContext
  ): Promise<{ nextState: PhotoEditState; summary: string[]; resultImage?: string; errorCode?: string }> {
    if (!this.isAvailable()) {
      throw new Error(
        'Koneksi internet tidak tersedia untuk operasi Generative AI online. Periksa jaringan Anda.'
      );
    }

    context.onProgress?.({ stage: 'Mempersiapkan citra...', percent: 15 });

    // 1. Dapatkan data gambar dari canvas atau context base64
    let imageBase64 = context.sourceImageBase64;
    if (!imageBase64 && context.sourceCanvas) {
      try {
        imageBase64 = context.sourceCanvas.toDataURL('image/png');
      } catch (err) {
        throw new Error(`Gagal mengekstrak citra dari kanvas: ${(err as Error).message}`);
      }
    }

    if (!imageBase64) {
      return {
        nextState: context.currentState,
        summary: ['Gagal mengeksekusi operasi generatif: Tidak ada citra aktif yang dapat dikirim ke server AI.'],
        errorCode: 'MISSING_IMAGE_DATA',
      };
    }

    context.onProgress?.({ stage: 'Mengirim citra ke backend AI...', percent: 40 });

    try {
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: operation.action,
          image: imageBase64,
          prompt: operation.parameters.prompt,
          parameters: operation.parameters,
        }),
        signal: context.abortSignal,
      });

      context.onProgress?.({ stage: 'Menganalisis respons model AI...', percent: 80 });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = data?.message || `Server AI mengembalikan status HTTP ${response.status}`;
        const errorCode = data?.error || 'PROVIDER_ERROR';

        return {
          nextState: context.currentState,
          summary: [`⚠️ Operasi AI Generatif gagal: ${errorMsg}`],
          errorCode,
        };
      }

      if (!data?.success || !data?.resultImage) {
        return {
          nextState: context.currentState,
          summary: ['⚠️ Respons server AI tidak memuat citra hasil yang valid.'],
          errorCode: 'INVALID_RESPONSE',
        };
      }

      context.onProgress?.({ stage: 'Selesai!', percent: 100 });

      return {
        nextState: context.currentState,
        summary: data.summary || ['Operasi Generative AI berhasil diterapkan sebagai versi baru.'],
        resultImage: data.resultImage,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          nextState: context.currentState,
          summary: ['Permintaan operasi AI generatif dibatalkan oleh pengguna.'],
          errorCode: 'ABORTED',
        };
      }

      const e = err as Error;
      return {
        nextState: context.currentState,
        summary: [
          `⚠️ Gagal terhubung ke server AI generatif (${e.message}). Pastikan backend telah dijalankan via 'npm run server'.`,
        ],
        errorCode: 'NETWORK_ERROR',
      };
    }
  }
}

// ─── Provider Registry ─────────────────────────────────────────
export class AIProviderRegistry {
  private static localProvider = new LocalComputerVisionProvider();
  private static remoteProvider = new RemoteGenerativeProvider();

  static getProvider(type: 'local' | 'remote'): AIProviderAdapter {
    if (type === 'remote') {
      return this.remoteProvider;
    }
    return this.localProvider;
  }
}
