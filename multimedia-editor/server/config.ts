import fs from 'node:fs';
import path from 'node:path';

export interface ServerConfig {
  port: number;
  host: string;
  provider: 'huggingface' | 'replicate';
  apiKey: string;
  model: string;
  maxPayloadSizeBytes: number;
  rateLimitMaxPerMinute: number;
  requestTimeoutMs: number;
  maxConcurrentRequests: number;
}

/**
 * Membaca file .env sederhana secara native tanpa dependensi eksternal.
 */
function loadEnvFile(): Record<string, string> {
  const env: Record<string, string> = {};
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'server', '.env'),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            env[key] = val;
          }
        }
        break; // Stop at first found file
      } catch {
        // Abaikan error pembacaan file .env
      }
    }
  }

  return env;
}

const fileEnv = loadEnvFile();

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || fileEnv[key] || defaultValue;
}

export const config: ServerConfig = {
  port: parseInt(getEnv('PORT', '3001'), 10) || 3001,
  host: getEnv('HOST', '127.0.0.1'),
  provider: (getEnv('AI_PROVIDER', 'huggingface') as 'huggingface' | 'replicate'),
  apiKey: getEnv('AI_PROVIDER_API_KEY', '').trim(),
  model: getEnv('AI_PROVIDER_MODEL', 'briaai/RMBG-1.4'),
  maxPayloadSizeBytes: parseInt(getEnv('MAX_PAYLOAD_SIZE_BYTES', '10485760'), 10) || 10485760, // 10 MB
  rateLimitMaxPerMinute: parseInt(getEnv('RATE_LIMIT_MAX_PER_MINUTE', '10'), 10) || 10,
  requestTimeoutMs: parseInt(getEnv('REQUEST_TIMEOUT_MS', '30000'), 10) || 30000,
  maxConcurrentRequests: parseInt(getEnv('MAX_CONCURRENT_REQUESTS', '2'), 10) || 2,
};
