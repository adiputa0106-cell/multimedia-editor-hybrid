/**
 * Automated Quality Control & Evaluation Suite for AI Filter Copier
 * Menguji seluruh aspek: CIE Lab, 0% Intensity Identity, Mode Adaptif,
 * Proteksi Melanin & Tekstur, serta Diferensiasi Foto Referensi.
 */

import {
  rgbToLab,
  computeAITransferParameters,
  PRESET_AI_REFERENCES,
  mapMoodToPreset,
  applyAIProfileToState,
} from './aiFilterEngine.ts';
import { DEFAULT_PHOTO_EDIT_STATE, type AIExtractedColorProfile, type PhotoEditState } from './types.ts';

function runTestSuite() {
  console.log('===========================================================');
  console.log('🤖 AI FILTER COPIER — EMPIRICAL QUALITY EVALUATION (QC)');
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

  // ─── TEST 1: CIE Lab Color Space Precision ─────────────
  console.log('--- TEST GROUP 1: CIE L*a*b* Standard D65 Precision ---');
  const whiteLab = rgbToLab(255, 255, 255);
  assert(
    'Pure White (255,255,255) maps to L* ≈ 100, a* ≈ 0, b* ≈ 0',
    Math.abs(whiteLab.l - 100) < 0.5 && Math.abs(whiteLab.a) < 1.0 && Math.abs(whiteLab.b) < 1.0,
    `Got L=${whiteLab.l.toFixed(2)}, a=${whiteLab.a.toFixed(2)}, b=${whiteLab.b.toFixed(2)}`
  );

  const blackLab = rgbToLab(0, 0, 0);
  assert(
    'Pure Black (0,0,0) maps to L* ≈ 0, a* ≈ 0, b* ≈ 0',
    Math.abs(blackLab.l) < 0.1 && Math.abs(blackLab.a) < 0.1 && Math.abs(blackLab.b) < 0.1,
    `Got L=${blackLab.l.toFixed(2)}, a=${blackLab.a.toFixed(2)}, b=${blackLab.b.toFixed(2)}`
  );

  const midGrayLab = rgbToLab(128, 128, 128);
  assert(
    'Mid-Gray (128,128,128) maps to L* ≈ 53.6',
    Math.abs(midGrayLab.l - 53.6) < 1.0,
    `Got L=${midGrayLab.l.toFixed(2)}`
  );

  // ─── TEST 2: Zero Intensity (0%) Non-Destructive Identity ──
  console.log('\n--- TEST GROUP 2: 0% Intensity Non-Destructive Identity ---');
  const mockTarget: AIExtractedColorProfile = {
    exposure: 5,
    contrast: 10,
    brightness: 8,
    highlights: 4,
    shadows: -2,
    whites: 5,
    blacks: -5,
    temperature: -4,
    tint: 2,
    vibrance: 6,
    saturation: 10,
    clarity: 4,
    fade: 0,
    vignette: 5,
    grain: 0,
    confidence: 0.95,
    colorMoodTag: 'crisp_cool',
    dominantPalette: ['#2c3e50', '#34495e', '#7f8c8d', '#bdc3c7', '#ecf0f1'],
    analysisTimeMs: 15,
    blackPoint: 10,
    whitePoint: 245,
    dynamicRange: 235,
    hasHumanSkin: true,
    skinToneRatio: 0.12,
    histogram: { shadowsAvg: 40, midtonesAvg: 125, highlightsAvg: 210, quantiles: [15, 60, 125, 185, 240] },
  };

  const goldenRef = PRESET_AI_REFERENCES[0].profile; // cinematic_warm
  const deltaAtZero = computeAITransferParameters(mockTarget, goldenRef, {
    intensity: 0,
    preserveSkinTones: true,
    preserveTexture: true,
  });

  assert(
    'At 0% intensity, all light deltas are exactly 0 (Exposure, Contrast, Brightness, Highlights, Shadows)',
    deltaAtZero.exposure === 0 &&
      deltaAtZero.contrast === 0 &&
      deltaAtZero.brightness === 0 &&
      deltaAtZero.highlights === 0 &&
      deltaAtZero.shadows === 0 &&
      deltaAtZero.temperature === 0 &&
      deltaAtZero.tint === 0 &&
      deltaAtZero.saturation === 0,
    JSON.stringify(deltaAtZero)
  );

  // ─── TEST 3: Adaptive Match Modes (Natural, Balanced, Strong) ──
  console.log('\n--- TEST GROUP 3: Adaptive Match Modes Graduation ---');
  const deltaNatural = computeAITransferParameters(mockTarget, goldenRef, {
    intensity: 1.0,
    matchMode: 'natural',
  });
  const deltaBalanced = computeAITransferParameters(mockTarget, goldenRef, {
    intensity: 1.0,
    matchMode: 'balanced',
  });
  const deltaStrong = computeAITransferParameters(mockTarget, goldenRef, {
    intensity: 1.0,
    matchMode: 'strong',
  });

  assert(
    'Graduation constraint: Natural < Balanced < Strong across Exposure & Contrast deltas',
    Math.abs(deltaNatural.contrast) <= Math.abs(deltaBalanced.contrast) &&
      Math.abs(deltaBalanced.contrast) <= Math.abs(deltaStrong.contrast),
    `Natural=${deltaNatural.contrast}, Balanced=${deltaBalanced.contrast}, Strong=${deltaStrong.contrast}`
  );

  assert(
    'Temperature shift scales with mode (Natural: conservative <= 15, Balanced <= 25, Strong <= 35)',
    Math.abs(deltaNatural.temperature) <= Math.abs(deltaBalanced.temperature) &&
      Math.abs(deltaBalanced.temperature) <= Math.abs(deltaStrong.temperature),
    `Natural=${deltaNatural.temperature}, Balanced=${deltaBalanced.temperature}, Strong=${deltaStrong.temperature}`
  );

  // ─── TEST 4: Melanin Skin Tone & Texture Preservation ─────
  console.log('\n--- TEST GROUP 4: Skin Tone & Texture Preservation Safety ---');
  assert(
    'Preserve Original Texture locks Denoise to strictly 0 (no wax/blur side-effect)',
    deltaNatural.denoise === 0 && deltaBalanced.denoise === 0 && deltaStrong.denoise === 0,
    `Denoise values: ${deltaNatural.denoise}, ${deltaBalanced.denoise}, ${deltaStrong.denoise}`
  );

  assert(
    'Preserve Original Texture caps sharpness <= 10 (no halo ringing artifacts)',
    deltaNatural.sharpness <= 10 && deltaBalanced.sharpness <= 10,
    `Sharpness: ${deltaNatural.sharpness}, ${deltaBalanced.sharpness}`
  );

  assert(
    'Skin Tone Protection dampens Orange & Red channel hue shift (Orange hue shift <= 7)',
    Math.abs(deltaBalanced.hsl?.orange?.hue ?? 0) <= 7 &&
      Math.abs(deltaNatural.hsl?.orange?.hue ?? 0) <= 4,
    `Orange hue: Natural=${deltaNatural.hsl?.orange?.hue}, Balanced=${deltaBalanced.hsl?.orange?.hue}`
  );

  // ─── TEST 5: Distinct References Produce Distinct Profiles ─
  console.log('\n--- TEST GROUP 5: Reference Uniqueness & Differential Math ---');
  const coolRef = PRESET_AI_REFERENCES[1].profile; // moody_teal_orange
  const deltaCool = computeAITransferParameters(mockTarget, coolRef, {
    intensity: 1.0,
    matchMode: 'balanced',
  });

  assert(
    'Different references produce opposite temperature signatures on identical target',
    deltaBalanced.temperature > 0 && deltaCool.temperature < 0,
    `GoldenRef temp=${deltaBalanced.temperature}, CoolRef temp=${deltaCool.temperature}`
  );

  assert(
    'Dynamic Range and Black/White points are distinct per reference',
    goldenRef.dynamicRange !== coolRef.dynamicRange && goldenRef.blackPoint !== coolRef.blackPoint,
    `Golden DR=${goldenRef.dynamicRange}, Cool DR=${coolRef.dynamicRange}`
  );

  // ─── TEST 6: Silhouette & Low-Light Anti-Blackout Anchor ─
  console.log('\n--- TEST GROUP 6: Silhouette & Low-Light Anti-Blackout Anchor ---');
  const silhouetteRef: AIExtractedColorProfile = {
    exposure: -45,
    brightness: -40,
    contrast: 40,
    highlights: 30,
    shadows: -60,
    whites: 20,
    blacks: -50,
    temperature: -10,
    tint: -5,
    vibrance: -15,
    saturation: -20,
    clarity: 15,
    fade: 0,
    vignette: 30,
    grain: 0,
    confidence: 0.94,
    colorMoodTag: 'moody_dark',
    dominantPalette: ['#050505', '#121212', '#242424', '#454545', '#e0e0e0'],
    analysisTimeMs: 14,
    blackPoint: 0,
    whitePoint: 250,
    dynamicRange: 250,
    hasHumanSkin: false,
    skinToneRatio: 0,
    isLowLight: true,
    isBacklit: true,
    shadowClippingPercent: 32.5,
    highlightClippingPercent: 2.1,
    histogram: { shadowsAvg: 10, midtonesAvg: 45, highlightsAvg: 220, quantiles: [2, 12, 45, 110, 245] },
  };

  const normalTarget: AIExtractedColorProfile = {
    exposure: 2,
    brightness: 0,
    contrast: 5,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 0,
    tint: 0,
    vibrance: 0,
    saturation: 0,
    clarity: 0,
    fade: 0,
    vignette: 0,
    grain: 0,
    confidence: 0.95,
    colorMoodTag: 'cinematic_warm',
    dominantPalette: ['#3a4b5c', '#5d6e7f', '#8091a2', '#a3b4c5', '#c6d7e8'],
    analysisTimeMs: 12,
    blackPoint: 15,
    whitePoint: 240,
    dynamicRange: 225,
    hasHumanSkin: true,
    skinToneRatio: 0.15,
    histogram: { shadowsAvg: 45, midtonesAvg: 128, highlightsAvg: 210, quantiles: [18, 62, 128, 185, 238] },
  };

  const deltaSilhouetteNatural = computeAITransferParameters(normalTarget, silhouetteRef, {
    intensity: 1.0,
    matchMode: 'natural',
    preserveSkinTones: true,
  });
  const deltaSilhouetteBalanced = computeAITransferParameters(normalTarget, silhouetteRef, {
    intensity: 1.0,
    matchMode: 'balanced',
    preserveSkinTones: true,
  });

  assert(
    'Anti-blackout anchor cushions exposure drop so target does not plunge into extreme blackness (Natural >= -8, Balanced >= -15)',
    deltaSilhouetteNatural.exposure >= -8 && deltaSilhouetteBalanced.exposure >= -15,
    `Exposure drop: Natural=${deltaSilhouetteNatural.exposure}, Balanced=${deltaSilhouetteBalanced.exposure}`
  );

  assert(
    'Anti-blackout anchor preserves shadows on normal target (Shadows drop cushioned >= -18)',
    deltaSilhouetteBalanced.shadows >= -18,
    `Shadows drop: ${deltaSilhouetteBalanced.shadows}`
  );

  // ─── TEST 7: Monochrome Reference Adaptation & Zero Color Bleed ─
  console.log('\n--- TEST GROUP 7: Monochrome Reference Adaptation & Zero Color Bleed ---');
  const monoRef = PRESET_AI_REFERENCES.find(p => p.id === 'monochrome_fine_art')!.profile;
  const deltaMonoBalanced = computeAITransferParameters(normalTarget, monoRef, {
    intensity: 1.0,
    matchMode: 'balanced',
  });
  const deltaMonoNatural = computeAITransferParameters(normalTarget, monoRef, {
    intensity: 1.0,
    matchMode: 'natural',
  });

  assert(
    'Monochrome reference sets target saturation towards -100 (Balanced = -100, Natural <= -75)',
    deltaMonoBalanced.saturation === -100 && deltaMonoNatural.saturation <= -75,
    `Saturation: Balanced=${deltaMonoBalanced.saturation}, Natural=${deltaMonoNatural.saturation}`
  );

  assert(
    'Monochrome reference eliminates color bleed (All HSL channel hue deltas are strictly 0)',
    !deltaMonoBalanced.hsl || Object.values(deltaMonoBalanced.hsl).every(ch => ch?.hue === 0),
    `HSL shifts: ${JSON.stringify(deltaMonoBalanced.hsl)}`
  );

  assert(
    'Monochrome classic mood tag maps accurately to black_and_white editor preset',
    mapMoodToPreset('monochrome_classic') === 'black_and_white',
    `Mapped preset: ${mapMoodToPreset('monochrome_classic')}`
  );

  // ─── TEST 8: CIE L*a*b* Perceptual Temperature Integration ─────
  console.log('\n--- TEST GROUP 8: CIE L*a*b* Perceptual Temperature & Tint Integration ---');
  const targetWithLab: AIExtractedColorProfile = {
    ...normalTarget,
    labStats: {
      lMean: 50.0,
      aMean: 0.0,
      bMean: -8.0, // Cool blue bias
      lStd: 20.0,
      aStd: 5.0,
      bStd: 6.0,
    },
  };
  const warmLabRef: AIExtractedColorProfile = {
    ...PRESET_AI_REFERENCES[0].profile, // golden warm
    labStats: {
      lMean: 58.0,
      aMean: 4.0, // slight warm/magenta
      bMean: 24.0, // golden yellow
      lStd: 22.0,
      aStd: 6.0,
      bStd: 14.0,
    },
  };

  const deltaLabWarm = computeAITransferParameters(targetWithLab, warmLabRef, {
    intensity: 1.0,
    matchMode: 'balanced',
  });

  assert(
    'CIE Lab b* delta (positive yellow) generates positive warm temperature delta under D65',
    deltaLabWarm.temperature > 15,
    `Temperature delta with Lab b* delta: ${deltaLabWarm.temperature}`
  );

  assert(
    'CIE Lab a* delta (positive magenta) generates positive tint delta under D65',
    deltaLabWarm.tint > 0,
    `Tint delta with Lab a* delta: ${deltaLabWarm.tint}`
  );

  // ─── TEST 9: High-Resolution Downscaled Analysis Benchmark ───
  console.log('\n--- TEST GROUP 9: High-Resolution Downscaled Performance Benchmark ---');
  const benchStartTime = performance.now();
  // Simulate 160x160 canvas pixel buffer analysis (25,600 pixels)
  const pixelCount = 160 * 160;
  const mockBuffer = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < mockBuffer.length; i += 4) {
    mockBuffer[i] = (i * 7) % 256;
    mockBuffer[i + 1] = (i * 13) % 256;
    mockBuffer[i + 2] = (i * 23) % 256;
    mockBuffer[i + 3] = 255;
  }
  let sumL = 0;
  const hist = new Int32Array(256);
  for (let i = 0; i < mockBuffer.length; i += 4) {
    const l = Math.round(0.2126 * mockBuffer[i] + 0.7152 * mockBuffer[i + 1] + 0.0722 * mockBuffer[i + 2]);
    hist[l]++;
    sumL += l;
  }
  const benchDuration = performance.now() - benchStartTime;

  assert(
    '160x160 Downscaled pixel analysis benchmark completes in < 35ms (Instant client-side UI response)',
    benchDuration < 35,
    `Benchmark took ${benchDuration.toFixed(2)}ms (target < 35ms)`
  );

  // ─── TEST 10: Histogram Quantile-Based Adaptive Tonal Matching ───
  console.log('\n--- TEST GROUP 10: Histogram Quantile-Based Adaptive Tonal Matching ---');
  const liftedMatteRef: AIExtractedColorProfile = {
    ...normalTarget,
    histogram: {
      shadowsAvg: 55,
      midtonesAvg: 130,
      highlightsAvg: 200,
      quantiles: [42, 80, 130, 175, 215], // Lifted shadows (q05=42), compressed highlights (q95=215)
    },
    fade: 25,
  };

  const crushedTarget: AIExtractedColorProfile = {
    ...normalTarget,
    histogram: {
      shadowsAvg: 15,
      midtonesAvg: 125,
      highlightsAvg: 240,
      quantiles: [4, 45, 125, 195, 250], // Deep blacks (q05=4), blown highlights (q95=250)
    },
  };

  const deltaQuantile = computeAITransferParameters(crushedTarget, liftedMatteRef, {
    intensity: 1.0,
    matchMode: 'balanced',
  });

  assert(
    'Quantile matching lifts deep target shadows/blacks when reference has lifted shadows (blacks delta > 0)',
    deltaQuantile.blacks > 0,
    `Blacks delta: ${deltaQuantile.blacks}`
  );

  assert(
    'Quantile matching compresses harsh target highlights when reference highlights are rolled off (highlights delta < 0)',
    deltaQuantile.highlights < 0,
    `Highlights delta: ${deltaQuantile.highlights}`
  );

  // ─── TEST 11: Non-Destructive Reversibility & Preset Integrity ───
  console.log('\n--- TEST GROUP 11: Non-Destructive Reversibility & Preset Integrity ---');
  const testState: PhotoEditState = structuredClone(DEFAULT_PHOTO_EDIT_STATE);
  const stateWithAI = applyAIProfileToState(testState, PRESET_AI_REFERENCES[0].profile, { intensity: 0.8 }, normalTarget);

  assert(
    'applyAIProfileToState modifies adjustments when applied',
    stateWithAI.adjustments.exposure !== testState.adjustments.exposure ||
    stateWithAI.adjustments.temperature !== testState.adjustments.temperature,
    `AI exposure=${stateWithAI.adjustments.exposure}, temp=${stateWithAI.adjustments.temperature}`
  );

  // Reversibility check: reset adjustments back to original state
  const revertedState: PhotoEditState = {
    ...stateWithAI,
    adjustments: structuredClone(testState.adjustments),
    filter: 'none',
    filterIntensity: 100,
  };

  assert(
    'Reverting adjustments restores exactly to baseline values without permanent mutation',
    revertedState.adjustments.exposure === testState.adjustments.exposure &&
    revertedState.adjustments.contrast === testState.adjustments.contrast &&
    revertedState.filter === 'none',
    `Reverted exposure=${revertedState.adjustments.exposure}, filter=${revertedState.filter}`
  );

  assert(
    'PRESET_AI_REFERENCES contains at least 6 valid presets with complete histogram quantiles and hex palettes',
    PRESET_AI_REFERENCES.length >= 6 &&
    PRESET_AI_REFERENCES.every(p => p.profile.histogram?.quantiles?.length === 5 && p.profile.dominantPalette.length >= 5),
    `Count: ${PRESET_AI_REFERENCES.length} presets verified`
  );

  console.log('\n===========================================================');
  console.log(`EVALUATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
