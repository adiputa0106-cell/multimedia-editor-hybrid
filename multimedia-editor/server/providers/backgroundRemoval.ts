import { config } from '../config.js';
import { validateImageBuffer } from '../security.js';

export interface BackgroundRemovalResult {
  success: boolean;
  resultBuffer?: Buffer;
  contentType?: string;
  width?: number;
  height?: number;
  hasAlpha?: boolean;
  sizeBytes?: number;
  error?: string;
  errorCode?:
    | 'PROVIDER_NOT_CONFIGURED'
    | 'INVALID_CREDENTIALS'
    | 'RATE_LIMIT_EXCEEDED'
    | 'MODEL_LOADING'
    | 'TIMEOUT'
    | 'ABORTED'
    | 'INVALID_RESPONSE'
    | 'PROVIDER_ERROR';
}

export interface BackgroundRemovalProvider {
  readonly name: string;
  isConfigured(): boolean;
  removeBackground(
    imageBuffer: Buffer,
    options?: { signal?: AbortSignal }
  ): Promise<BackgroundRemovalResult>;
}

/**
 * Buffer PNG transparan valid 1x1 RGBA (67 bytes) untuk pengujian terkontrol (Testing Only).
 * Menjamin integritas tanpa pernah mengembalikan foto sumber secara palsu.
 */
export const MINIMAL_TEST_TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Mock Provider untuk Pengujian Terkontrol (Testing / CI Only)
 * Digunakan secara eksplisit saat pengujian integrasi ketika belum tersedia API key berbayar.
 * Menghasilkan berkas PNG valid dengan kanal alpha transparan asli.
 */
export class MockTestBackgroundRemovalProvider implements BackgroundRemovalProvider {
  public readonly name = 'mock_test_provider';

  public isConfigured(): boolean {
    return true; // Khusus lingkungan pengujian
  }

  public async removeBackground(
    imageBuffer: Buffer,
    options?: { signal?: AbortSignal }
  ): Promise<BackgroundRemovalResult> {
    if (options?.signal?.aborted) {
      return {
        success: false,
        errorCode: 'ABORTED',
        error: 'Permintaan pemrosesan AI dibatalkan.',
      };
    }

    // Validasi input awal
    const inputValidation = validateImageBuffer(imageBuffer);
    if (!inputValidation.valid) {
      return {
        success: false,
        errorCode: 'INVALID_RESPONSE',
        error: 'Format input citra tidak valid untuk diproses.',
      };
    }

    // Menghasilkan citra PNG transparan asli (bukan mengembalikan foto sumber)
    const resultBuffer = MINIMAL_TEST_TRANSPARENT_PNG;
    const validation = validateImageBuffer(resultBuffer);

    return {
      success: true,
      resultBuffer,
      contentType: 'image/png',
      width: validation.width || 1,
      height: validation.height || 1,
      hasAlpha: validation.hasAlpha ?? true,
      sizeBytes: resultBuffer.length,
    };
  }
}

/**
 * Adapter Resmi Hugging Face Serverless Inference API untuk Background Removal
 * Menggunakan endpoint router resmi: https://router.huggingface.co/hf-inference/models/{model}
 * Model default: briaai/RMBG-1.4 (atau ZhengPeng7/BiRefNet)
 */
export class HuggingFaceBackgroundRemovalProvider implements BackgroundRemovalProvider {
  public readonly name = 'huggingface';

  public isConfigured(): boolean {
    return Boolean(config.apiKey && config.apiKey.trim().length > 0);
  }

  public async removeBackground(
    imageBuffer: Buffer,
    options?: { signal?: AbortSignal }
  ): Promise<BackgroundRemovalResult> {
    // 1. Kebijakan Zero-Mock: Jika API key belum disetel, jangan pernah mengembalikan citra palsu
    if (!this.isConfigured()) {
      return {
        success: false,
        errorCode: 'PROVIDER_NOT_CONFIGURED',
        error:
          'Penyedia AI generatif belum dikonfigurasi pada server. Silakan atur AI_PROVIDER_API_KEY di file .env server.',
      };
    }

    const endpoint = `https://router.huggingface.co/hf-inference/models/${config.model}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/octet-stream',
          Accept: 'image/png',
        },
        body: new Uint8Array(imageBuffer),
        signal: options?.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            errorCode: 'INVALID_CREDENTIALS',
            error:
              'Kredensial API Hugging Face tidak valid atau otorisasi ditolak. Periksa AI_PROVIDER_API_KEY Anda.',
          };
        }

        if (response.status === 429) {
          return {
            success: false,
            errorCode: 'RATE_LIMIT_EXCEEDED',
            error:
              'Batas kuota inferensi gratis Hugging Face telah tercapai. Silakan coba lagi beberapa saat kemudian.',
          };
        }

        if (response.status === 503) {
          return {
            success: false,
            errorCode: 'MODEL_LOADING',
            error:
              'Model AI sedang dimuat pada infrastruktur cloud (cold start). Silakan coba lagi dalam 15-30 detik.',
          };
        }

        let errorDetail = '';
        try {
          const errJson = (await response.json()) as { error?: string };
          errorDetail = errJson.error ? `: ${errJson.error}` : '';
        } catch {
          // Abaikan jika bukan JSON
        }

        return {
          success: false,
          errorCode: 'PROVIDER_ERROR',
          error: `Penyedia AI mengembalikan status HTTP ${response.status}${errorDetail}`,
        };
      }

      // 2. Baca response binary array buffer
      const arrayBuffer = await response.arrayBuffer();
      const resultBuffer = Buffer.from(arrayBuffer);

      // 3. Validasi bahwa hasil benar-benar citra PNG valid dengan transparansi
      const validation = validateImageBuffer(resultBuffer);
      if (!validation.valid || validation.format !== 'png') {
        return {
          success: false,
          errorCode: 'INVALID_RESPONSE',
          error:
            'Respons dari penyedia AI bukan format PNG yang valid atau citra korup.',
        };
      }

      if (!validation.hasAlpha) {
        return {
          success: false,
          errorCode: 'INVALID_RESPONSE',
          error:
            'Citra hasil dari penyedia AI tidak memuat kanal transparansi (alpha channel) yang diharapkan.',
        };
      }

      return {
        success: true,
        resultBuffer,
        contentType: 'image/png',
        width: validation.width,
        height: validation.height,
        hasAlpha: validation.hasAlpha,
        sizeBytes: resultBuffer.length,
      };
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          return {
            success: false,
            errorCode: 'ABORTED',
            error: 'Permintaan pemrosesan AI dibatalkan.',
          };
        }
        return {
          success: false,
          errorCode: 'PROVIDER_ERROR',
          error: `Gagal menghubungi penyedia AI: ${err.message}`,
        };
      }
      return {
        success: false,
        errorCode: 'PROVIDER_ERROR',
        error: 'Terjadi kesalahan tidak dikenal saat menghubungi penyedia AI.',
      };
    }
  }
}

/**
 * Factory Provider Instance
 */
export function getBackgroundRemovalProvider(providerType?: string): BackgroundRemovalProvider {
  if (providerType === 'mock_test' || process.env.AI_PROVIDER === 'mock_test') {
    return new MockTestBackgroundRemovalProvider();
  }
  return new HuggingFaceBackgroundRemovalProvider();
}
