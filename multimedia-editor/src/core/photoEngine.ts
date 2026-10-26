/**
 * Photo Engine — Canvas 2D based photo editing
 *
 * All transformations applied via Canvas 2D API.
 * No upload to server. Original file never overwritten.
 */

import type {
  PhotoEditState,
  FilterId,
  ImageAdjustments,
  TextLayer,
  PhotoExportFormat,
} from './types';

/**
 * Apply all edit-state transformations to a source image and return
 * the resulting canvas.
 */
export function renderPhotoToCanvas(
  sourceImage: HTMLImageElement,
  editState: PhotoEditState,
  outputWidth?: number,
  outputHeight?: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Calculate source dimensions after crop
  let sx = 0,
    sy = 0,
    sw = sourceImage.naturalWidth,
    sh = sourceImage.naturalHeight;

  if (editState.crop) {
    sx = editState.crop.x * sourceImage.naturalWidth;
    sy = editState.crop.y * sourceImage.naturalHeight;
    sw = editState.crop.width * sourceImage.naturalWidth;
    sh = editState.crop.height * sourceImage.naturalHeight;
  }

  // After rotation, dimensions may swap
  const rotated = editState.rotation === 90 || editState.rotation === 270;
  const baseW = rotated ? sh : sw;
  const baseH = rotated ? sw : sh;

  const finalW = outputWidth ?? baseW;
  const finalH = outputHeight ?? baseH;

  canvas.width = finalW;
  canvas.height = finalH;

  ctx.save();

  // Move origin to center for rotation/flip
  ctx.translate(finalW / 2, finalH / 2);

  // Rotation
  if (editState.rotation) {
    ctx.rotate((editState.rotation * Math.PI) / 180);
  }

  // Flip
  const scaleX = editState.flipX ? -1 : 1;
  const scaleY = editState.flipY ? -1 : 1;
  ctx.scale(scaleX, scaleY);

  // Draw image centered
  const drawW = rotated ? finalH : finalW;
  const drawH = rotated ? finalW : finalH;
  ctx.drawImage(sourceImage, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);

  ctx.restore();

  // Apply real pixel-level adjustments and filters directly to the canvas ImageData.
  // This guarantees 100% cross-browser reliability (desktop, Chrome Android, Safari iOS, WebView)
  // and ensures exported blobs always contain all edits instead of the raw original image.
  applyPixelAdjustmentsAndFilters(
    ctx,
    finalW,
    finalH,
    editState.adjustments,
    editState.filter,
    editState.filterIntensity ?? 100
  );

  // Draw text layers on top
  renderTextLayers(ctx, editState.textLayers, finalW, finalH);

  return canvas;
}

/**
 * Direct pixel manipulation (ImageData) for Brightness, Contrast, Saturation, and Color Presets.
 * Completely immune to browser ctx.filter bugs or mobile Safari dropouts.
 */
/**
 * Direct pixel manipulation (ImageData) for Light, Color, Detail, Effects,
 * 3-Way Color Grading, and 15 Professional Presets.
 * Completely immune to browser ctx.filter bugs or mobile Safari dropouts.
 */
export function applyPixelAdjustmentsAndFilters(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  adj: ImageAdjustments,
  filterId: FilterId,
  filterIntensity: number = 100
): void {
  const hasAdjustments =
    (adj.exposure ?? 0) !== 0 ||
    (adj.brightness ?? 0) !== 0 ||
    (adj.contrast ?? 0) !== 0 ||
    (adj.highlights ?? 0) !== 0 ||
    (adj.shadows ?? 0) !== 0 ||
    (adj.whites ?? 0) !== 0 ||
    (adj.blacks ?? 0) !== 0 ||
    (adj.temperature ?? 0) !== 0 ||
    (adj.tint ?? 0) !== 0 ||
    (adj.saturation ?? 0) !== 0 ||
    (adj.vibrance ?? 0) !== 0 ||
    (adj.sharpness ?? 0) !== 0 ||
    (adj.clarity ?? 0) !== 0 ||
    (adj.texture ?? 0) !== 0 ||
    (adj.denoise ?? 0) !== 0 ||
    (adj.dehaze ?? 0) !== 0 ||
    (adj.vignette ?? 0) !== 0 ||
    (adj.grain ?? 0) !== 0 ||
    (adj.fade ?? 0) !== 0 ||
    Boolean(adj.gradingShadows?.saturation) ||
    Boolean(adj.gradingMidtones?.saturation) ||
    Boolean(adj.gradingHighlights?.saturation) ||
    Boolean(adj.toneCurve) ||
    Boolean(adj.hsl && Object.keys(adj.hsl).length > 0);

  const hasFilter = filterId !== 'none' && filterIntensity > 0;
  if (!hasAdjustments && !hasFilter) return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const len = data.length;

  // Precomputed values for Light (calibrated to professional photographic ranges to prevent clipping)
  const expFactor = 2 ** ((adj.exposure ?? 0) / 55);
  const brightnessOffset = (adj.brightness ?? 0) * 0.75;
  const cVal = Math.max(-99.9, Math.min(99.9, adj.contrast ?? 0)) * 1.6;
  const contrastFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));
  const satFactor = Math.max(0, 1 + (adj.saturation ?? 0) / 100);
  const fIntensity = Math.max(0, Math.min(1, filterIntensity / 100));

  const centerX = width / 2;
  const centerY = height / 2;
  const maxDistSq = centerX * centerX + centerY * centerY;

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    const origR = r;
    const origG = g;
    const origB = b;

    // ─── 1. Filter Presets (with 0-100% Intensity Interpolation) ───
    if (hasFilter) {
      let fr = r;
      let fg = g;
      let fb = b;

      switch (filterId) {
        // Classic Presets
        case 'grayscale': {
          const y = 0.299 * fr + 0.587 * fg + 0.114 * fb;
          fr = fg = fb = y;
          break;
        }
        case 'sepia': {
          fr = 0.393 * r + 0.769 * g + 0.189 * b;
          fg = 0.349 * r + 0.686 * g + 0.168 * b;
          fb = 0.272 * r + 0.534 * g + 0.131 * b;
          break;
        }
        case 'warm': {
          fr = r * 1.15 + 12;
          fb = b * 0.85 - 8;
          break;
        }
        case 'cool': {
          fb = b * 1.18 + 14;
          fr = r * 0.86 - 8;
          break;
        }
        case 'vintage': {
          const tr = 0.393 * r + 0.769 * g + 0.189 * b;
          const tg = 0.349 * r + 0.686 * g + 0.168 * b;
          const tb = 0.272 * r + 0.534 * g + 0.131 * b;
          fr = r * 0.45 + tr * 0.55 + 14;
          fg = g * 0.5 + tg * 0.5 + 4;
          fb = b * 0.5 + tb * 0.5 - 10;
          break;
        }
        case 'dramatic': {
          const fD = (259 * (40 + 255)) / (255 * (259 - 40));
          fr = fD * (r - 128) + 128;
          fg = fD * (g - 128) + 128;
          fb = fD * (b - 128) + 128;
          break;
        }
        // 15 Professional Presets
        case 'dark_blue_cinematic': {
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const sWeight = Math.max(0, (128 - lum) / 128);
          const hWeight = Math.max(0, (lum - 128) / 127);
          fr = r * 0.85 - sWeight * 16 + hWeight * 6;
          fg = g * 0.92 - sWeight * 4 + hWeight * 10;
          fb = b * 1.08 + sWeight * 26 + hWeight * 22;
          const cF = 1.25;
          fr = cF * (fr - 128) + 128;
          fg = cF * (fg - 128) + 128;
          fb = cF * (fb - 128) + 128;
          break;
        }
        case 'teal_and_orange': {
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const sW = Math.max(0, (140 - lum) / 140);
          const hW = Math.max(0, (lum - 110) / 145);
          fr = fr - sW * 22 + hW * 24;
          fg = fg + sW * 10 + hW * 8;
          fb = fb + sW * 26 - hW * 22;
          const cF = 1.2;
          fr = cF * (fr - 128) + 128;
          fg = cF * (fg - 128) + 128;
          fb = cF * (fb - 128) + 128;
          break;
        }
        case 'vintage_film': {
          fr = r * 0.92 + 22;
          fg = g * 0.90 + 16;
          fb = b * 0.82 + 10;
          break;
        }
        case 'korean_clean': {
          fr = r * 1.08 + 14;
          fg = g * 1.06 + 14;
          fb = b * 1.04 + 18;
          const y = 0.299 * fr + 0.587 * fg + 0.114 * fb;
          fr = y + (fr - y) * 0.85;
          fg = y + (fg - y) * 0.85;
          fb = y + (fb - y) * 0.85;
          break;
        }
        case 'soft_pastel': {
          fr = r * 1.05 + 16;
          fg = g * 0.98 + 12;
          fb = b * 1.02 + 18;
          const y = 0.299 * fr + 0.587 * fg + 0.114 * fb;
          fr = y + (fr - y) * 0.88;
          fg = y + (fg - y) * 0.88;
          fb = y + (fb - y) * 0.88;
          break;
        }
        case 'moody_green': {
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const sW = Math.max(0, (130 - lum) / 130);
          fr = r * 0.86 - sW * 14;
          fg = g * 1.08 + sW * 10;
          fb = b * 0.88 - sW * 12;
          break;
        }
        case 'black_and_white': {
          const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const cF = 1.32;
          const mono = cF * (y - 128) + 128;
          fr = fg = fb = mono;
          break;
        }
        case 'golden_hour': {
          fr = r * 1.18 + 22;
          fg = g * 1.04 + 8;
          fb = b * 0.78 - 14;
          break;
        }
        case 'cyberpunk': {
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (lum < 128) {
            fr = r * 0.75 - 12;
            fg = g * 1.15 + 16;
            fb = b * 1.30 + 30;
          } else {
            fr = r * 1.25 + 28;
            fg = g * 0.82 - 10;
            fb = b * 1.18 + 22;
          }
          break;
        }
        case 'professional_portrait': {
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const sW = Math.max(0, (128 - lum) / 128);
          fr = r * 1.04 + sW * 8;
          fg = g * 1.01 + sW * 6;
          fb = b * 0.97 + sW * 4;
          break;
        }
        case 'matte_film': {
          fr = r * 0.88 + 28;
          fg = g * 0.88 + 26;
          fb = b * 0.86 + 28;
          break;
        }
        case 'warm_editorial': {
          fr = r * 1.12 + 10;
          fg = g * 1.05 + 4;
          fb = b * 0.90 - 8;
          const cF = 1.18;
          fr = cF * (fr - 128) + 128;
          fg = cF * (fg - 128) + 128;
          fb = cF * (fb - 128) + 128;
          break;
        }
        case 'cool_industrial': {
          fr = r * 0.86 - 6;
          fg = g * 0.94;
          fb = b * 1.12 + 14;
          const y = 0.299 * fr + 0.587 * fg + 0.114 * fb;
          fr = y + (fr - y) * 0.78;
          fg = y + (fg - y) * 0.78;
          fb = y + (fb - y) * 0.78;
          break;
        }
        case 'dreamy_glow': {
          fr = r * 1.12 + 16;
          fg = g * 1.08 + 14;
          fb = b * 1.10 + 18;
          break;
        }
        case 'natural_portrait': {
          fr = r * 1.02 + 4;
          fg = g * 1.01 + 2;
          fb = b * 0.99;
          break;
        }
      }

      // Blend filter by intensity
      r = origR + (fr - origR) * fIntensity;
      g = origG + (fg - origG) * fIntensity;
      b = origB + (fb - origB) * fIntensity;
    }

    // ─── 2. Light Adjustments ───
    if (adj.exposure) {
      r *= expFactor;
      g *= expFactor;
      b *= expFactor;
    }

    if (adj.brightness) {
      r += brightnessOffset;
      g += brightnessOffset;
      b += brightnessOffset;
    }

    if (adj.contrast) {
      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;
    }

    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (adj.highlights) {
      const hW = Math.max(0, (lum - 128) / 127) ** 1.3;
      const hShift = (adj.highlights / 100) * 45 * hW;
      r += hShift;
      g += hShift;
      b += hShift;
    }

    if (adj.shadows) {
      const sW = Math.max(0, (128 - lum) / 128) ** 1.3;
      const sShift = (adj.shadows / 100) * 45 * sW;
      r += sShift;
      g += sShift;
      b += sShift;
    }

    if (adj.whites) {
      const wW = Math.max(0, (lum - 192) / 63);
      const wShift = (adj.whites / 100) * 35 * wW;
      r += wShift;
      g += wShift;
      b += wShift;
    }

    if (adj.blacks) {
      const bW = Math.max(0, (64 - lum) / 64);
      const bShift = (adj.blacks / 100) * 35 * bW;
      r += bShift;
      g += bShift;
      b += bShift;
    }

    // ─── 3. Color Adjustments (Temp, Tint, Sat, Vibrance) ───
    if (adj.temperature) {
      r += adj.temperature * 0.75;
      b -= adj.temperature * 0.75;
    }

    if (adj.tint) {
      g += adj.tint * 0.6;
      r -= adj.tint * 0.3;
      b -= adj.tint * 0.3;
    }

    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (adj.saturation) {
      r = lum + (r - lum) * satFactor;
      g = lum + (g - lum) * satFactor;
      b = lum + (b - lum) * satFactor;
    }

    if (adj.vibrance) {
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const curSat = maxC === 0 ? 0 : (maxC - minC) / (maxC + 0.001);
      const vibMult = 1 + (adj.vibrance / 100) * (1 - curSat);
      r = lum + (r - lum) * vibMult;
      g = lum + (g - lum) * vibMult;
      b = lum + (b - lum) * vibMult;
    }

    // ─── 4. Detail, Clarity & Dehaze ───
    if (adj.clarity || adj.texture) {
      const midDist = 1 - Math.abs(lum - 128) / 128;
      const cBoost = ((adj.clarity ?? 0) * 0.45 + (adj.texture ?? 0) * 0.35) / 100;
      r += (r - lum) * cBoost * midDist;
      g += (g - lum) * cBoost * midDist;
      b += (b - lum) * cBoost * midDist;
    }

    if (adj.dehaze) {
      const hazeFactor = (adj.dehaze / 100) * 0.3;
      if (adj.dehaze > 0) {
        r = (r - 30 * hazeFactor) / (1 - 0.2 * hazeFactor);
        g = (g - 30 * hazeFactor) / (1 - 0.2 * hazeFactor);
        b = (b - 30 * hazeFactor) / (1 - 0.2 * hazeFactor);
      } else {
        r += Math.abs(hazeFactor) * 40;
        g += Math.abs(hazeFactor) * 40;
        b += Math.abs(hazeFactor) * 40;
      }
    }

    // ─── 5. Advanced Color Grading (Shadows, Midtones, Highlights) ───
    if (adj.gradingShadows?.saturation || adj.gradingShadows?.luminance) {
      const sWeight = Math.max(0, (120 - lum) / 120) ** 1.3;
      if (adj.gradingShadows.saturation) {
        const rad = (adj.gradingShadows.hue * Math.PI) / 180;
        const intensity = (adj.gradingShadows.saturation / 100) * sWeight * 55;
        r += Math.cos(rad) * intensity;
        g += Math.cos(rad - (2 * Math.PI) / 3) * intensity;
        b += Math.cos(rad + (2 * Math.PI) / 3) * intensity;
      }
      if (adj.gradingShadows.luminance) {
        const lumShift = (adj.gradingShadows.luminance / 100) * 40 * sWeight;
        r += lumShift;
        g += lumShift;
        b += lumShift;
      }
    }

    if (adj.gradingMidtones?.saturation || adj.gradingMidtones?.luminance) {
      const mWeight = Math.max(0, 1 - Math.abs(lum - 128) / 95);
      if (adj.gradingMidtones.saturation) {
        const rad = (adj.gradingMidtones.hue * Math.PI) / 180;
        const intensity = (adj.gradingMidtones.saturation / 100) * mWeight * 45;
        r += Math.cos(rad) * intensity;
        g += Math.cos(rad - (2 * Math.PI) / 3) * intensity;
        b += Math.cos(rad + (2 * Math.PI) / 3) * intensity;
      }
      if (adj.gradingMidtones.luminance) {
        const lumShift = (adj.gradingMidtones.luminance / 100) * 35 * mWeight;
        r += lumShift;
        g += lumShift;
        b += lumShift;
      }
    }

    if (adj.gradingHighlights?.saturation || adj.gradingHighlights?.luminance) {
      const hWeight = Math.max(0, (lum - 135) / 120) ** 1.3;
      if (adj.gradingHighlights.saturation) {
        const rad = (adj.gradingHighlights.hue * Math.PI) / 180;
        const intensity = (adj.gradingHighlights.saturation / 100) * hWeight * 55;
        r += Math.cos(rad) * intensity;
        g += Math.cos(rad - (2 * Math.PI) / 3) * intensity;
        b += Math.cos(rad + (2 * Math.PI) / 3) * intensity;
      }
      if (adj.gradingHighlights.luminance) {
        const lumShift = (adj.gradingHighlights.luminance / 100) * 40 * hWeight;
        r += lumShift;
        g += lumShift;
        b += lumShift;
      }
    }

    // ─── 5.5. HSL Color Mix (8 Color Channels: Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta) ───
    if (adj.hsl) {
      const rClamped = Math.max(0, Math.min(255, r));
      const gClamped = Math.max(0, Math.min(255, g));
      const bClamped = Math.max(0, Math.min(255, b));
      const max = Math.max(rClamped, gClamped, bClamped);
      const min = Math.min(rClamped, gClamped, bClamped);
      const delta = max - min;

      if (delta > 8) {
        // Calculate Hue in degrees 0-360
        let h = 0;
        if (max === rClamped) {
          h = ((gClamped - bClamped) / delta + (gClamped < bClamped ? 6 : 0)) * 60;
        } else if (max === gClamped) {
          h = ((bClamped - rClamped) / delta + 2) * 60;
        } else {
          h = ((rClamped - gClamped) / delta + 4) * 60;
        }

        // Identify primary HSL channel
        let channelName: 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta' = 'red';
        if (h >= 15 && h < 45) channelName = 'orange';
        else if (h >= 45 && h < 75) channelName = 'yellow';
        else if (h >= 75 && h < 150) channelName = 'green';
        else if (h >= 150 && h < 200) channelName = 'aqua';
        else if (h >= 200 && h < 265) channelName = 'blue';
        else if (h >= 265 && h < 315) channelName = 'purple';
        else if (h >= 315 && h < 345) channelName = 'magenta';

        const shift = adj.hsl[channelName];
        if (shift && (shift.hue || shift.saturation || shift.luminance)) {
          // Saturation shift
          if (shift.saturation) {
            const satMultiplier = Math.max(0, 1 + shift.saturation / 100);
            const curLum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = curLum + (r - curLum) * satMultiplier;
            g = curLum + (g - curLum) * satMultiplier;
            b = curLum + (b - curLum) * satMultiplier;
          }

          // Luminance shift
          if (shift.luminance) {
            const lumAdd = (shift.luminance / 100) * 45;
            r += lumAdd;
            g += lumAdd;
            b += lumAdd;
          }

          // Hue shift
          if (shift.hue) {
            const hueDelta = (shift.hue / 100) * 25;
            if (channelName === 'green') {
              // Hue shift for foliage: towards warm yellow or emerald cyan
              r += hueDelta * 0.4;
              g -= Math.abs(hueDelta) * 0.1;
              b -= hueDelta * 0.4;
            } else if (channelName === 'blue' || channelName === 'aqua') {
              // Sky/sea shift: towards teal or purple
              r -= hueDelta * 0.4;
              g += hueDelta * 0.3;
              b += hueDelta * 0.2;
            } else if (channelName === 'orange' || channelName === 'yellow') {
              // Skin/warmth shift
              r += hueDelta * 0.3;
              g += hueDelta * 0.2;
              b -= hueDelta * 0.3;
            } else {
              r += hueDelta * 0.3;
              b += hueDelta * 0.3;
            }
          }
        }
      }
    }

    // ─── 6. Tone Curve (Composite RGB + Individual R, G, B Channel Curves) ───
    if (adj.toneCurve) {
      const tc = adj.toneCurve;
      if (tc.shadows || tc.midtones || tc.highlights || tc.red || tc.green || tc.blue) {
        const sW = Math.max(0, (110 - lum) / 110);
        const mW = Math.max(0, 1 - Math.abs(lum - 128) / 90);
        const hW = Math.max(0, (lum - 145) / 110);
        const compositeCurveOffset =
          sW * (tc.shadows * 0.4) +
          mW * (tc.midtones * 0.4) +
          hW * (tc.highlights * 0.4);
        
        r += compositeCurveOffset + (tc.red ? tc.red * 0.35 : 0);
        g += compositeCurveOffset + (tc.green ? tc.green * 0.35 : 0);
        b += compositeCurveOffset + (tc.blue ? tc.blue * 0.35 : 0);
      }
    }

    // ─── 7. Effects: Fade (Matte lift) ───
    if (adj.fade) {
      const fRatio = (adj.fade / 100) * 0.28;
      r = r * (1 - fRatio) + 255 * fRatio;
      g = g * (1 - fRatio) + 255 * fRatio;
      b = b * (1 - fRatio) + 255 * fRatio;
    }

    // ─── 8. Effects: Film Grain ───
    if (adj.grain) {
      const pixelIndex = i / 4;
      const noise =
        ((Math.sin(pixelIndex * 12.9898 + (pixelIndex % width) * 78.233) * 43758.5453) % 1) *
          2 -
        1;
      const gOffset = noise * (adj.grain * 0.45);
      r += gOffset;
      g += gOffset;
      b += gOffset;
    }

    // ─── 9. Effects: Vignette ───
    if (adj.vignette) {
      const px = (i / 4) % width;
      const py = Math.floor(i / 4 / width);
      const dx = px - centerX;
      const dy = py - centerY;
      const distSq = dx * dx + dy * dy;
      const distRatio = distSq / maxDistSq;
      if (distRatio > 0.15) {
        const falloff = Math.min(1, (distRatio - 0.15) / 0.85);
        const vigFactor = 1 - (adj.vignette / 100) * (falloff ** 1.6);
        r *= vigFactor;
        g *= vigFactor;
        b *= vigFactor;
      }
    }

    // ─── Highlight Shoulder & Shadow Toe Rolloff ───
    // Soft compressive shoulder for highlights (> 235) and toe for deep shadows (< 20)
    // to prevent harsh clipping and preserve high-frequency micro-textures in bright skin / dark clothing
    let finalR = r;
    let finalG = g;
    let finalB = b;

    if (finalR > 235) finalR = 235 + 20 * (1 - Math.exp(-(finalR - 235) / 20));
    else if (finalR < 18) finalR = 18 * Math.exp((finalR - 18) / 18);

    if (finalG > 235) finalG = 235 + 20 * (1 - Math.exp(-(finalG - 235) / 20));
    else if (finalG < 18) finalG = 18 * Math.exp((finalG - 18) / 18);

    if (finalB > 235) finalB = 235 + 20 * (1 - Math.exp(-(finalB - 235) / 20));
    else if (finalB < 18) finalB = 18 * Math.exp((finalB - 18) / 18);

    // Final uint8 clamp
    data[i] = finalR < 0 ? 0 : finalR > 255 ? 255 : finalR;
    data[i + 1] = finalG < 0 ? 0 : finalG > 255 ? 255 : finalG;
    data[i + 2] = finalB < 0 ? 0 : finalB > 255 ? 255 : finalB;
  }

  // ─── 10. Detail: Denoise (Edge-Preserving Spatial Smoothing Filter) ───
  // Note: strictly bypassed (0 overhead, 100% texture preservation) when adj.denoise === 0
  if (adj.denoise && adj.denoise > 0) {
    const denoiseFactor = (adj.denoise / 100) * 0.85;
    const colorThreshold = 18 + (1 - adj.denoise / 100) * 22;
    const copy = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const centerIdx = (y * width + x) * 4;
        const cR = copy[centerIdx];
        const cG = copy[centerIdx + 1];
        const cB = copy[centerIdx + 2];

        let weightSum = 1.0;
        let rSum = cR;
        let gSum = cG;
        let bSum = cB;

        // 3x3 edge-preserving neighborhood
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = ((y + dy) * width + (x + dx)) * 4;
            const nR = copy[nIdx];
            const nG = copy[nIdx + 1];
            const nB = copy[nIdx + 2];

            const colorDist = Math.hypot(nR - cR, nG - cG, nB - cB);
            if (colorDist < colorThreshold) {
              const weight = 1 - colorDist / colorThreshold;
              weightSum += weight;
              rSum += nR * weight;
              gSum += nG * weight;
              bSum += nB * weight;
            }
          }
        }

        const smoothedR = rSum / weightSum;
        const smoothedG = gSum / weightSum;
        const smoothedB = bSum / weightSum;

        data[centerIdx] = Math.round(cR + (smoothedR - cR) * denoiseFactor);
        data[centerIdx + 1] = Math.round(cG + (smoothedG - cG) * denoiseFactor);
        data[centerIdx + 2] = Math.round(cB + (smoothedB - cB) * denoiseFactor);
      }
    }
  }

  // ─── 11. Detail: Sharpness (Unsharp Mask Convolution) ───
  if (adj.sharpness && adj.sharpness > 0) {
    const sharpWeight = (adj.sharpness / 100) * 0.4;
    const copy = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const top = ((y - 1) * width + x) * 4;
        const btm = ((y + 1) * width + x) * 4;
        const lft = (y * width + (x - 1)) * 4;
        const rgt = (y * width + (x + 1)) * 4;

        for (let c = 0; c < 3; c++) {
          const current = copy[idx + c];
          const laplacian =
            current * 5 -
            copy[top + c] -
            copy[btm + c] -
            copy[lft + c] -
            copy[rgt + c];
          const val = current + (laplacian - current) * sharpWeight;
          data[idx + c] = val < 0 ? 0 : val > 255 ? 255 : val;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function renderTextLayers(
  ctx: CanvasRenderingContext2D,
  layers: TextLayer[],
  canvasW: number,
  canvasH: number
) {
  for (const layer of layers) {
    ctx.save();
    const x = layer.x * canvasW;
    const y = layer.y * canvasH;

    ctx.translate(x, y);
    if (layer.rotation) {
      ctx.rotate((layer.rotation * Math.PI) / 180);
    }

    const style = `${layer.italic ? 'italic ' : ''}${layer.bold ? 'bold ' : ''}`;
    ctx.font = `${style}${layer.fontSize}px ${layer.fontFamily}`;
    ctx.fillStyle = layer.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text shadow for readability
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    ctx.fillText(layer.text, 0, 0);
    ctx.restore();
  }
}

/**
 * Export the edited photo to a Blob
 */
export function exportPhotoToBlob(
  canvas: HTMLCanvasElement,
  format: PhotoExportFormat = 'jpeg',
  quality: number = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let mimeType = 'image/jpeg';
    if (format === 'png') {
      mimeType = 'image/png';
    } else if (format === 'webp') {
      mimeType = 'image/webp';
    }

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to export image'));
        }
      },
      mimeType,
      format === 'png' ? undefined : quality
    );
  });
}

/**
 * Trigger download or native share of a Blob.
 * In mobile browsers and Android Capacitor WebView, leverages Web Share API (navigator.share)
 * to allow direct saving to the device gallery or native sharing, with graceful fallback to anchor download.
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
        });
        return true;
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return false;
      }
    }
  }

  // Standard browser fallback: programmatic <a> click
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return true;
}

// ─── EXIF Orientation ──────────────────────────────────────────────────────

/**
 * Read EXIF orientation tag from a JPEG file's raw bytes.
 * Returns values 1–8 per EXIF spec, or 1 (normal) if not found / not JPEG.
 *
 * This is a lightweight parser — no external library needed.
 * EXIF orientation tag ID = 0x0112
 */
export async function readExifOrientation(file: File): Promise<number> {
  // Only JPEG files embed EXIF in this location
  if (!file.type.includes('jpeg') && !file.type.includes('jpg')) return 1;

  try {
    // Read first 64KB — enough for EXIF header in most cameras
    const buffer = await file.slice(0, 65536).arrayBuffer();
    const view = new DataView(buffer);

    // JPEG SOI marker
    if (view.getUint16(0) !== 0xffd8) return 1;

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      offset += 2;

      // APP1 marker (contains EXIF)
      if (marker === 0xffe1) {
        const segmentLength = view.getUint16(offset);
        offset += 2;

        // Check for 'Exif\0\0' header
        if (view.getUint32(offset) !== 0x45786966) return 1; // 'Exif'

        const tiffOffset = offset + 6;
        // Determine byte order: 'II' (little-endian) or 'MM' (big-endian)
        const littleEndian = view.getUint16(tiffOffset) === 0x4949;

        const getUint16 = (o: number) =>
          view.getUint16(tiffOffset + o, littleEndian);
        const getUint32 = (o: number) =>
          view.getUint32(tiffOffset + o, littleEndian);

        // IFD0 offset from TIFF header
        const ifdOffset = getUint32(4);
        const ifdEntryCount = getUint16(ifdOffset);

        for (let i = 0; i < ifdEntryCount; i++) {
          const entryOffset = ifdOffset + 2 + i * 12;
          const tag = getUint16(entryOffset);
          if (tag === 0x0112) {
            // Orientation tag
            return getUint16(entryOffset + 8);
          }
        }

        void segmentLength; // consumed
        return 1;
      }

      // Skip non-APP1 markers
      if (marker === 0xffda) break; // SOS — end of header
      if ((marker & 0xff00) !== 0xff00) break; // Not a valid marker

      const segLen = view.getUint16(offset);
      offset += segLen;
    }
  } catch {
    // Parsing failure: return normal orientation
  }

  return 1;
}

/**
 * Apply EXIF orientation correction to an HTMLImageElement.
 * Returns a new HTMLImageElement backed by a corrected canvas data URL.
 *
 * Orientation values (EXIF spec):
 *   1 = Normal
 *   2 = Flip horizontal
 *   3 = Rotate 180°
 *   4 = Flip vertical
 *   5 = Rotate 90° CCW + flip horizontal
 *   6 = Rotate 90° CW
 *   7 = Rotate 90° CW + flip horizontal
 *   8 = Rotate 90° CCW
 */
export function applyExifOrientationToCanvas(
  img: HTMLImageElement,
  orientation: number
): HTMLImageElement {
  if (orientation <= 1 || orientation > 8) return img;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // For 90/270 rotations, swap canvas dimensions
  const isTransposed = orientation >= 5;
  canvas.width = isTransposed ? h : w;
  canvas.height = isTransposed ? w : h;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);

  switch (orientation) {
    case 2: ctx.scale(-1, 1); break;
    case 3: ctx.rotate(Math.PI); break;
    case 4: ctx.scale(1, -1); break;
    case 5: ctx.rotate(-Math.PI / 2); ctx.scale(-1, 1); break;
    case 6: ctx.rotate(Math.PI / 2); break;
    case 7: ctx.rotate(Math.PI / 2); ctx.scale(-1, 1); break;
    case 8: ctx.rotate(-Math.PI / 2); break;
  }

  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();

  // Return a new HTMLImageElement backed by the corrected canvas
  const corrected = new Image();
  corrected.src = canvas.toDataURL('image/jpeg', 0.98);
  return corrected;
}

/**
 * Load an image file to an HTMLImageElement with automatic EXIF orientation correction.
 *
 * For JPEG files, reads the EXIF orientation tag and applies rotation/flip
 * so the image always displays correctly regardless of camera orientation.
 * PNG and WebP are returned as-is (orientation embedded differently or absent).
 */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        const orientation = await readExifOrientation(file);
        if (orientation !== 1) {
          // Apply EXIF orientation correction
          const corrected = applyExifOrientationToCanvas(img, orientation);
          // Wait for corrected image to load (it's a data URL)
          if (!corrected.complete) {
            corrected.onload = () => {
              URL.revokeObjectURL(url);
              resolve(corrected);
            };
            corrected.onerror = () => {
              URL.revokeObjectURL(url);
              resolve(img); // fallback to uncorrected
            };
          } else {
            URL.revokeObjectURL(url);
            resolve(corrected);
          }
        } else {
          resolve(img);
        }
      } catch {
        resolve(img); // EXIF read failed — return original
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };
    img.src = url;
  });
}
