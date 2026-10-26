import http from 'node:http';
import { config } from './config.js';
import {
  RateLimiter,
  ConcurrencyLimiter,
  validateImageBuffer,
  parseBase64Image,
  anonymizeIp,
  safeLogger,
} from './security.js';
import { getBackgroundRemovalProvider, type BackgroundRemovalProvider } from './providers/backgroundRemoval.js';

export interface CreateServerOptions {
  provider?: BackgroundRemovalProvider;
  rateLimiter?: RateLimiter;
  concurrencyLimiter?: ConcurrencyLimiter;
}

export function createServer(options?: CreateServerOptions): http.Server {
  const activeRateLimiter = options?.rateLimiter || new RateLimiter(config.rateLimitMaxPerMinute, 60000);
  const activeConcurrencyLimiter = options?.concurrencyLimiter || new ConcurrencyLimiter(config.maxConcurrentRequests);
  const activeProvider = options?.provider || getBackgroundRemovalProvider();

  return http.createServer(async (req, res) => {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const anonymizedIp = anonymizeIp(clientIp);
    const url = req.url?.split('?')[0];

    // 2. Health Check Endpoint (GET /api/ai/health)
    if (req.method === 'GET' && url === '/api/ai/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          uptime: process.uptime(),
          provider: activeProvider.name,
          providerConfigured: activeProvider.isConfigured(),
          model: config.model,
          limits: {
            maxPayloadSizeBytes: config.maxPayloadSizeBytes,
            rateLimitPerMinute: config.rateLimitMaxPerMinute,
            timeoutMs: config.requestTimeoutMs,
          },
          supportedActions: ['remove_background'],
        })
      );
      return;
    }

    // 3. Generative Generation Endpoint (POST /api/ai/generate)
    if (req.method === 'POST' && url === '/api/ai/generate') {
      // A. Rate Limiting Check
      if (!activeRateLimiter.isAllowed(clientIp)) {
        safeLogger.warn('RATE_LIMIT', 'IP melebihi kuota per menit', { client: anonymizedIp });
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
        res.end(
          JSON.stringify({
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Terlalu banyak permintaan dalam waktu singkat. Silakan tunggu 1 menit.',
          })
        );
        return;
      }

      // B. Concurrency Limit Check
      if (!activeConcurrencyLimiter.acquire()) {
        safeLogger.warn('CONCURRENCY', 'Batas proses simultan tercapai', {
          active: activeConcurrencyLimiter.getActiveCount(),
        });
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            error: 'SERVER_BUSY',
            message: 'Server sedang memproses permintaan AI lain. Silakan coba kembali dalam beberapa detik.',
          })
        );
        return;
      }

      // C. Content-Length Header Early Check
      const contentLengthHeader = req.headers['content-length'];
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (contentLength > config.maxPayloadSizeBytes) {
          activeConcurrencyLimiter.release();
          safeLogger.warn('PAYLOAD_LIMIT', 'Content-Length header melampaui batas', {
            size: contentLength,
            max: config.maxPayloadSizeBytes,
          });
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              error: 'PAYLOAD_TOO_LARGE',
              message: `Ukuran permintaan (${(contentLength / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimum ${(config.maxPayloadSizeBytes / (1024 * 1024)).toFixed(0)} MB.`,
            })
          );
          req.destroy();
          return;
        }
      }

      // D. Stream Body Reading dengan Pelindung Ukuran Akumulatif
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let isAborted = false;

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        isAborted = true;
        abortController.abort();
      }, config.requestTimeoutMs);

      req.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });

      req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > config.maxPayloadSizeBytes) {
          isAborted = true;
          req.destroy();
          activeConcurrencyLimiter.release();
          clearTimeout(timeoutId);
          safeLogger.warn('STREAM_OVERFLOW', 'Akumulasi payload melebihi batas maksimum', {
            bytes: totalBytes,
            max: config.maxPayloadSizeBytes,
          });
          if (!res.headersSent) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: false,
                error: 'PAYLOAD_TOO_LARGE',
                message: `Ukuran citra melebihi batas maksimum ${(config.maxPayloadSizeBytes / (1024 * 1024)).toFixed(0)} MB.`,
              })
            );
          }
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', async () => {
        if (isAborted) return;

        try {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          let payload: {
            action?: string;
            image?: string;
            prompt?: string;
            parameters?: Record<string, unknown>;
          };

          try {
            payload = JSON.parse(rawBody);
          } catch {
            activeConcurrencyLimiter.release();
            clearTimeout(timeoutId);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: false,
                error: 'INVALID_JSON',
                message: 'Format request bukan JSON yang valid.',
              })
            );
            return;
          }

          // E. Validasi Aksi
          if (payload.action !== 'remove_background') {
            activeConcurrencyLimiter.release();
            clearTimeout(timeoutId);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: false,
                error: 'UNSUPPORTED_ACTION',
                message: `Aksi '${payload.action || 'undefined'}' belum didukung pada fase P2. Hanya 'remove_background' yang diizinkan.`,
              })
            );
            return;
          }

          // F. Validasi Ada Tidaknya Data Gambar
          if (!payload.image || typeof payload.image !== 'string' || payload.image.trim().length === 0) {
            activeConcurrencyLimiter.release();
            clearTimeout(timeoutId);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: false,
                error: 'MISSING_IMAGE_DATA',
                message: 'Permintaan harus memuat field "image" berformat Base64 Data URL.',
              })
            );
            return;
          }

          // G. Ekstraksi Buffer & Validasi Signature Magic Bytes
          const { buffer: imageBuffer } = parseBase64Image(payload.image);
          const validation = validateImageBuffer(imageBuffer);

          if (!validation.valid) {
            activeConcurrencyLimiter.release();
            clearTimeout(timeoutId);
            safeLogger.warn('INVALID_SIGNATURE', 'Signature berkas gambar ditolak', {
              error: validation.error,
              bytes: imageBuffer.length,
            });
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: false,
                error: 'INVALID_IMAGE_SIGNATURE',
                message: validation.error || 'Format gambar tidak didukung.',
              })
            );
            return;
          }

          safeLogger.info('PROCESS_START', 'Memulai penghapusan latar belakang', {
            action: payload.action,
            format: validation.format,
            sizeKb: Math.round(imageBuffer.length / 1024),
            client: anonymizedIp,
          });

          // H. Panggil Provider Background Removal
          const startTime = Date.now();
          const result = await activeProvider.removeBackground(imageBuffer, {
            signal: abortController.signal,
          });
          const elapsed = Date.now() - startTime;
          clearTimeout(timeoutId);
          activeConcurrencyLimiter.release();

          if (!result.success) {
            safeLogger.warn('PROCESS_FAILED', 'Gagal memproses gambar', {
              errorCode: result.errorCode,
              elapsedMs: elapsed,
            });

            // Map error code to HTTP status
            let statusCode = 500;
            if (result.errorCode === 'PROVIDER_NOT_CONFIGURED') statusCode = 503;
            else if (result.errorCode === 'INVALID_CREDENTIALS') statusCode = 401;
            else if (result.errorCode === 'RATE_LIMIT_EXCEEDED') statusCode = 429;
            else if (result.errorCode === 'ABORTED' || result.errorCode === 'TIMEOUT') statusCode = 504;

            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: false,
                error: result.errorCode || 'PROVIDER_ERROR',
                message: result.error || 'Terjadi kesalahan pada pemrosesan latar belakang.',
                action: payload.action,
              })
            );
            return;
          }

          safeLogger.info('PROCESS_SUCCESS', 'Penghapusan latar belakang berhasil', {
            elapsedMs: elapsed,
            resultSizeKb: Math.round((result.resultBuffer?.length || 0) / 1024),
          });

          const resultBase64 = `data:image/png;base64,${result.resultBuffer!.toString('base64')}`;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              action: 'remove_background',
              resultImage: resultBase64,
              metadata: {
                format: 'png',
                width: result.width,
                height: result.height,
                hasAlpha: result.hasAlpha ?? true,
                sizeBytes: result.resultBuffer!.length,
              },
              summary: [
                'Latar belakang foto berhasil dihapus secara cerdas',
                'Format citra: PNG dengan transparansi penuh',
                `Dimensi hasil: ${result.width || 'asli'}×${result.height || 'asli'} piksel`,
                `Waktu inferensi: ${elapsed}ms`,
              ],
            })
          );
        } catch (err: unknown) {
          activeConcurrencyLimiter.release();
          clearTimeout(timeoutId);
          const e = err as Error;
          safeLogger.error('INTERNAL_ERROR', 'Terjadi error tidak terduga', { message: e.message });
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                success: false,
                error: 'INTERNAL_SERVER_ERROR',
                message: 'Terjadi kesalahan internal pada server AI.',
              })
            );
          }
        }
      });

      return;
    }

    // 4. Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${url} tidak ditemukan pada server AI.`,
      })
    );
  });
}

// Start server if executed directly
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));

if (isDirectExecution) {
  const server = createServer();
  server.listen(config.port, config.host, () => {
    console.log('===========================================================');
    console.log(`🤖 MULTIMEDIA EDITOR HYBRID — AI BACKEND SERVER`);
    console.log(`📡 URL Server       : http://${config.host}:${config.port}`);
    console.log(`🩺 Health Check     : http://${config.host}:${config.port}/api/ai/health`);
    console.log(`⚙️ Provider Aktif   : ${config.provider} (${config.model})`);
    console.log(
      `🔑 Kredensial       : ${
        config.apiKey ? '✓ Terkonfigurasi (Secret Server)' : '⚠️ Belum dikonfigurasi (Mode 503)'
      }`
    );
    console.log(
      `🛡️ Guardrails       : Max Payload ${(config.maxPayloadSizeBytes / (1024 * 1024)).toFixed(0)}MB | Rate Limit ${config.rateLimitMaxPerMinute} req/m`
    );
    console.log('===========================================================');
  });
}
