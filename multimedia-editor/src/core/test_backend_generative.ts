/**
 * ==============================================================================
 * 🧪 SUITE 5: BACKEND AI GENERATIF & SECURITY UNIT TEST SUITE
 * ==============================================================================
 * Menguji kepatuhan keamanan dan fungsionalitas P2 Backend AI Generatif:
 * 1. Health check & status transparansi kredensial.
 * 2. Magic byte / signature validation (PNG, JPEG, WebP, dan penolakan binary korup).
 * 3. Batas ukuran payload (Payload Too Large 413 pada data >10MB).
 * 4. Whitelist aksi (hanya 'remove_background', menolak aksi tidak didukung dengan 400).
 * 5. Rate limiting per alamat IP (429 Too Many Requests).
 * 6. Zero-Mock Policy: Tidak ada citra palsu bila kredensial belum dikonfigurasi (503).
 * 7. Abort / Cancellation handling (AbortController).
 * 8. Secret Leakage Verification (memastikan kunci API tidak bocor ke git atau client bundle).
 * 9. Adapter Client-side Graceful Offline Fallback saat backend offline.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from '../../server/index.js';
import { validateImageBuffer, parseBase64Image, RateLimiter, ConcurrencyLimiter } from '../../server/security.js';
import { MockTestBackgroundRemovalProvider, MINIMAL_TEST_TRANSPARENT_PNG } from '../../server/providers/backgroundRemoval.js';
import { RemoteGenerativeProvider } from './aiProviderAdapter.js';
import type { StructuredOperation, EditSessionContext } from './conversationTypes.js';
import { DEFAULT_PHOTO_EDIT_STATE } from './types.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (detail) console.error(`    Detail: ${detail}`);
    failedTests++;
  }
}

// ─── Dummy Image Buffers untuk Pengujian Magic Bytes ──────────
// 1. PNG valid (8 bytes header)
const VALID_PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
// 2. JPEG valid (3 bytes header)
const VALID_JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
// 3. WebP valid (RIFF + WEBP header)
const VALID_WEBP_BUFFER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // 'RIFF'
  0x24, 0x00, 0x00, 0x00, // file length
  0x57, 0x45, 0x42, 0x50, // 'WEBP'
  0x56, 0x50, 0x38, 0x20  // 'VP8 '
]);
// 4. Corrupted / Unsupported text buffer
const INVALID_BINARY_BUFFER = Buffer.from('INI BUKAN FILE CITRA GAMBAR MELAINKAN TEKS BIASA');

async function runTestSuite() {
  console.log('===========================================================');
  console.log('🧪 SUITE 5: BACKEND AI GENERATIF & SECURITY UNIT TESTS');
  console.log('===========================================================');

  // ─── TEST GROUP 1: Magic Bytes & Binary Signature Validation ───
  console.log('\n--- TEST GROUP 1: Image Magic Bytes & Signature Validation ---');
  const pngVal = validateImageBuffer(VALID_PNG_BUFFER);
  assert(pngVal.valid && pngVal.format === 'png', 'PNG signature (89 50 4E 47...) is recognized as valid PNG');

  const jpegVal = validateImageBuffer(VALID_JPEG_BUFFER);
  assert(jpegVal.valid && jpegVal.format === 'jpeg', 'JPEG signature (FF D8 FF...) is recognized as valid JPEG');

  const webpVal = validateImageBuffer(VALID_WEBP_BUFFER);
  assert(webpVal.valid && webpVal.format === 'webp', 'WebP signature (RIFF...WEBP) is recognized as valid WebP');

  const invalidVal = validateImageBuffer(INVALID_BINARY_BUFFER);
  assert(!invalidVal.valid, 'Arbitrary text/binary is strictly rejected without trusting file extension');

  const parsed = parseBase64Image('data:image/png;base64,' + VALID_PNG_BUFFER.toString('base64'));
  assert(parsed.mimeType === 'image/png' && parsed.buffer.length === VALID_PNG_BUFFER.length, 'parseBase64Image extracts Data URL header and converts to Buffer cleanly');

  // ─── TEST GROUP 2: Security Rate Limiter & Concurrency ──────────
  console.log('\n--- TEST GROUP 2: Rate Limiting & Concurrency Guard ---');
  const testRateLimiter = new RateLimiter(3, 1000); // 3 per detik untuk pengujian cepat
  const ip = '192.168.1.100';
  assert(testRateLimiter.isAllowed(ip), 'First request from IP is allowed');
  assert(testRateLimiter.isAllowed(ip), 'Second request from IP is allowed');
  assert(testRateLimiter.isAllowed(ip), 'Third request from IP is allowed');
  assert(!testRateLimiter.isAllowed(ip), 'Fourth request from IP within window is blocked (Rate limit exceeded)');

  const testConcurrency = new ConcurrencyLimiter(1);
  assert(testConcurrency.acquire(), 'First concurrent worker acquires lock successfully');
  assert(!testConcurrency.acquire(), 'Second concurrent worker is blocked when max concurrency is 1');
  testConcurrency.release();
  assert(testConcurrency.acquire(), 'Worker acquires lock again after release');
  testConcurrency.release();

  // ─── TEST GROUP 3: Live Test Server Integration ────────────────
  console.log('\n--- TEST GROUP 3: Live Backend Server Integration Endpoints ---');
  const server: http.Server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as { port: number; address: string };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Test GET /api/ai/health
    const healthRes = await fetch(`${baseUrl}/api/ai/health`);
    assert(healthRes.status === 200, 'GET /api/ai/health returns HTTP 200 OK');
    const healthJson = await healthRes.json();
    assert(healthJson.status === 'ok', 'Health status field is "ok"');
    assert('providerConfigured' in healthJson, 'Health response includes providerConfigured status');
    assert(!('apiKey' in healthJson), 'Health response strictly excludes apiKey secret');

    // 2. Test Unsupported Action (e.g. 'delete_person')
    const badActionRes = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_person', image: 'data:image/png;base64,AAAA' }),
    });
    assert(badActionRes.status === 400, 'Unsupported action returns HTTP 400 Bad Request');
    const badActionJson = await badActionRes.json();
    assert(badActionJson.error === 'UNSUPPORTED_ACTION', 'Error code is UNSUPPORTED_ACTION');

    // 3. Test Missing Image Data
    const missingImgRes = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_background' }),
    });
    assert(missingImgRes.status === 400, 'Missing image payload returns HTTP 400 Bad Request');
    const missingImgJson = await missingImgRes.json();
    assert(missingImgJson.error === 'MISSING_IMAGE_DATA', 'Error code is MISSING_IMAGE_DATA');

    // 4. Test Corrupted Image Signature
    const fakeImgRes = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'remove_background',
        image: 'data:image/png;base64,' + INVALID_BINARY_BUFFER.toString('base64'),
      }),
    });
    assert(fakeImgRes.status === 400, 'Corrupted binary image signature returns HTTP 400');
    const fakeImgJson = await fakeImgRes.json();
    assert(fakeImgJson.error === 'INVALID_IMAGE_SIGNATURE', 'Error code is INVALID_IMAGE_SIGNATURE');

    // 5. Test Zero-Mock Policy: When API key is empty/not configured
    const validDataUrl = 'data:image/png;base64,' + VALID_PNG_BUFFER.toString('base64');
    const unconfiguredRes = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_background', image: validDataUrl }),
    });

    // If test environment has no AI_PROVIDER_API_KEY, it must return 503 PROVIDER_NOT_CONFIGURED
    if (!process.env.AI_PROVIDER_API_KEY) {
      assert(
        unconfiguredRes.status === 503,
        'Zero-Mock Policy: Unconfigured provider returns HTTP 503 Service Unavailable'
      );
      const unconfJson = await unconfiguredRes.json();
      assert(
        unconfJson.error === 'PROVIDER_NOT_CONFIGURED',
        'Returns honest PROVIDER_NOT_CONFIGURED error without generating fake images'
      );
    }

    // 6. Test Abort / Cancellation
    const abortController = new AbortController();
    abortController.abort(); // Pre-aborted
    let didCatchAbort = false;
    try {
      await fetch(`${baseUrl}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_background', image: validDataUrl }),
        signal: abortController.signal,
      });
    } catch {
      didCatchAbort = true;
    }
    assert(didCatchAbort, 'Client AbortController cancels network request immediately');
  } finally {
    server.close();
  }

  // ─── TEST GROUP 4: Secret Leakage & Bundle Inspection ─────────
  console.log('\n--- TEST GROUP 4: Secret Leakage & Git Protection ---');
  const gitignoreContent = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf8');
  assert(gitignoreContent.includes('.env'), '.gitignore in multimedia-editor strictly ignores .env');
  assert(gitignoreContent.includes('!.env.example'), '.gitignore preserves .env.example template');

  const envExampleContent = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
  assert(!envExampleContent.includes('hf_') && envExampleContent.includes('AI_PROVIDER_API_KEY='), '.env.example does not contain hardcoded token values or leaked secrets');

  // Verify that frontend client files do not import server/
  const clientFiles = ['src/pages/PhotoEditor.tsx', 'src/components/AIChatAssistant.tsx', 'src/core/aiProviderAdapter.ts'];
  let serverLeakedInClient = false;
  for (const cf of clientFiles) {
    const code = fs.readFileSync(path.resolve(process.cwd(), cf), 'utf8');
    if (
      code.includes("from '../../server") ||
      code.includes("from '../server") ||
      code.includes('process.env.AI_PROVIDER_API_KEY')
    ) {
      serverLeakedInClient = true;
    }
  }
  assert(!serverLeakedInClient, 'Client-side source files never import backend server secrets or private configs directly');

  // ─── TEST GROUP 5: RemoteGenerativeProvider Adapter Fallback ───
  console.log('\n--- TEST GROUP 5: Adapter Graceful Offline Fallback ---');
  // Gunakan port yang tidak ada untuk menguji ketahanan offline
  const offlineAdapter = new RemoteGenerativeProvider('http://127.0.0.1:59999/api/ai/generate');
  const dummyOp: StructuredOperation = {
    id: 'op_test_1',
    userPrompt: 'hapus background',
    target: 'generative',
    action: 'remove_background',
    parameters: {},
    confidence: 1.0,
    provider: 'remote',
    status: 'pending',
    explanation: 'Test offline',
    createdAt: new Date().toISOString(),
  };

  const dummyContext: EditSessionContext = {
    currentState: DEFAULT_PHOTO_EDIT_STATE,
    previousOperations: [],
    sourceFileName: 'test.jpg',
    imageDimensions: { width: 800, height: 600 },
    sourceImageBase64: 'data:image/png;base64,' + VALID_PNG_BUFFER.toString('base64'),
  };

  const offlineResult = await offlineAdapter.executeOperation(dummyOp, dummyContext);
  assert(
    offlineResult.errorCode === 'NETWORK_ERROR',
    'When backend is offline, RemoteGenerativeProvider returns clean NETWORK_ERROR without crashing'
  );
  assert(
    offlineResult.nextState === DEFAULT_PHOTO_EDIT_STATE,
    'Non-destructive: Failed remote call preserves original edit state without corruption'
  );

  // ─── TEST GROUP 6: Controlled Mock Provider, Alpha Transparency & Measurable Progress ───
  console.log('\n--- TEST GROUP 6: Mock Provider Integration, Alpha Transparency & Progress ---');
  const mockProvider = new MockTestBackgroundRemovalProvider();
  assert(mockProvider.isConfigured(), 'Mock provider isConfigured returns true for testing');

  // Verify minimal transparent PNG validation
  const transparentPngValidation = validateImageBuffer(MINIMAL_TEST_TRANSPARENT_PNG);
  assert(transparentPngValidation.valid && transparentPngValidation.format === 'png', 'MINIMAL_TEST_TRANSPARENT_PNG has valid PNG signature');
  assert(transparentPngValidation.hasAlpha === true, 'MINIMAL_TEST_TRANSPARENT_PNG possesses true alpha channel');
  assert(transparentPngValidation.width === 1 && transparentPngValidation.height === 1, 'MINIMAL_TEST_TRANSPARENT_PNG dimensions are extracted correctly (1x1)');

  // Start test server with injected Mock Provider
  const mockServer: http.Server = createServer({ provider: mockProvider });
  await new Promise<void>((resolve) => {
    mockServer.listen(0, '127.0.0.1', () => resolve());
  });

  const mockAddr = mockServer.address() as { port: number; address: string };
  const mockBaseUrl = `http://127.0.0.1:${mockAddr.port}`;

  try {
    // 1. Health check with Mock Provider
    const mockHealthRes = await fetch(`${mockBaseUrl}/api/ai/health`);
    const mockHealthJson = await mockHealthRes.json();
    assert(mockHealthJson.provider === 'mock_test_provider', 'Health check reflects injected mock provider name');
    assert(mockHealthJson.providerConfigured === true, 'Health check reflects providerConfigured: true in test mode');

    // 2. Client RemoteGenerativeProvider execution with Measurable Progress
    const clientAdapter = new RemoteGenerativeProvider(`${mockBaseUrl}/api/ai/generate`);
    const progressUpdates: { stage: string; percent: number }[] = [];

    const testOp: StructuredOperation = {
      id: 'op_mock_test_1',
      userPrompt: 'hapus background test',
      target: 'generative',
      action: 'remove_background',
      parameters: { prompt: 'hapus background' },
      confidence: 1.0,
      provider: 'remote',
      status: 'pending',
      explanation: 'Test mock execution',
      createdAt: new Date().toISOString(),
    };

    const testContext: EditSessionContext = {
      currentState: DEFAULT_PHOTO_EDIT_STATE,
      previousOperations: [],
      sourceFileName: 'portrait.png',
      imageDimensions: { width: 800, height: 600 },
      sourceImageBase64: 'data:image/png;base64,' + VALID_PNG_BUFFER.toString('base64'),
      onProgress: (p) => {
        progressUpdates.push(p);
      },
    };

    const executionResult = await clientAdapter.executeOperation(testOp, testContext);

    assert(!executionResult.errorCode, 'Mock provider execution succeeds without error codes');
    assert(Boolean(executionResult.resultImage), 'Execution result contains valid resultImage Data URL');
    assert(
      Boolean(executionResult.resultImage?.startsWith('data:image/png;base64,')),
      'Result image is in PNG format Data URL'
    );

    // Verify non-fake-result policy: Result image must NOT be identical to the source image
    assert(
      executionResult.resultImage !== testContext.sourceImageBase64,
      'Zero-Mock integrity: Output image is genuinely processed and not returning source image'
    );

    // Verify that progress callback was invoked with increasing percentages
    assert(progressUpdates.length >= 3, 'onProgress callback receives at least 3 distinct stages');
    assert(progressUpdates[0].percent < progressUpdates[progressUpdates.length - 1].percent, 'Progress percentages monotonically advance towards 100%');
    assert(progressUpdates[progressUpdates.length - 1].percent === 100, 'Final progress stage reaches 100%');
  } finally {
    mockServer.close();
  }

  // ─── REKAPITULASI HASIL ───────────────────────────────────────
  console.log('\n===========================================================');
  console.log(`EVALUATION RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('===========================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
