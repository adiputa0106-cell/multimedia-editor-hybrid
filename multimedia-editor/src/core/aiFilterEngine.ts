/**
 * AI Filter Copier Engine — Computer Vision & Color Style Transfer
 *
 * Menganalisis histogram piksel dan palet warna foto referensi secara lokal (client-side)
 * dan mengekstrak parameter lighting, contrast, saturation, temperature, tone curve,
 * 3-way color grading, serta proteksi warna kulit untuk disalin ke foto target.
 *
 * Prinsip:
 * 1. Non-destruktif: tidak mengganti wajah, pose, atau objek.
 * 2. Komparatif: menghitung selisih (delta) antara foto target dan foto referensi.
 * 3. Local-first: 100% diproses di browser tanpa upload ke server luar.
 */

import {
  type PhotoEditState,
  type AIExtractedColorProfile,
  type ColorMoodTag,
  type FilterId,
  type ImageAdjustments,
  type HSLColorName,
  type HSLChannelShift,
  type ColorWheelGrading,
  type ToneCurvePoints,
  type AIMatchMode,
  type LabColorStats,
  clampAdjustment,
} from './types';

export interface ApplyAIOptions {
  intensity?: number;            // 0.0 s/d 1.0 (kekuatan filter)
  matchMode?: AIMatchMode;       // 'natural' | 'balanced' | 'strong'
  includeAdjustments?: boolean;  // Brightness, Contrast, Saturation, Temp, dll.
  includeFilterPreset?: boolean; // Warm, Cool, Vintage, Dramatic, dll.
  preserveSkinTones?: boolean;   // Mencegah perubahan berlebih pada warna kulit manusia
}

/**
 * CIE XYZ to sRGB & CIE L*a*b* Perceptual Color Space Conversions (D65 standard)
 */
export function rgbToXyz(r: number, g: number, b: number): { x: number; y: number; z: number } {
  let sR = r / 255;
  let sG = g / 255;
  let sB = b / 255;

  sR = sR > 0.04045 ? ((sR + 0.055) / 1.055) ** 2.4 : sR / 12.92;
  sG = sG > 0.04045 ? ((sG + 0.055) / 1.055) ** 2.4 : sG / 12.92;
  sB = sB > 0.04045 ? ((sB + 0.055) / 1.055) ** 2.4 : sB / 12.92;

  // D65 standard reference illuminant
  const x = (sR * 0.4124564 + sG * 0.3575761 + sB * 0.1804375) / 0.95047;
  const y = (sR * 0.2126729 + sG * 0.7151522 + sB * 0.0721750) / 1.00000;
  const z = (sR * 0.0193339 + sG * 0.1191920 + sB * 0.9503041) / 1.08883;

  return { x, y, z };
}

export function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  const { x, y, z } = rgbToXyz(r, g, b);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const l = Math.max(0, 116 * fy - 16);
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);

  return { l, a, b: bVal };
}

export interface PresetAIReference {
  id: string;
  title: string;
  category: string;
  description: string;
  badge: string;
  sampleGradient: string;
  profile: AIExtractedColorProfile;
}

/**
 * Menganalisis piksel gambar sumber secara lokal via Canvas 2D
 * Mengekstrak karakteristik visual riil:
 * - Luminance histogram (256 bins) & quantiles (5th, 25th, 50th, 75th, 95th)
 * - Contrast deviasi standar, Black point, White point, Dynamic Range
 * - Suhu warna (R vs B balance), Tint (G vs Magenta), HSL saturation & vibrance
 * - 3-Way Color Grading pada Shadows, Midtones, Highlights
 * - Deteksi warna kulit manusia (Skin tone ratio)
 * - Ekstraksi 5 palet warna dominan (Color quantization)
 * - Estimasi Vignette, Fade (matte black lift), dan Film Grain
 */
export async function analyzeImageColors(
  source: HTMLImageElement | HTMLCanvasElement
): Promise<AIExtractedColorProfile> {
  const startTime = performance.now();

  // Downscale ke kanvas analisis 160x160 untuk komputasi instan (<30ms)
  const analysisW = 160;
  const analysisH = 160;
  const canvas = document.createElement('canvas');
  canvas.width = analysisW;
  canvas.height = analysisH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Canvas 2D context tidak tersedia untuk analisis AI');
  }

  ctx.drawImage(source, 0, 0, analysisW, analysisH);
  const imgData = ctx.getImageData(0, 0, analysisW, analysisH);
  const data = imgData.data;
  const totalPixels = analysisW * analysisH;

  // Histogram 256 bins
  const lumHistogram = new Int32Array(256);

  let sumL = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumSat = 0;

  let shadowCount = 0;
  let shadowSumR = 0;
  let shadowSumG = 0;
  let shadowSumB = 0;

  let midCount = 0;
  let midSumR = 0;
  let midSumG = 0;
  let midSumB = 0;

  let highlightCount = 0;
  let highlightSumR = 0;
  let highlightSumG = 0;
  let highlightSumB = 0;

  let shadowClipCount = 0;
  let highlightClipCount = 0;
  let sumLabL = 0;
  let sumLabA = 0;
  let sumLabB = 0;

  let skinPixels = 0;

  // Center vs Corner luminance for vignette estimation
  const centerX = analysisW / 2;
  const centerY = analysisH / 2;
  const cornerRadiusSq = centerX * centerX + centerY * centerY;
  let centerLumSum = 0;
  let centerPixelCount = 0;
  let cornerLumSum = 0;
  let cornerPixelCount = 0;

  // Color quantization bucket for dominant palette extraction (4-bit per channel)
  const colorBuckets = new Map<number, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Luminance Rec. 709
    const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const clampedL = Math.max(0, Math.min(255, l));
    lumHistogram[clampedL]++;

    sumL += clampedL;
    sumR += r;
    sumG += g;
    sumB += b;

    // Shadow & Highlight Clipping metrics
    if (clampedL <= 2) shadowClipCount++;
    if (clampedL >= 253) highlightClipCount++;

    // CIE Lab accumulator
    const lab = rgbToLab(r, g, b);
    sumLabL += lab.l;
    sumLabA += lab.a;
    sumLabB += lab.b;

    // Split Toning regions (Shadows: < 85, Midtones: 85-170, Highlights: > 170)
    if (clampedL < 85) {
      shadowCount++;
      shadowSumR += r;
      shadowSumG += g;
      shadowSumB += b;
    } else if (clampedL > 170) {
      highlightCount++;
      highlightSumR += r;
      highlightSumG += g;
      highlightSumB += b;
    } else {
      midCount++;
      midSumR += r;
      midSumG += g;
      midSumB += b;
    }

    // RGB to HSL saturation & hue calculation
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const light = (max + min) / 2;
    const d = max - min;
    const sat = light === 0 || light === 1 || d === 0 ? 0 : d / (1 - Math.abs(2 * light - 1));
    sumSat += sat;

    let hDeg = 0;
    if (d > 0.02) {
      if (max === r / 255) hDeg = (((g - b) / 255 / d) + (g < b ? 6 : 0)) * 60;
      else if (max === g / 255) hDeg = (((b - r) / 255 / d) + 2) * 60;
      else hDeg = (((r - g) / 255 / d) + 4) * 60;
    }

    // Multi-ethnic skin tone detection (Fitzpatrick types I to VI)
    // 1. Peer et al. condition in RGB
    const isPeerSkin =
      r > 95 &&
      g > 40 &&
      b > 20 &&
      r > g &&
      r > b &&
      r - Math.min(g, b) > 15 &&
      Math.abs(r - g) > 15;

    // 2. Chai & Ngan YCbCr condition (robust across fair, olive, and deep melanin skin)
    const cbVal = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const crVal = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const isYCbCrSkin = cbVal >= 77 && cbVal <= 127 && crVal >= 133 && crVal <= 173;

    // 3. HSV hue condition for skin tone bounds
    const isHsvSkin = light > 0.15 && light < 0.92 && sat > 0.10 && ((hDeg >= 0 && hDeg <= 42) || hDeg >= 335);

    if (isPeerSkin || (isYCbCrSkin && isHsvSkin)) {
      skinPixels++;
    }

    // Center vs Edge calculation for vignette
    const px = (i / 4) % analysisW;
    const py = Math.floor(i / 4 / analysisW);
    const distSq = (px - centerX) ** 2 + (py - centerY) ** 2;
    if (distSq < cornerRadiusSq * 0.25) {
      centerLumSum += clampedL;
      centerPixelCount++;
    } else if (distSq > cornerRadiusSq * 0.65) {
      cornerLumSum += clampedL;
      cornerPixelCount++;
    }

    // Bucket into 4-bit (16 levels per channel)
    const br = Math.floor(r / 16);
    const bg = Math.floor(g / 16);
    const bb = Math.floor(b / 16);
    const key = (br << 8) | (bg << 4) | bb;

    const existing = colorBuckets.get(key);
    if (existing) {
      existing.count++;
      existing.r += r;
      existing.g += g;
      existing.b += b;
    } else {
      colorBuckets.set(key, { count: 1, r, g, b });
    }
  }

  const meanL = sumL / totalPixels;
  const meanR = sumR / totalPixels;
  const meanG = sumG / totalPixels;
  const meanB = sumB / totalPixels;
  const meanSat = sumSat / totalPixels;

  // Hitung quantiles dari histogram kumulatif (5th, 25th, 50th, 75th, 95th)
  let cumulative = 0;
  let q05 = 0,
    q25 = 0,
    q50 = 0,
    q75 = 0,
    q95 = 0;
  const p05Count = totalPixels * 0.05;
  const p25Count = totalPixels * 0.25;
  const p50Count = totalPixels * 0.50;
  const p75Count = totalPixels * 0.75;
  const p95Count = totalPixels * 0.95;

  let blackPoint = 0;
  let whitePoint = 255;
  let foundBp = false;

  for (let val = 0; val < 256; val++) {
    cumulative += lumHistogram[val];
    if (!foundBp && cumulative > totalPixels * 0.01) {
      blackPoint = val;
      foundBp = true;
    }
    if (cumulative < totalPixels * 0.99) {
      whitePoint = val;
    }
    if (q05 === 0 && cumulative >= p05Count) q05 = val;
    if (q25 === 0 && cumulative >= p25Count) q25 = val;
    if (q50 === 0 && cumulative >= p50Count) q50 = val;
    if (q75 === 0 && cumulative >= p75Count) q75 = val;
    if (q95 === 0 && cumulative >= p95Count) q95 = val;
  }

  const dynamicRange = Math.max(10, whitePoint - blackPoint);

  // Deviasi standar luminansi untuk Kontras riil
  let sumVarL = 0;
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sumVarL += (l - meanL) ** 2;
  }
  const stdL = Math.sqrt(sumVarL / totalPixels);

  // Estimasi Fade (Matte blacks): jika black point > 14 atau q05 > 20, foto memiliki lifted blacks
  const rawFade = Math.max(0, Math.min(100, Math.round((q05 - 10) * 3.2)));

  // Estimasi Vignette dari perbandingan pusat vs sudut
  const centerLum = centerPixelCount ? centerLumSum / centerPixelCount : meanL;
  const cornerLum = cornerPixelCount ? cornerLumSum / cornerPixelCount : meanL;
  const vignetteRatio = centerLum > 10 ? (centerLum - cornerLum) / centerLum : 0;
  const rawVignette = Math.max(-50, Math.min(80, Math.round(vignetteRatio * 120)));

  // Ekstraksi 3-Way Color Grading Hue, Saturation & Luminance
  const calcWheel = (rSum: number, gSum: number, bSum: number, count: number, expectedLum: number): ColorWheelGrading => {
    if (!count) return { hue: 0, saturation: 0, luminance: 0 };
    const avgR = rSum / count;
    const avgG = gSum / count;
    const avgB = bSum / count;
    const actualLum = 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB;
    const lumDiff = Math.round(((actualLum - expectedLum) / 128) * 100);
    const max = Math.max(avgR, avgG, avgB);
    const min = Math.min(avgR, avgG, avgB);
    const d = max - min;
    let hue = 0;
    if (d > 0) {
      if (max === avgR) {
        hue = ((avgG - avgB) / d + (avgG < avgB ? 6 : 0)) * 60;
      } else if (max === avgG) {
        hue = ((avgB - avgR) / d + 2) * 60;
      } else {
        hue = ((avgR - avgG) / d + 4) * 60;
      }
    }
    const saturation = max === 0 ? 0 : Math.round((d / 255) * 100 * 2.0);
    return {
      hue: Math.round(hue),
      saturation: Math.min(100, saturation),
      luminance: Math.max(-100, Math.min(100, lumDiff)),
    };
  };

  const gradingShadows = calcWheel(shadowSumR, shadowSumG, shadowSumB, shadowCount, 40);
  const gradingMidtones = calcWheel(midSumR, midSumG, midSumB, midCount, 128);
  const gradingHighlights = calcWheel(highlightSumR, highlightSumG, highlightSumB, highlightCount, 215);

  // Estimasi Tone Curve S-Curve / Rolloff dari histogram quantiles
  const tcShadows = Math.round(((q25 - 64) / 64) * 60);
  const tcMidtones = Math.round(((q50 - 128) / 128) * 50);
  const tcHighlights = Math.round(((q75 - 192) / 64) * 60);
  const toneCurve: ToneCurvePoints = {
    shadows: Math.max(-100, Math.min(100, tcShadows)),
    midtones: Math.max(-100, Math.min(100, tcMidtones)),
    highlights: Math.max(-100, Math.min(100, tcHighlights)),
  };

  // Ekstraksi 8-Channel HSL Profil
  const hslChannelsMap: Partial<Record<HSLColorName, HSLChannelShift>> = {};
  const channelNames: HSLColorName[] = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
  
  // Analisis sampling untuk 8 channel HSL
  const channelCounts: Record<HSLColorName, { count: number; sumSat: number; sumLum: number; sumHueDelta: number }> = {
    red: { count: 0, sumSat: 0, sumLum: 0, sumHueDelta: 0 },
    orange: { count: 0, sumSat: 0, sumLum: 0, sumHueDelta: 0 },
    yellow: { count: 0, sumSat: 0, sumLum: 0, sumHueDelta: 0 },
    green: { count: 0, sumSat: 0, sumLum: 0, sumHueDelta: 0 },
    aqua: { count: 0, sumSat: 0, sumLum: 0, sumHueDelta: 0 },
    blue: { count: 0, sumSat: 0, sumLum: 0, sumHueDelta: 0 },
    purple: { count: 0, sumSat: 0, sumLum: 0, sumHueDelta: 0 },
    magenta: { count: 0, sumSat: 0, sumLum: 0, sumHueDelta: 0 },
  };

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);
    const delta = maxVal - minVal;
    if (delta > 12) {
      let h = 0;
      if (maxVal === r) h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
      else if (maxVal === g) h = ((b - r) / delta + 2) * 60;
      else h = ((r - g) / delta + 4) * 60;

      const sat = delta / 255;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

      let cName: HSLColorName = 'red';
      let centerH = 0;
      if (h >= 15 && h < 45) { cName = 'orange'; centerH = 30; }
      else if (h >= 45 && h < 75) { cName = 'yellow'; centerH = 60; }
      else if (h >= 75 && h < 150) { cName = 'green'; centerH = 112; }
      else if (h >= 150 && h < 200) { cName = 'aqua'; centerH = 175; }
      else if (h >= 200 && h < 265) { cName = 'blue'; centerH = 232; }
      else if (h >= 265 && h < 315) { cName = 'purple'; centerH = 290; }
      else if (h >= 315 && h < 345) { cName = 'magenta'; centerH = 330; }

      channelCounts[cName].count++;
      channelCounts[cName].sumSat += sat;
      channelCounts[cName].sumLum += lum;
      channelCounts[cName].sumHueDelta += (h - centerH);
    }
  }

  for (const cName of channelNames) {
    const info = channelCounts[cName];
    if (info.count > totalPixels * 0.005) {
      const avgSat = info.sumSat / info.count;
      const avgLum = info.sumLum / info.count;
      const avgHueDelta = info.sumHueDelta / info.count;
      hslChannelsMap[cName] = {
        hue: Math.max(-100, Math.min(100, Math.round(avgHueDelta * 2.5))),
        saturation: Math.max(-100, Math.min(100, Math.round((avgSat - 0.45) * 120))),
        luminance: Math.max(-100, Math.min(100, Math.round((avgLum - 0.5) * 100))),
      };
    }
  }

  // Parameter penyesuaian dasar
  const rawBrightness = Math.round(((meanL - 128) / 128) * 85);
  const rawContrast = Math.round(((stdL - 50) / 50) * 95);
  const rawSaturation = Math.round(((meanSat - 0.35) / 0.35) * 85);
  const rawTemp = Math.round(((meanR - meanB) / 128) * 100);
  const rawTint = Math.round(((meanG - (meanR + meanB) / 2) / 128) * 80);

  const shadowRatio = shadowCount / totalPixels;
  const highlightRatio = highlightCount / totalPixels;
  const highlights = Math.round((highlightRatio - 0.15) * 95);
  const shadows = Math.round((0.15 - shadowRatio) * 95);

  const whites = Math.round(((q95 - 225) / 30) * 65);
  const blacks = Math.round(((25 - q05) / 25) * 65);

  const skinToneRatio = skinPixels / totalPixels;
  const hasHumanSkin = skinToneRatio > 0.035;

  // Ekstrak 5 warna teratas paling dominan
  const sortedBuckets = Array.from(colorBuckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);

  const dominantPalette: string[] = [];
  for (const bucket of sortedBuckets) {
    if (dominantPalette.length >= 5) break;
    const avgR = Math.round(bucket.r / bucket.count);
    const avgG = Math.round(bucket.g / bucket.count);
    const avgB = Math.round(bucket.b / bucket.count);
    const hex = rgbToHex(avgR, avgG, avgB);

    const isDistinct = dominantPalette.every((existingHex) => {
      const existingRgb = hexToRgb(existingHex);
      const diff =
        Math.abs(existingRgb.r - avgR) +
        Math.abs(existingRgb.g - avgG) +
        Math.abs(existingRgb.b - avgB);
      return diff > 45;
    });

    if (isDistinct || dominantPalette.length === 0) {
      dominantPalette.push(hex);
    }
  }

  while (dominantPalette.length < 5) {
    dominantPalette.push('#4a5568');
  }

  // 11. Deteksi Karakteristik Scene: Monokrom, Low-Light, High-Key, Backlight
  const isMonochrome =
    meanSat < 0.04 ||
    (Math.abs(meanR - meanG) < 3.5 &&
      Math.abs(meanG - meanB) < 3.5 &&
      Math.abs(meanR - meanB) < 3.5);
  const isLowLight = q50 < 55 && meanL < 65;
  const isHighKey = q50 > 180 && q25 > 140;
  const isBacklit =
    dynamicRange > 180 &&
    q95 > 235 &&
    (q25 < 45 || shadowClipCount > totalPixels * 0.15);

  // Klasifikasi Mood Berdasarkan Ekstraksi Spektral
  let colorMoodTag: ColorMoodTag = 'cinematic_warm';

  if (isMonochrome) {
    colorMoodTag = 'monochrome_classic';
  } else if (meanSat < 0.12 || (meanL < 90 && shadowCount > totalPixels * 0.4)) {
    colorMoodTag = 'moody_dark';
  } else if ((rawFade > 16 || q05 > 24) && rawTemp > -10) {
    colorMoodTag = 'faded_vintage';
  } else if (
    channelCounts.magenta.count + channelCounts.purple.count > totalPixels * 0.04 ||
    (rawContrast > 28 && rawSaturation > 28 && meanL < 115)
  ) {
    colorMoodTag = 'cyberpunk_neon';
  } else if (rawContrast > 24 || stdL > 64) {
    colorMoodTag = 'dramatic_contrast';
  } else if (channelCounts.green.count > totalPixels * 0.07 || rawSaturation > 22) {
    colorMoodTag = 'vibrant_nature';
  } else if (rawTemp > 10) {
    colorMoodTag = 'cinematic_warm';
  } else if (rawTemp < -8) {
    colorMoodTag = 'crisp_cool';
  } else {
    colorMoodTag = rawTemp >= 0 ? 'cinematic_warm' : 'crisp_cool';
  }

  const confidence = Math.min(0.99, Math.max(0.88, 0.92 + (stdL / 255) * 0.08));
  const analysisTimeMs = Math.round(performance.now() - startTime);

  // Compute CIE Lab statistics (mean & standard deviation across sample)
  const meanLabL = sumLabL / totalPixels;
  const meanLabA = sumLabA / totalPixels;
  const meanLabB = sumLabB / totalPixels;

  let varLabL = 0;
  let varLabA = 0;
  let varLabB = 0;
  const step = 16;
  let labSamples = 0;
  for (let i = 0; i < data.length; i += step) {
    const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
    varLabL += (lab.l - meanLabL) ** 2;
    varLabA += (lab.a - meanLabA) ** 2;
    varLabB += (lab.b - meanLabB) ** 2;
    labSamples++;
  }
  const labStats: LabColorStats = {
    lMean: Math.round(meanLabL * 10) / 10,
    aMean: Math.round(meanLabA * 10) / 10,
    bMean: Math.round(meanLabB * 10) / 10,
    lStd: Math.round(Math.sqrt(varLabL / labSamples) * 10) / 10,
    aStd: Math.round(Math.sqrt(varLabA / labSamples) * 10) / 10,
    bStd: Math.round(Math.sqrt(varLabB / labSamples) * 10) / 10,
  };

  const shadowClippingPercent = Math.round((shadowClipCount / totalPixels) * 1000) / 10;
  const highlightClippingPercent = Math.round((highlightClipCount / totalPixels) * 1000) / 10;

  return {
    brightness: clampAdjustment(rawBrightness),
    contrast: clampAdjustment(rawContrast),
    saturation: clampAdjustment(rawSaturation),
    temperature: clampAdjustment(rawTemp),
    tint: clampAdjustment(rawTint),
    exposure: clampAdjustment(Math.round(rawBrightness * 0.75)),
    highlights: clampAdjustment(highlights),
    shadows: clampAdjustment(shadows),
    whites: clampAdjustment(whites),
    blacks: clampAdjustment(blacks),
    vibrance: clampAdjustment(Math.round(rawSaturation * 0.85)),
    clarity: clampAdjustment(Math.round(rawContrast * 0.4)),
    fade: rawFade,
    vignette: rawVignette,
    grain: rawFade > 15 ? 18 : 0,
    confidence: Number(confidence.toFixed(2)),
    colorMoodTag,
    dominantPalette,
    analysisTimeMs,
    blackPoint,
    whitePoint,
    dynamicRange,
    hasHumanSkin,
    skinToneRatio: Number(skinToneRatio.toFixed(3)),
    shadowClippingPercent,
    highlightClippingPercent,
    isMonochrome,
    isLowLight,
    isHighKey,
    isBacklit,
    perceivedWarmthLab: labStats.bMean,
    perceivedTintLab: labStats.aMean,
    labStats,
    histogram: {
      shadowsAvg: shadowCount ? Math.round(shadowSumR / shadowCount) : 40,
      midtonesAvg: midCount ? Math.round(midSumR / midCount) : 128,
      highlightsAvg: highlightCount ? Math.round(highlightSumR / highlightCount) : 210,
      quantiles: [q05, q25, q50, q75, q95],
    },
    gradingShadows,
    gradingMidtones,
    gradingHighlights,
    toneCurve,
    hslChannels: hslChannelsMap,
  };
}

export interface AITransferOptions {
  intensity?: number;
  matchMode?: AIMatchMode;           // 'natural' | 'balanced' | 'strong'
  preserveSkinTones?: boolean;       // Preserve Facial Identity & Complexion
  preserveTexture?: boolean;         // Preserve Original Texture (locks denoise=0, caps sharpness & clarity)
  preserveBodyShape?: boolean;       // Preserve Body Shape (strict 1:1 isometric mapping, 0 warp)
  skinSmoothing?: boolean;           // Skin Smoothing (default: false, no blur)
  faceRetouching?: boolean;          // Face Retouching (default: false, no blemish deletion)
  bodyReshaping?: boolean;           // Body Reshaping (default: false, no liquefy)
  generativeReconstruction?: boolean;// Generative Reconstruction (strictly false, pure deterministic color math)
}

/**
 * MENGHITUNG PENYESUAIAN TRANSFER (DIFFERENTIAL MATCHING TINGKAT TINGGI)
 *
 * Mengkloning visual signature foto referensi secara non-destruktif ke foto target:
 * - Exposure, Brightness, Contrast & Dynamic Range
 * - 3-Way Split Toning (Shadows tint, Midtones tint, Highlights tint)
 * - 8-Channel HSL Color Matching (Foliage green, Sky cyan/blue, Earth yellow)
 * - Tone Curve S-Curve, Rolloff & Fade (Matte blacks) + Channel Curves (Red, Green, Blue)
 * - Mode Adaptif: Natural Match (55%), Balanced Match (85%), Strong Match (100%)
 * - Proteksi tekstur asli (Preserve Original Texture: lock denoise=0, limit sharpness)
 * - Proteksi identitas wajah dan bentuk tubuh (Preserve Facial Identity & Body Shape)
 */
export function computeAITransferParameters(
  targetProfile: AIExtractedColorProfile,
  referenceProfile: AIExtractedColorProfile,
  intensityOrOptions: number | AITransferOptions = 1.0,
  preserveSkinTonesLegacy: boolean = true,
  extraOptions?: Partial<AITransferOptions>
): ImageAdjustments {
  let intensity = 1.0;
  let matchMode: AIMatchMode = 'balanced';
  let preserveSkinTones = true;
  let preserveTexture = true;
  let preserveBodyShape = true;
  let skinSmoothing = false;
  let faceRetouching = false;
  let bodyReshaping = false;
  let generativeReconstruction = false;

  if (typeof intensityOrOptions === 'object') {
    intensity = intensityOrOptions.intensity ?? 1.0;
    matchMode = intensityOrOptions.matchMode ?? 'balanced';
    preserveSkinTones = intensityOrOptions.preserveSkinTones ?? true;
    preserveTexture = intensityOrOptions.preserveTexture ?? true;
    preserveBodyShape = intensityOrOptions.preserveBodyShape ?? true;
    skinSmoothing = intensityOrOptions.skinSmoothing ?? false;
    faceRetouching = intensityOrOptions.faceRetouching ?? false;
    bodyReshaping = intensityOrOptions.bodyReshaping ?? false;
    generativeReconstruction = intensityOrOptions.generativeReconstruction ?? false;
  } else {
    intensity = intensityOrOptions;
    preserveSkinTones = preserveSkinTonesLegacy;
    if (extraOptions) {
      matchMode = extraOptions.matchMode ?? 'balanced';
      preserveTexture = extraOptions.preserveTexture ?? true;
      preserveBodyShape = extraOptions.preserveBodyShape ?? true;
      skinSmoothing = extraOptions.skinSmoothing ?? false;
      faceRetouching = extraOptions.faceRetouching ?? false;
      bodyReshaping = extraOptions.bodyReshaping ?? false;
      generativeReconstruction = extraOptions.generativeReconstruction ?? false;
    }
  }

  // Enforce zero-tolerance non-destructive constraints
  if (!preserveBodyShape || faceRetouching || bodyReshaping || generativeReconstruction) {
    console.info('[AI Copier] Non-destructive pixel mode active: generative warping and geometric morphing remain strictly disabled.');
  }

  // Adaptive Mode Scaling Factors:
  // - natural: 0.55 (konservatif, proteksi ketat foto target)
  // - balanced: 0.85 (seimbang, standar grading profesional)
  // - strong: 1.00 (penuh, karakteristik estetika referensi maksimal)
  const modeScaleFactor = matchMode === 'natural' ? 0.55 : matchMode === 'strong' ? 1.0 : 0.85;

  const scale = (val: number, maxShift: number = 80) =>
    Math.max(-maxShift, Math.min(maxShift, Math.round(val * intensity * modeScaleFactor)));

  // Deteksi foto referensi monokromatik
  const isRefMonochrome = Boolean(
    referenceProfile.isMonochrome ||
    referenceProfile.colorMoodTag === 'monochrome_classic' ||
    referenceProfile.saturation <= -90
  );

  // 1. Pencahayaan & Kontras Diferensial (Anti-Blackout & Key Light Anchoring)
  // Menyalin style warna & tone referensi secara non-destruktif tanpa merusak pencahayaan subjek asli
  let rawExposureDiff = (referenceProfile.exposure - targetProfile.exposure) * 0.45;
  let rawBrightnessDiff = (referenceProfile.brightness - targetProfile.brightness) * 0.35;
  let rawContrastDiff = (referenceProfile.contrast - targetProfile.contrast) * 0.55;

  let rawHighlightsDiff = (referenceProfile.highlights - targetProfile.highlights) * 0.50;
  let rawShadowsDiff = (referenceProfile.shadows - targetProfile.shadows) * 0.45;
  let rawWhitesDiff = (referenceProfile.whites - targetProfile.whites) * 0.40;
  let rawBlacksDiff = (referenceProfile.blacks - targetProfile.blacks) * 0.35;

  // 3. Histogram Quantile Matching & Penyesuaian Tonal Adaptif
  const refQ = referenceProfile.histogram?.quantiles;
  const tgtQ = targetProfile.histogram?.quantiles;
  if (refQ && tgtQ && refQ.length === 5 && tgtQ.length === 5) {
    const qBlacksDelta = (refQ[0] - tgtQ[0]) * 0.392;
    const qShadowsDelta = (refQ[1] - tgtQ[1]) * 0.392;
    const qMidDelta = (refQ[2] - tgtQ[2]) * 0.392;
    const qHighlightsDelta = (refQ[3] - tgtQ[3]) * 0.392;
    const qWhitesDelta = (refQ[4] - tgtQ[4]) * 0.392;

    rawBlacksDiff = rawBlacksDiff * 0.65 + qBlacksDelta * 0.35;
    rawShadowsDiff = rawShadowsDiff * 0.65 + qShadowsDelta * 0.35;
    rawExposureDiff = rawExposureDiff * 0.65 + qMidDelta * 0.35;
    rawHighlightsDiff = rawHighlightsDiff * 0.65 + qHighlightsDelta * 0.35;
    rawWhitesDiff = rawWhitesDiff * 0.65 + qWhitesDelta * 0.35;
  }

  // Batas maksimum pemotongan cahaya gelap (Anti-Blackout Thresholds)
  let maxExposureDrop = matchMode === 'natural' ? -8 : matchMode === 'strong' ? -18 : -12;
  let maxBrightnessDrop = matchMode === 'natural' ? -6 : matchMode === 'strong' ? -14 : -10;
  let maxShadowsDrop = matchMode === 'natural' ? -10 : matchMode === 'strong' ? -20 : -14;
  let maxBlacksDrop = matchMode === 'natural' ? -6 : matchMode === 'strong' ? -14 : -10;

  // Jika foto target merupakan portrait (ada wajah/kulit manusia) atau proteksi aktif,
  // lindungi pencahayaan subjek agar wajah & tubuh tetap terlihat jelas dan natural
  if (targetProfile.hasHumanSkin || preserveSkinTones) {
    maxExposureDrop = Math.max(maxExposureDrop, -10);
    maxBrightnessDrop = Math.max(maxBrightnessDrop, -8);
    maxShadowsDrop = Math.max(maxShadowsDrop, -12);
    maxBlacksDrop = Math.max(maxBlacksDrop, -8);
  }

  // 6. Perlindungan terhadap blackout & clipping (Anti-Blackout Key Light Anchoring)
  // Menangani referensi siluet, backlight, atau low-light terhadap target yang normal
  const isRefDarkOrSilhouette = Boolean(
    referenceProfile.isLowLight ||
    referenceProfile.isBacklit ||
    (referenceProfile.shadowClippingPercent !== undefined && referenceProfile.shadowClippingPercent > 18) ||
    referenceProfile.exposure < -25 ||
    (refQ && refQ[2] < 60)
  );

  const isTargetHealthyExposure = Boolean(
    targetProfile.exposure > -15 ||
    (tgtQ ? tgtQ[2] >= 75 : true)
  );

  if (isRefDarkOrSilhouette && isTargetHealthyExposure) {
    const anchorFactor = matchMode === 'natural' ? 0.45 : matchMode === 'strong' ? 0.75 : 0.6;
    maxExposureDrop = Math.round(maxExposureDrop * anchorFactor);
    maxBrightnessDrop = Math.round(maxBrightnessDrop * anchorFactor);
    maxShadowsDrop = Math.round(maxShadowsDrop * anchorFactor);
    maxBlacksDrop = Math.round(maxBlacksDrop * anchorFactor);
  }

  // Redam penurunan cahaya berlebih jika referensi sangat gelap / siluet
  if (rawExposureDiff < maxExposureDrop) {
    rawExposureDiff = maxExposureDrop + (rawExposureDiff - maxExposureDrop) * 0.12;
  }
  if (rawBrightnessDiff < maxBrightnessDrop) {
    rawBrightnessDiff = maxBrightnessDrop + (rawBrightnessDiff - maxBrightnessDrop) * 0.12;
  }
  if (rawShadowsDiff < maxShadowsDrop) {
    rawShadowsDiff = maxShadowsDrop + (rawShadowsDiff - maxShadowsDrop) * 0.15;
  }
  if (rawBlacksDiff < maxBlacksDrop) {
    rawBlacksDiff = maxBlacksDrop + (rawBlacksDiff - maxBlacksDrop) * 0.15;
  }

  // Highlight clipping protection
  if (targetProfile.highlightClippingPercent !== undefined && targetProfile.highlightClippingPercent > 8 && rawHighlightsDiff > 0) {
    rawHighlightsDiff *= 0.35;
    rawWhitesDiff *= 0.35;
  }

  const exposureDelta = scale(rawExposureDiff, 35);
  const brightnessDelta = scale(rawBrightnessDiff, 25);
  const contrastDelta = scale(rawContrastDiff, 45);

  const highlightsDelta = scale(rawHighlightsDiff, 35);
  const shadowsDelta = scale(rawShadowsDiff, 30);
  const whitesDelta = scale(rawWhitesDiff, 25);
  const blacksDelta = scale(rawBlacksDiff, 25);

  // 2. Keseimbangan Warna (Suhu & Tint) berbasis RGB + CIE L*a*b*
  let tempDelta = (referenceProfile.temperature - targetProfile.temperature) * 0.95;
  let tintDelta = (referenceProfile.tint - targetProfile.tint) * 0.85;

  if (referenceProfile.labStats && targetProfile.labStats) {
    const labBDelta = (referenceProfile.labStats.bMean - targetProfile.labStats.bMean) * 1.4;
    const labADelta = (referenceProfile.labStats.aMean - targetProfile.labStats.aMean) * 1.4;
    tempDelta = tempDelta * 0.4 + labBDelta * 0.6;
    tintDelta = tintDelta * 0.4 + labADelta * 0.6;
  }

  // Proteksi wajah & identitas kulit (Facial Identity & Complexion Preservation)
  if (preserveSkinTones && targetProfile.hasHumanSkin) {
    const maxCool = matchMode === 'natural' ? -8 : -14;
    const maxWarm = matchMode === 'natural' ? 12 : 22;
    const maxGreen = matchMode === 'natural' ? -6 : -10;
    const maxMagenta = matchMode === 'natural' ? 10 : 15;
    const skinDamp = matchMode === 'natural' ? 0.15 : 0.32;

    if (tempDelta < maxCool) {
      tempDelta = maxCool + (tempDelta - maxCool) * skinDamp; // Redam pendinginan biru berlebih pada wajah
    } else if (tempDelta > maxWarm) {
      tempDelta = maxWarm + (tempDelta - maxWarm) * skinDamp; // Redam pemanasan berlebih agar kulit tidak over-burn
    }
    if (tintDelta < maxGreen) {
      tintDelta = maxGreen + (tintDelta - maxGreen) * skinDamp; // Redam kehijauan berlebih pada wajah
    } else if (tintDelta > maxMagenta) {
      tintDelta = maxMagenta + (tintDelta - maxMagenta) * skinDamp;
    }
  }

  const temperature = scale(tempDelta, 75);
  const tint = scale(tintDelta, 55);

  // 3. Saturasi & Vibrance (dengan adaptasi monokrom non-destruktif)
  let saturation = scale((referenceProfile.saturation - targetProfile.saturation) * 0.85, 65);
  let vibrance = scale((referenceProfile.vibrance - targetProfile.vibrance) * 0.80, 60);

  if (isRefMonochrome) {
    saturation = Math.max(-100, Math.round(-100 * intensity * (matchMode === 'natural' ? 0.75 : 1.0)));
    vibrance = Math.max(-100, Math.round(-100 * intensity * (matchMode === 'natural' ? 0.75 : 1.0)));
  }

  // 4. Efek Atmosferik & Tekstur
  const fade = Math.round(referenceProfile.fade * intensity * modeScaleFactor * 0.9);
  const vignette = Math.round(referenceProfile.vignette * intensity * modeScaleFactor * 0.85);
  
  // Grain: jika preserveTexture aktif, batasi grain sintetis agar tidak mengaburkan tekstur alami
  const grain = preserveTexture
    ? Math.min(8, Math.round(referenceProfile.grain * intensity * 0.4))
    : Math.round(referenceProfile.grain * intensity * 0.8);

  // Clarity: jika preserveTexture aktif, batasi ke rentang aman (-8 s/d +16) agar pori dan detail kain tidak rusak
  const rawClarity = scale(referenceProfile.clarity * 0.75, 45);
  const clarity = preserveTexture ? Math.max(-8, Math.min(16, rawClarity)) : rawClarity;

  // Sharpness: jika preserveTexture aktif, jaga di level natural (maks 10) tanpa halo ringing
  const sharpness = preserveTexture ? Math.min(10, Math.round(8 * intensity)) : 14;

  // Denoise: jika preserveTexture aktif atau skinSmoothing nonaktif, KUNCI 0 (jangan ada blur pori-pori kulit)
  const denoise = preserveTexture || !skinSmoothing ? 0 : 15;

  // 5. Advanced 3-Way Color Grading (Shadows, Midtones, Highlights)
  const gradingShadows: ColorWheelGrading | undefined = referenceProfile.gradingShadows
    ? {
        hue: referenceProfile.gradingShadows.hue,
        saturation: Math.min(100, Math.round(referenceProfile.gradingShadows.saturation * intensity * modeScaleFactor * 0.95)),
        luminance: referenceProfile.gradingShadows.luminance
          ? Math.round(referenceProfile.gradingShadows.luminance * intensity * modeScaleFactor * 0.75)
          : undefined,
      }
    : undefined;

  const gradingMidtones: ColorWheelGrading | undefined = referenceProfile.gradingMidtones
    ? {
        hue: referenceProfile.gradingMidtones.hue,
        saturation: Math.min(100, Math.round(referenceProfile.gradingMidtones.saturation * intensity * modeScaleFactor * 0.85)),
        luminance: referenceProfile.gradingMidtones.luminance
          ? Math.round(referenceProfile.gradingMidtones.luminance * intensity * modeScaleFactor * 0.65)
          : undefined,
      }
    : undefined;

  const gradingHighlights: ColorWheelGrading | undefined = referenceProfile.gradingHighlights
    ? {
        hue: referenceProfile.gradingHighlights.hue,
        saturation: Math.min(100, Math.round(referenceProfile.gradingHighlights.saturation * intensity * modeScaleFactor * 0.95)),
        luminance: referenceProfile.gradingHighlights.luminance
          ? Math.round(referenceProfile.gradingHighlights.luminance * intensity * modeScaleFactor * 0.75)
          : undefined,
      }
    : undefined;

  // 6. Tone Curve Transfer (Composite RGB + Individual Red, Green, Blue Channels)
  let toneCurve: ToneCurvePoints | undefined;
  if (referenceProfile.toneCurve) {
    const tcScale = (matchMode === 'natural' ? 0.5 : matchMode === 'strong' ? 0.95 : 0.75) * modeScaleFactor;

    // Estimate channel curve offsets from split-toning highlights & shadows
    let refRedCurve = referenceProfile.toneCurve.red;
    let refGreenCurve = referenceProfile.toneCurve.green;
    let refBlueCurve = referenceProfile.toneCurve.blue;

    if (refRedCurve === undefined && referenceProfile.gradingHighlights) {
      const hH = referenceProfile.gradingHighlights.hue;
      refRedCurve = Math.round((hH < 50 || hH > 310 ? 1 : -0.4) * (referenceProfile.gradingHighlights.saturation * 0.22));
    }
    if (refBlueCurve === undefined && referenceProfile.gradingShadows) {
      const sH = referenceProfile.gradingShadows.hue;
      refBlueCurve = Math.round((sH >= 175 && sH <= 265 ? 1 : -0.4) * (referenceProfile.gradingShadows.saturation * 0.22));
    }
    if (refGreenCurve === undefined && referenceProfile.gradingMidtones) {
      const mH = referenceProfile.gradingMidtones.hue;
      refGreenCurve = Math.round((mH >= 70 && mH <= 165 ? 1 : -0.4) * (referenceProfile.gradingMidtones.saturation * 0.16));
    }

    toneCurve = {
      shadows: Math.round(referenceProfile.toneCurve.shadows * intensity * tcScale),
      midtones: Math.round(referenceProfile.toneCurve.midtones * intensity * tcScale),
      highlights: Math.round(referenceProfile.toneCurve.highlights * intensity * tcScale),
      red: refRedCurve !== undefined ? Math.round(refRedCurve * intensity * tcScale) : undefined,
      green: refGreenCurve !== undefined ? Math.round(refGreenCurve * intensity * tcScale) : undefined,
      blue: refBlueCurve !== undefined ? Math.round(refBlueCurve * intensity * tcScale) : undefined,
    };
  }

  // 7. 8-Channel HSL Color Mix Transfer
  const hsl: Partial<Record<HSLColorName, HSLChannelShift>> = {};
  const channelList: HSLColorName[] = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];

  for (const cName of channelList) {
    const refShift = referenceProfile.hslChannels?.[cName];
    const tgtShift = targetProfile.hslChannels?.[cName];

    let hDelta = 0;
    let sDelta = 0;
    let lDelta = 0;

    if (isRefMonochrome) {
      // Monokrom: desaturasi bersih tanpa pergeseran warna/color bleed
      hDelta = 0;
      sDelta = Math.round(-100 * intensity * modeScaleFactor);
      lDelta = refShift ? Math.round(refShift.luminance * intensity * modeScaleFactor * 0.75) : 0;
    } else if (refShift) {
      const tgtH = tgtShift?.hue ?? 0;
      const tgtS = tgtShift?.saturation ?? 0;
      const tgtL = tgtShift?.luminance ?? 0;

      hDelta = Math.round((refShift.hue - tgtH) * intensity * modeScaleFactor * 0.85);
      sDelta = Math.round((refShift.saturation - tgtS) * intensity * modeScaleFactor * 0.85);
      lDelta = Math.round((refShift.luminance - tgtL) * intensity * modeScaleFactor * 0.75);
    } else {
      // Fallback styling berdasarkan dominant mood
      if (cName === 'green' && (referenceProfile.colorMoodTag === 'moody_dark' || referenceProfile.colorMoodTag === 'faded_vintage')) {
        hDelta = Math.round(-25 * intensity * modeScaleFactor);
        sDelta = Math.round(-30 * intensity * modeScaleFactor);
      } else if ((cName === 'blue' || cName === 'aqua') && (referenceProfile.colorMoodTag === 'dramatic_contrast' || referenceProfile.colorMoodTag === 'cinematic_warm')) {
        hDelta = Math.round(-20 * intensity * modeScaleFactor); // Ke arah teal/cyan
        sDelta = Math.round(25 * intensity * modeScaleFactor);
      }
    }

    // Proteksi ketat warna kulit dan identitas wajah pada channel Orange dan Red
    if (preserveSkinTones && targetProfile.hasHumanSkin && !isRefMonochrome) {
      const skinDamp = matchMode === 'natural' ? 0.18 : 0.32;
      if (cName === 'orange') {
        const capH = matchMode === 'natural' ? 4 : 7;
        hDelta = Math.max(-capH, Math.min(capH, Math.round(hDelta * skinDamp)));
        sDelta = Math.max(-8, Math.min(10, Math.round(sDelta * skinDamp)));
        lDelta = Math.max(-5, Math.min(8, Math.round(lDelta * skinDamp)));
      } else if (cName === 'red') {
        const capH = matchMode === 'natural' ? 5 : 8;
        hDelta = Math.max(-capH, Math.min(capH, Math.round(hDelta * skinDamp)));
        sDelta = Math.max(-10, Math.min(12, Math.round(sDelta * skinDamp)));
      }
    }

    if (hDelta !== 0 || sDelta !== 0 || lDelta !== 0) {
      hsl[cName] = {
        hue: Math.max(-100, Math.min(100, hDelta)),
        saturation: Math.max(-100, Math.min(100, sDelta)),
        luminance: Math.max(-100, Math.min(100, lDelta)),
      };
    }
  }

  return {
    exposure: exposureDelta,
    brightness: brightnessDelta,
    contrast: contrastDelta,
    highlights: highlightsDelta,
    shadows: shadowsDelta,
    whites: whitesDelta,
    blacks: blacksDelta,
    temperature,
    tint,
    saturation,
    vibrance,
    sharpness,
    clarity,
    texture: 0,
    denoise,
    dehaze: 0,
    vignette,
    grain,
    fade,
    gradingShadows,
    gradingMidtones,
    gradingHighlights,
    toneCurve,
    hsl: Object.keys(hsl).length > 0 ? hsl : undefined,
  };
}

/**
 * Pemetaan tag mood AI ke filter preset bawaan editor
 */
export function mapMoodToPreset(mood: ColorMoodTag): FilterId {
  switch (mood) {
    case 'monochrome_classic':
      return 'black_and_white';
    case 'cinematic_warm':
      return 'golden_hour';
    case 'crisp_cool':
      return 'cool_industrial';
    case 'faded_vintage':
      return 'vintage_film';
    case 'moody_dark':
      return 'moody_green';
    case 'dramatic_contrast':
      return 'teal_and_orange';
    case 'cyberpunk_neon':
      return 'cyberpunk';
    case 'vibrant_nature':
      return 'korean_clean';
    default:
      return 'none';
  }
}

/**
 * Terapkan hasil profil warna AI ke Edit State aplikasi dengan intensitas variabel
 */
export function applyAIProfileToState(
  currentState: PhotoEditState,
  profile: AIExtractedColorProfile,
  options: ApplyAIOptions = {},
  targetProfile?: AIExtractedColorProfile | null
): PhotoEditState {
  const {
    intensity = 1.0,
    includeAdjustments = true,
    includeFilterPreset = true,
    preserveSkinTones = true,
  } = options;

  let calculatedAdjustments: ImageAdjustments;

  if (targetProfile) {
    // Mode diferensial cerdas (membandingkan target vs referensi)
    calculatedAdjustments = computeAITransferParameters(
      targetProfile,
      profile,
      {
        intensity,
        matchMode: options.matchMode ?? 'balanced',
        preserveSkinTones,
      }
    );
  } else {
    // Fallback mode langsung dengan interpolasi
    const blend = (target: number) => clampAdjustment(Math.round(target * intensity));
    calculatedAdjustments = {
      exposure: blend(profile.exposure),
      brightness: blend(profile.brightness),
      contrast: blend(profile.contrast),
      highlights: blend(profile.highlights),
      shadows: blend(profile.shadows),
      whites: blend(profile.whites),
      blacks: blend(profile.blacks),
      temperature: blend(profile.temperature),
      tint: blend(profile.tint),
      saturation: blend(profile.saturation),
      vibrance: blend(profile.vibrance),
      sharpness: 10,
      clarity: blend(profile.clarity),
      texture: 0,
      denoise: 0,
      dehaze: 0,
      vignette: Math.round(profile.vignette * intensity),
      grain: Math.round(profile.grain * intensity),
      fade: Math.round(profile.fade * intensity),
      gradingShadows: profile.gradingShadows
        ? {
            hue: profile.gradingShadows.hue,
            saturation: Math.round(profile.gradingShadows.saturation * intensity),
          }
        : undefined,
      gradingMidtones: profile.gradingMidtones
        ? {
            hue: profile.gradingMidtones.hue,
            saturation: Math.round(profile.gradingMidtones.saturation * intensity),
          }
        : undefined,
      gradingHighlights: profile.gradingHighlights
        ? {
            hue: profile.gradingHighlights.hue,
            saturation: Math.round(profile.gradingHighlights.saturation * intensity),
          }
        : undefined,
    };
  }

  const nextAdjustments = includeAdjustments
    ? calculatedAdjustments
    : currentState.adjustments;

  const nextFilter: FilterId = includeFilterPreset
    ? mapMoodToPreset(profile.colorMoodTag)
    : currentState.filter;

  return {
    ...currentState,
    adjustments: nextAdjustments,
    filter: nextFilter,
    filterIntensity: Math.round(intensity * 100),
  };
}

// ─── Preset Contoh Referensi AI (Inspirasi Cepat) ──────────────────────────

export const PRESET_AI_REFERENCES: PresetAIReference[] = [
  {
    id: 'cinematic_warm',
    title: 'Cinematic Golden Hour',
    category: 'Film & Sinematik',
    description: 'Tone hangat senja dengan kontras lembut dan saturasi warna emas yang kaya.',
    badge: '🌟 Populer',
    sampleGradient: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
    profile: {
      brightness: 12,
      contrast: 22,
      saturation: 25,
      temperature: 32,
      tint: -4,
      exposure: 10,
      highlights: -15,
      shadows: 18,
      whites: 12,
      blacks: -8,
      vibrance: 20,
      clarity: 8,
      fade: 10,
      vignette: 20,
      grain: 0,
      confidence: 0.96,
      colorMoodTag: 'cinematic_warm',
      dominantPalette: ['#f4a261', '#e76f51', '#264653', '#e9c46a', '#2a9d8f'],
      analysisTimeMs: 12,
      blackPoint: 15,
      whitePoint: 242,
      dynamicRange: 227,
      hasHumanSkin: true,
      skinToneRatio: 0.08,
      histogram: {
        shadowsAvg: 45,
        midtonesAvg: 135,
        highlightsAvg: 220,
        quantiles: [22, 65, 130, 185, 238],
      },
      gradingShadows: { hue: 215, saturation: 35, luminance: -8 },
      gradingMidtones: { hue: 35, saturation: 18, luminance: 4 },
      gradingHighlights: { hue: 42, saturation: 40, luminance: 10 },
      toneCurve: { shadows: -6, midtones: 8, highlights: 12 },
      hslChannels: {
        orange: { hue: 2, saturation: 18, luminance: 6 },
        yellow: { hue: -5, saturation: 22, luminance: 8 },
        green: { hue: -15, saturation: -10, luminance: 0 },
        blue: { hue: -15, saturation: -20, luminance: -8 },
      },
    },
  },
  {
    id: 'moody_teal_orange',
    title: 'Moody Teal & Orange',
    category: 'Hollywood Blockbuster',
    description: 'Warna kulit hangat berpadu bayangan biru-teal kontras khas film layar lebar.',
    badge: '🎬 Blockbuster',
    sampleGradient: 'linear-gradient(135deg, #00b4db 0%, #0083b0 50%, #ff8c00 100%)',
    profile: {
      brightness: -6,
      contrast: 34,
      saturation: 18,
      temperature: -14,
      tint: 8,
      exposure: -5,
      highlights: -25,
      shadows: -12,
      whites: 8,
      blacks: -18,
      vibrance: 22,
      clarity: 16,
      fade: 0,
      vignette: 28,
      grain: 0,
      confidence: 0.94,
      colorMoodTag: 'dramatic_contrast',
      dominantPalette: ['#0077b6', '#d62828', '#f77f00', '#023e8a', '#fcbf49'],
      analysisTimeMs: 14,
      blackPoint: 8,
      whitePoint: 248,
      dynamicRange: 240,
      hasHumanSkin: true,
      skinToneRatio: 0.06,
      histogram: {
        shadowsAvg: 35,
        midtonesAvg: 115,
        highlightsAvg: 205,
        quantiles: [14, 52, 118, 178, 235],
      },
      gradingShadows: { hue: 195, saturation: 55, luminance: -12 },
      gradingMidtones: { hue: 25, saturation: 20, luminance: 2 },
      gradingHighlights: { hue: 35, saturation: 50, luminance: 8 },
      toneCurve: { shadows: -14, midtones: 0, highlights: 18 },
      hslChannels: {
        aqua: { hue: -15, saturation: 45, luminance: -6 },
        blue: { hue: -22, saturation: 50, luminance: -12 },
        orange: { hue: 5, saturation: 28, luminance: 6 },
        green: { hue: -35, saturation: -40, luminance: -15 },
      },
    },
  },
  {
    id: 'faded_vintage_film',
    title: '1970s Vintage Film',
    category: 'Retro Nostalgia',
    description: 'Efek matte film analog dengan bayangan sedikit terangkat dan warna pudar hangat.',
    badge: '🎞️ Retro',
    sampleGradient: 'linear-gradient(135deg, #d3cbb8 0%, #6d6027 100%)',
    profile: {
      brightness: 8,
      contrast: -15,
      saturation: -18,
      temperature: 20,
      tint: 14,
      exposure: 6,
      highlights: 12,
      shadows: 24,
      whites: -10,
      blacks: 22,
      vibrance: -10,
      clarity: -6,
      fade: 32,
      vignette: 18,
      grain: 26,
      confidence: 0.91,
      colorMoodTag: 'faded_vintage',
      dominantPalette: ['#8d7b68', '#a4907c', '#c8b6a6', '#f1dec9', '#4a4036'],
      analysisTimeMs: 15,
      blackPoint: 32,
      whitePoint: 225,
      dynamicRange: 193,
      hasHumanSkin: false,
      skinToneRatio: 0.01,
      histogram: {
        shadowsAvg: 58,
        midtonesAvg: 128,
        highlightsAvg: 198,
        quantiles: [36, 78, 128, 172, 218],
      },
      gradingShadows: { hue: 45, saturation: 25, luminance: 12 },
      gradingMidtones: { hue: 35, saturation: 10, luminance: 0 },
      gradingHighlights: { hue: 55, saturation: 20, luminance: -5 },
      toneCurve: { shadows: 24, midtones: 4, highlights: -12 },
      hslChannels: {
        red: { hue: 8, saturation: -15, luminance: 5 },
        green: { hue: 15, saturation: -25, luminance: 8 },
        blue: { hue: 10, saturation: -30, luminance: 12 },
        yellow: { hue: -5, saturation: -10, luminance: 4 },
      },
    },
  },
  {
    id: 'nordic_clean_minimal',
    title: 'Nordic Clean Minimal',
    category: 'Minimalis',
    description: 'Cahaya dingin bersih alami Skandinavia dengan kontras halus dan saturasi muted.',
    badge: '❄️ Muted',
    sampleGradient: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)',
    profile: {
      brightness: 14,
      contrast: 6,
      saturation: -22,
      temperature: -24,
      tint: -6,
      exposure: 8,
      highlights: 16,
      shadows: 14,
      whites: 16,
      blacks: 4,
      vibrance: -12,
      clarity: 10,
      fade: 8,
      vignette: 10,
      grain: 0,
      confidence: 0.93,
      colorMoodTag: 'crisp_cool',
      dominantPalette: ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#d90429'],
      analysisTimeMs: 13,
      blackPoint: 18,
      whitePoint: 246,
      dynamicRange: 228,
      hasHumanSkin: false,
      skinToneRatio: 0.02,
      histogram: {
        shadowsAvg: 48,
        midtonesAvg: 138,
        highlightsAvg: 228,
        quantiles: [26, 72, 138, 192, 242],
      },
      gradingShadows: { hue: 210, saturation: 25, luminance: 4 },
      gradingMidtones: { hue: 205, saturation: 10, luminance: 5 },
      gradingHighlights: { hue: 200, saturation: 15, luminance: 10 },
      toneCurve: { shadows: 6, midtones: 8, highlights: 12 },
      hslChannels: {
        blue: { hue: -5, saturation: -15, luminance: 15 },
        orange: { hue: 0, saturation: -10, luminance: 5 },
        green: { hue: -10, saturation: -30, luminance: 5 },
      },
    },
  },
  {
    id: 'vibrant_nature_hdr',
    title: 'Vibrant Nature HDR',
    category: 'Lanskap & Alam',
    description: 'Saturasi hijau alam yang dalam, langit biru kaya, dan rentang dinamis luas.',
    badge: '🌿 Alam',
    sampleGradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    profile: {
      brightness: 4,
      contrast: 26,
      saturation: 32,
      temperature: -8,
      tint: -14,
      exposure: 4,
      highlights: -18,
      shadows: 22,
      whites: 14,
      blacks: -12,
      vibrance: 35,
      clarity: 20,
      fade: 0,
      vignette: 14,
      grain: 0,
      confidence: 0.95,
      colorMoodTag: 'vibrant_nature',
      dominantPalette: ['#2d6a4f', '#52b788', '#d8f3dc', '#1b4332', '#74c69d'],
      analysisTimeMs: 16,
      blackPoint: 10,
      whitePoint: 245,
      dynamicRange: 235,
      hasHumanSkin: false,
      skinToneRatio: 0.01,
      histogram: {
        shadowsAvg: 42,
        midtonesAvg: 132,
        highlightsAvg: 215,
        quantiles: [18, 64, 132, 186, 240],
      },
      gradingShadows: { hue: 135, saturation: 20, luminance: -6 },
      gradingMidtones: { hue: 80, saturation: 15, luminance: 4 },
      gradingHighlights: { hue: 210, saturation: 25, luminance: 12 },
      toneCurve: { shadows: -10, midtones: 6, highlights: 16 },
      hslChannels: {
        green: { hue: 14, saturation: 42, luminance: 10 },
        yellow: { hue: 8, saturation: 28, luminance: 12 },
        blue: { hue: -10, saturation: 35, luminance: 4 },
        aqua: { hue: 5, saturation: 30, luminance: 6 },
      },
    },
  },
  {
    id: 'cyberpunk_night',
    title: 'Cyberpunk Neon Nights',
    category: 'Futuristik',
    description: 'Kontras malam kota neon: bayangan biru elektrik dan highlight magenta panas.',
    badge: '⚡ Neon',
    sampleGradient: 'linear-gradient(135deg, #ff007f 0%, #7928ca 50%, #00ffff 100%)',
    profile: {
      brightness: -12,
      contrast: 42,
      saturation: 35,
      temperature: -18,
      tint: 32,
      exposure: -8,
      highlights: 22,
      shadows: -20,
      whites: 20,
      blacks: -24,
      vibrance: 40,
      clarity: 28,
      fade: 0,
      vignette: 35,
      grain: 8,
      confidence: 0.95,
      colorMoodTag: 'cyberpunk_neon',
      dominantPalette: ['#0f051d', '#f72585', '#7209b7', '#4361ee', '#4cc9f0'],
      analysisTimeMs: 14,
      blackPoint: 4,
      whitePoint: 252,
      dynamicRange: 248,
      hasHumanSkin: false,
      skinToneRatio: 0.02,
      histogram: {
        shadowsAvg: 24,
        midtonesAvg: 108,
        highlightsAvg: 224,
        quantiles: [8, 42, 105, 175, 246],
      },
      gradingShadows: { hue: 200, saturation: 65, luminance: -18 },
      gradingMidtones: { hue: 280, saturation: 30, luminance: 0 },
      gradingHighlights: { hue: 315, saturation: 60, luminance: 16 },
      toneCurve: { shadows: -20, midtones: 0, highlights: 25 },
      hslChannels: {
        magenta: { hue: 0, saturation: 65, luminance: 20 },
        purple: { hue: 0, saturation: 55, luminance: 15 },
        aqua: { hue: 0, saturation: 60, luminance: 10 },
        blue: { hue: 5, saturation: 50, luminance: 5 },
      },
    },
  },
  {
    id: 'monochrome_fine_art',
    title: 'Fine Art Monochrome',
    category: 'Hitam & Putih',
    description: 'Gradasi monokromatis kaya dengan kontras dinamis tinggi, bayangan pekat, dan midtone halus.',
    badge: '🖤 Monokrom',
    sampleGradient: 'linear-gradient(135deg, #1f1f1f 0%, #d4d4d4 100%)',
    profile: {
      brightness: 2,
      contrast: 28,
      saturation: -100,
      temperature: 0,
      tint: 0,
      exposure: 0,
      highlights: 14,
      shadows: -14,
      whites: 18,
      blacks: -12,
      vibrance: -100,
      clarity: 16,
      fade: 4,
      vignette: 18,
      grain: 0,
      confidence: 0.98,
      colorMoodTag: 'monochrome_classic',
      dominantPalette: ['#111111', '#333333', '#777777', '#bbbbbb', '#f0f0f0'],
      analysisTimeMs: 12,
      blackPoint: 5,
      whitePoint: 250,
      dynamicRange: 245,
      hasHumanSkin: false,
      skinToneRatio: 0,
      isMonochrome: true,
      shadowClippingPercent: 1.2,
      highlightClippingPercent: 0.8,
      labStats: {
        lMean: 52.4,
        aMean: 0.1,
        bMean: -0.2,
        lStd: 28.5,
        aStd: 0.4,
        bStd: 0.5,
      },
      histogram: {
        shadowsAvg: 32,
        midtonesAvg: 128,
        highlightsAvg: 220,
        quantiles: [14, 52, 126, 188, 244],
      },
      gradingShadows: { hue: 0, saturation: 0, luminance: -5 },
      gradingMidtones: { hue: 0, saturation: 0, luminance: 0 },
      gradingHighlights: { hue: 0, saturation: 0, luminance: 5 },
      toneCurve: { shadows: -12, midtones: 2, highlights: 14 },
      hslChannels: {
        red: { hue: 0, saturation: -100, luminance: 0 },
        orange: { hue: 0, saturation: -100, luminance: 4 },
        yellow: { hue: 0, saturation: -100, luminance: 6 },
        green: { hue: 0, saturation: -100, luminance: -2 },
        blue: { hue: 0, saturation: -100, luminance: -5 },
      },
    },
  },
];

// Helper fungsi warna
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, n)).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}
