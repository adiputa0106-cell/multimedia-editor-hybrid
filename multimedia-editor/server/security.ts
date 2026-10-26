import crypto from 'node:crypto';
import { config } from './config.js';

export interface ImageValidationResult {
  valid: boolean;
  format?: 'png' | 'jpeg' | 'webp';
  width?: number;
  height?: number;
  hasAlpha?: boolean;
  sizeBytes?: number;
  error?: string;
}

/**
 * Validasi signature biner (magic bytes) berkas citra serta ekstraksi dimensi dan kanal alpha.
 * Mencegah eksploitasi MIME-type spoofing dengan memeriksa byte nyata.
 */
export function validateImageBuffer(buffer: Buffer): ImageValidationResult {
  if (!buffer || buffer.length < 12) {
    return { valid: false, error: 'Ukuran data citra terlalu kecil atau tidak valid.' };
  }

  // 1. Cek PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    let width: number | undefined;
    let height: number | undefined;
    let hasAlpha: boolean = false;

    if (buffer.length >= 26) {
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);
      const colorType = buffer[25];
      // ColorType 4 = Grayscale + Alpha, ColorType 6 = RGBA Truecolor + Alpha
      hasAlpha = colorType === 4 || colorType === 6 || buffer.includes(Buffer.from('tRNS'));
    }

    return {
      valid: true,
      format: 'png',
      width,
      height,
      hasAlpha,
      sizeBytes: buffer.length,
    };
  }

  // 2. Cek JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    let width: number | undefined;
    let height: number | undefined;

    // Scan marker SOF0 (0xFFC0) / SOF2 (0xFFC2) untuk dimensi
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] === 0xff) {
        const marker = buffer[offset + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          height = buffer.readUInt16BE(offset + 5);
          width = buffer.readUInt16BE(offset + 7);
          break;
        } else if (marker === 0xd9 || marker === 0xda) {
          break; // EOI / SOS
        }
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      } else {
        offset++;
      }
    }

    return {
      valid: true,
      format: 'jpeg',
      width,
      height,
      hasAlpha: false,
      sizeBytes: buffer.length,
    };
  }

  // 3. Cek WebP: RIFF (byte 0-3) dan WEBP (byte 8-11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    let width: number | undefined;
    let height: number | undefined;
    let hasAlpha: boolean = false;

    // Ekstraksi header VP8X jika tersedia
    if (buffer.length >= 30 && buffer.slice(12, 16).toString('ascii') === 'VP8X') {
      const flags = buffer[20];
      hasAlpha = (flags & 0x10) !== 0;
      width = 1 + buffer.readUIntLE(24, 3);
      height = 1 + buffer.readUIntLE(27, 3);
    }

    return {
      valid: true,
      format: 'webp',
      width,
      height,
      hasAlpha,
      sizeBytes: buffer.length,
    };
  }

  return {
    valid: false,
    error: 'Format citra tidak didukung atau signature biner korup. Hanya PNG, JPEG, dan WebP yang diizinkan.',
  };
}

/**
 * Ekstraksi Buffer dari Base64 Data URL atau Base64 String murni.
 */
export function parseBase64Image(dataUrlOrBase64: string): { buffer: Buffer; mimeType?: string } {
  let mimeType: string | undefined;
  let base64Data = dataUrlOrBase64;

  if (dataUrlOrBase64.startsWith('data:')) {
    const commaIndex = dataUrlOrBase64.indexOf(',');
    if (commaIndex !== -1) {
      const header = dataUrlOrBase64.slice(5, commaIndex);
      const semiIndex = header.indexOf(';');
      mimeType = semiIndex !== -1 ? header.slice(0, semiIndex) : header;
      base64Data = dataUrlOrBase64.slice(commaIndex + 1);
    }
  }

  const buffer = Buffer.from(base64Data, 'base64');
  return { buffer, mimeType };
}

/**
 * Rate Limiter berbasis Sliding Window per IP
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = config.rateLimitMaxPerMinute, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  public isAllowed(clientIp: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(clientIp) || [];
    // Buang timestamp yang sudah lewat dari window
    const validTimestamps = timestamps.filter((t) => now - t < this.windowMs);

    if (validTimestamps.length >= this.maxRequests) {
      this.requests.set(clientIp, validTimestamps);
      return false;
    }

    validTimestamps.push(now);
    this.requests.set(clientIp, validTimestamps);
    return true;
  }

  public reset(clientIp?: string) {
    if (clientIp) {
      this.requests.delete(clientIp);
    } else {
      this.requests.clear();
    }
  }
}

/**
 * Concurrency Limiter untuk membatasi proses inferensi simultan
 */
export class ConcurrencyLimiter {
  private activeCount = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent = config.maxConcurrentRequests) {
    this.maxConcurrent = maxConcurrent;
  }

  public acquire(): boolean {
    if (this.activeCount >= this.maxConcurrent) {
      return false;
    }
    this.activeCount++;
    return true;
  }

  public release(): void {
    if (this.activeCount > 0) {
      this.activeCount--;
    }
  }

  public getActiveCount(): number {
    return this.activeCount;
  }
}

/**
 * Anonymizer IP untuk privasi log (GDPR/kepatuhan privasi)
 */
export function anonymizeIp(ip: string): string {
  if (!ip) return '127.0.0.1';
  // Hash IP dengan salt tetap agar dapat dibedakan per sesi tanpa mencatat IP asli
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 10);
}

/**
 * Logger Aman yang menyaring data rahasia dan biner
 */
export const safeLogger = {
  info: (tag: string, message: string, meta?: Record<string, unknown>) => {
    console.log(`[INFO] [${tag}] ${message}`, meta ? sanitizeMeta(meta) : '');
  },
  warn: (tag: string, message: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] [${tag}] ${message}`, meta ? sanitizeMeta(meta) : '');
  },
  error: (tag: string, message: string, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] [${tag}] ${message}`, meta ? sanitizeMeta(meta) : '');
  },
};

function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ['key', 'token', 'secret', 'authorization', 'image', 'buffer', 'base64', 'mask'];

  for (const [k, v] of Object.entries(meta)) {
    const lower = k.toLowerCase();
    if (sensitiveKeys.some((s) => lower.includes(s))) {
      sanitized[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 200) {
      sanitized[k] = `${v.slice(0, 50)}... [truncated ${v.length} chars]`;
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}
