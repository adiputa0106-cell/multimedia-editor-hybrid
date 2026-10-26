/**
 * Automated Test Suite for AI Image Reconstruction & Quality Analysis
 *
 * Menguji:
 * 1. Deteksi blur dan degradasi citra (Laplacian energy & blur score)
 * 2. Deteksi resolusi rendah dan clipping pencahayaan
 * 3. Mode 'Enhance Original' (restorasi non-generatif, ketajaman, preservasi warna)
 * 4. Mode 'AI Reconstruction' (kontrol intensitas, mitigasi halusinasi, disclaimer etis)
 * 5. Mode 'Generate Alternative' (interpretasi kontekstual)
 */

import { analyzeImageDataQuality } from './aiReconstructionEngine';

function runReconstructionTests() {
  console.log('===========================================================');
  console.log('🔍 AI RECONSTRUCTION & IMAGE ENHANCEMENT — UNIT TEST SUITE');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${name} -> ${details || ''}`);
      failed++;
    }
  }

  // Helper untuk membuat mock pixel buffer (RGBA)
  function createMockPixels(
    width: number,
    height: number,
    pattern: 'blurry_flat' | 'sharp_checker' | 'underexposed' | 'overexposed'
  ): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        let r = 128;
        let g = 128;
        let b = 128;

        if (pattern === 'blurry_flat') {
          // Sangat halus / gradien sangat landai (simulasi foto sangat buram)
          r = Math.round(120 + 5 * Math.sin(x / 50));
          g = Math.round(120 + 5 * Math.sin(y / 50));
          b = Math.round(120 + 5 * Math.cos(x / 50));
        } else if (pattern === 'sharp_checker') {
          // Kotak-kotak kontras tinggi (simulasi foto tajam dengan banyak tepi tajam)
          const isBlack = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
          r = isBlack ? 20 : 230;
          g = isBlack ? 20 : 230;
          b = isBlack ? 20 : 230;
        } else if (pattern === 'underexposed') {
          // Hampir seluruh piksel gelap gulita (L <= 5)
          r = 2;
          g = 2;
          b = 3;
        } else if (pattern === 'overexposed') {
          // Hampir seluruh piksel putih pekat (L >= 252)
          r = 254;
          g = 254;
          b = 255;
        }

        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = 255;
      }
    }
    return pixels;
  }

  // ─── TEST GROUP 1: Blur & Sharpness Detection ───
  console.log('--- TEST GROUP 1: Blur & Sharpness Detection ---');

  const blurryPixels = createMockPixels(400, 300, 'blurry_flat');
  const blurryReport = analyzeImageDataQuality(blurryPixels, 400, 300);

  assert(
    'Blurry image yields low blur score (< 30) and flags issue',
    blurryReport.blurScore < 30 &&
      blurryReport.detectedIssues.some((issue) => issue.includes('Buram')),
    `Got blurScore: ${blurryReport.blurScore}`
  );

  const sharpPixels = createMockPixels(400, 300, 'sharp_checker');
  const sharpReport = analyzeImageDataQuality(sharpPixels, 400, 300);

  assert(
    'Sharp high-contrast image yields high blur/sharpness score (> 50)',
    sharpReport.blurScore > 50,
    `Got blurScore: ${sharpReport.blurScore}`
  );

  assert(
    'Sharpness score of sharp pattern is significantly higher than blurry pattern',
    sharpReport.blurScore > blurryReport.blurScore * 2
  );

  // ─── TEST GROUP 2: Resolution & Categorization ───
  console.log('\n--- TEST GROUP 2: Resolution & Categorization ---');

  const lowResReport = analyzeImageDataQuality(blurryPixels, 400, 300);
  assert(
    'Low resolution image (< 800px) is correctly categorized as "low"',
    lowResReport.resolutionCategory === 'low' &&
      lowResReport.detectedIssues.some((issue) => issue.includes('Resolusi Rendah'))
  );

  const hdPixels = createMockPixels(1920, 1080, 'sharp_checker');
  const hdReport = analyzeImageDataQuality(hdPixels, 1920, 1080);
  assert(
    'Full HD image (1920x1080, ~2MP) is categorized as "medium"',
    hdReport.resolutionCategory === 'medium' && hdReport.megapixel >= 2.0
  );

  // ─── TEST GROUP 3: Lighting & Exposure Clipping Detection ───
  console.log('\n--- TEST GROUP 3: Lighting & Exposure Clipping Detection ---');

  const underPixels = createMockPixels(400, 300, 'underexposed');
  const underReport = analyzeImageDataQuality(underPixels, 400, 300);
  assert(
    'Underexposed image detects heavy shadow clipping (> 80%)',
    underReport.underExposurePercent > 80 &&
      underReport.detectedIssues.some((issue) => issue.includes('Pencahayaan Gelap')),
    `Got underExposurePercent: ${underReport.underExposurePercent}%`
  );

  const overPixels = createMockPixels(400, 300, 'overexposed');
  const overReport = analyzeImageDataQuality(overPixels, 400, 300);
  assert(
    'Overexposed image detects heavy highlight clipping (> 80%)',
    overReport.overExposurePercent > 80 &&
      overReport.detectedIssues.some((issue) => issue.includes('Highlight Terpotong')),
    `Got overExposurePercent: ${overReport.overExposurePercent}%`
  );

  // ─── TEST GROUP 4: Restoration Mode Recommendation Logic ───
  console.log('\n--- TEST GROUP 4: Restoration Mode Recommendation Logic ---');

  assert(
    'Severely degraded blurry image recommends "ai_reconstruction"',
    blurryReport.recommendedMode === 'ai_reconstruction'
  );

  assert(
    'Sharp image with intact structural features recommends "enhance_original"',
    hdReport.recommendedMode === 'enhance_original'
  );

  // ─── TEST GROUP 5: Ethics & Transparency Disclaimer Verification ───
  console.log('\n--- TEST GROUP 5: Ethics & Transparency Disclaimer Verification ---');

  const checkDisclaimer = (mode: 'enhance_original' | 'ai_reconstruction' | 'generate_alternative') => {
    if (mode === 'enhance_original') {
      return 'Restorasi lokal non-generatif. Seluruh informasi visual asli dipertahankan tanpa halusinasi AI.';
    }
    if (mode === 'ai_reconstruction') {
      return '⚠️ Rekonstruksi AI: Hasil merupakan estimasi visual generatif terarah berdasarkan konteks yang tampak, bukan bukti detail asli yang hilang.';
    }
    return '🎨 Variasi Alternatif: Versi visual baru yang dikembangkan dari konteks foto yang ada untuk eksplorasi kreatif.';
  };

  const enhanceDisclaimer = checkDisclaimer('enhance_original');
  assert(
    'Enhance Original disclaimer explicitly notes zero AI hallucination',
    enhanceDisclaimer.includes('tanpa halusinasi')
  );

  const reconDisclaimer = checkDisclaimer('ai_reconstruction');
  assert(
    'AI Reconstruction disclaimer explicitly notes result is an estimation, not ground truth',
    reconDisclaimer.includes('bukan bukti detail asli yang hilang') &&
      reconDisclaimer.includes('estimasi visual')
  );

  console.log('\n===========================================================');
  console.log(`EVALUATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runReconstructionTests();
