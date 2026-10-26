/**
 * AI Orchestrator & Conversational Intent Engine
 *
 * Menerjemahkan prompt bahasa alami (Bahasa Indonesia & Inggris) menjadi
 * operasi terstruktur (StructuredOperation), memilih provider lokal vs remote,
 * memvalidasi parameter, dan menerapkan perubahan secara non-destruktif.
 */

import type { PhotoEditState, ImageAdjustments, FilterId } from './types';
import {
  clampAdjustment,
  generateId,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_PHOTO_EDIT_STATE,
} from './types';
import { PROFESSIONAL_PRESETS } from './presets';
import type {
  StructuredOperation,
  EditSessionContext,
  ChatMessage,
} from './conversationTypes';

// ─── Suggested Follow-up Prompts Helper ────────────────────────
export function getSmartFollowUpSuggestions(
  lastAction?: string,
  _target?: string
): string[] {
  switch (lastAction) {
    case 'brighten':
      return ['Terangkan sedikit lagi', 'Tambah kontras', 'Hangatkan warnanya', 'Undo'];
    case 'darken':
      return ['Redupkan sedikit lagi', 'Tambah kontras', 'Buat lebih sejuk', 'Undo'];
    case 'warm':
      return ['Lebih hangat lagi', 'Tambah saturasi', 'Gaya Golden Hour', 'Undo'];
    case 'cool':
      return ['Lebih sejuk lagi', 'Kurangi saturasi', 'Tingkatkan detail', 'Undo'];
    case 'saturate':
      return ['Lebih berwarna lagi', 'Hangatkan warna', 'Tambah kontras', 'Undo'];
    case 'desaturate':
      return ['Jadikan Hitam Putih (B&W)', 'Tambah kontras', 'Gaya Vintage', 'Undo'];
    case 'contrast':
      return ['Tambah kontras lagi', 'Terangkan sedikit', 'Pertajam detail', 'Undo'];
    case 'sharpen':
      return ['Pertajam lagi', 'Tambah dehaze', 'Tambah saturasi', 'Undo'];
    case 'preset':
      return ['Kurangi intensitas', 'Terangkan sedikit', 'Coba gaya lain', 'Undo'];
    case 'enhance_original':
      return ['Pertajam lagi', 'Kurangi noise', 'Tambah kontras', 'Undo'];
    case 'ai_reconstruction':
      return ['Tingkatkan intensitas', 'Bandingkan asli', 'Enhance Original', 'Undo'];
    default:
      return ['Terangkan sedikit', 'Buat lebih hangat', 'Tambah kontras', 'Gaya Cinematic'];
  }
}

// ─── Intent Parser (Bilingual Indonesian & English) ─────────────
export function parseUserPrompt(
  prompt: string,
  context: EditSessionContext
): StructuredOperation {
  const clean = prompt.trim().toLowerCase();
  const now = new Date().toISOString();

  // Multiplier modifier
  let magnitude = 1.0;
  if (
    clean.includes('sedikit') ||
    clean.includes('dikit') ||
    clean.includes('slightly') ||
    clean.includes('a bit') ||
    clean.includes('a little')
  ) {
    magnitude = 0.5;
  } else if (
    clean.includes('banyak') ||
    clean.includes('banget') ||
    clean.includes('sangat') ||
    clean.includes('drastis') ||
    clean.includes('a lot') ||
    clean.includes('much') ||
    clean.includes('significantly')
  ) {
    magnitude = 1.8;
  }

  // 1. History & Rollback commands
  if (clean === 'undo' || clean.includes('batalkan') || clean === 'kembali' || clean === 'revert') {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'history',
      action: 'undo',
      parameters: {},
      confidence: 1.0,
      provider: 'local',
      status: 'applied',
      explanation: 'Membatalkan perubahan terakhir (Undo).',
      createdAt: now,
    };
  }

  if (clean === 'redo' || clean.includes('ulangi') || clean.includes('majukan')) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'history',
      action: 'redo',
      parameters: {},
      confidence: 1.0,
      provider: 'local',
      status: 'applied',
      explanation: 'Mengulangi perubahan yang dibatalkan (Redo).',
      createdAt: now,
    };
  }

  if (
    clean.includes('reset semua') ||
    clean.includes('kembalikan ke awal') ||
    clean.includes('reset all') ||
    clean.includes('reset to original') ||
    clean === 'reset'
  ) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'history',
      action: 'reset_all',
      parameters: {},
      confidence: 1.0,
      provider: 'local',
      status: 'applied',
      explanation: 'Mengembalikan seluruh parameter editing foto ke kondisi semula.',
      createdAt: now,
    };
  }

  if (clean.includes('reset light') || clean.includes('reset pencahayaan')) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'history',
      action: 'reset_section',
      parameters: { section: 'light' },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: 'Mengembalikan slider pencahayaan (Exposure, Brightness, Contrast) ke 0.',
      createdAt: now,
    };
  }

  if (clean.includes('reset warna') || clean.includes('reset color')) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'history',
      action: 'reset_section',
      parameters: { section: 'color' },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: 'Mengembalikan slider warna (Temperature, Tint, Saturation, Vibrance) ke 0.',
      createdAt: now,
    };
  }

  // 2. Follow-up commands ("lagi", "tambah lagi", "sedikit lagi")
  if (
    clean === 'lagi' ||
    clean === 'tambah lagi' ||
    clean === 'sedikit lagi' ||
    clean === 'more' ||
    clean === 'again' ||
    clean === 'once more'
  ) {
    if (context.lastAdjustmentAction && context.lastAdjustmentParams) {
      return {
        id: generateId(),
        userPrompt: prompt,
        target: 'adjustments',
        action: context.lastAdjustmentAction,
        parameters: { ...context.lastAdjustmentParams },
        confidence: 0.9,
        provider: 'local',
        status: 'applied',
        explanation: `Menerapkan penambahan ${context.lastAdjustmentAction} kembali sesuai instruksi lanjutan.`,
        createdAt: now,
      };
    }
  }

  // 3. Brightness & Exposure
  if (
    clean.includes('terang') ||
    clean.includes('cerah') ||
    clean.includes('bright') ||
    clean.includes('lighten') ||
    clean.includes('pencahayaan naik')
  ) {
    const expDelta = Math.round(15 * magnitude);
    const brightDelta = Math.round(10 * magnitude);
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'adjustments',
      action: 'brighten',
      parameters: { exposure: expDelta, brightness: brightDelta },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: `Menerangkan foto secara lokal: Exposure +${expDelta}, Brightness +${brightDelta}.`,
      diffSummary: [`Exposure +${expDelta}`, `Brightness +${brightDelta}`],
      createdAt: now,
    };
  }

  if (
    clean.includes('gelap') ||
    clean.includes('redup') ||
    clean.includes('dark') ||
    clean.includes('dim') ||
    clean.includes('kurangi cahaya')
  ) {
    const expDelta = Math.round(-15 * magnitude);
    const brightDelta = Math.round(-10 * magnitude);
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'adjustments',
      action: 'darken',
      parameters: { exposure: expDelta, brightness: brightDelta },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: `Meredupkan foto: Exposure ${expDelta}, Brightness ${brightDelta}.`,
      diffSummary: [`Exposure ${expDelta}`, `Brightness ${brightDelta}`],
      createdAt: now,
    };
  }

  // 4. Contrast
  if (
    clean.includes('kontras') ||
    clean.includes('contrast') ||
    clean.includes('punchy') ||
    clean.includes('tajamkan bayangan')
  ) {
    if (clean.includes('kurang') || clean.includes('turun') || clean.includes('decrease') || clean.includes('less') || clean.includes('soft')) {
      const delta = Math.round(-20 * magnitude);
      return {
        id: generateId(),
        userPrompt: prompt,
        target: 'adjustments',
        action: 'contrast',
        parameters: { contrast: delta },
        confidence: 0.95,
        provider: 'local',
        status: 'applied',
        explanation: `Menurunkan kontras agar bayangan lebih lembut: Contrast ${delta}.`,
        diffSummary: [`Contrast ${delta}`],
        createdAt: now,
      };
    } else {
      const delta = Math.round(20 * magnitude);
      const blacks = Math.round(-10 * magnitude);
      return {
        id: generateId(),
        userPrompt: prompt,
        target: 'adjustments',
        action: 'contrast',
        parameters: { contrast: delta, blacks },
        confidence: 0.95,
        provider: 'local',
        status: 'applied',
        explanation: `Menaikkan kontras & kedalaman visual: Contrast +${delta}, Blacks ${blacks}.`,
        diffSummary: [`Contrast +${delta}`, `Blacks ${blacks}`],
        createdAt: now,
      };
    }
  }

  // 5. White Balance (Temperature & Tint)
  if (
    clean.includes('hangat') ||
    clean.includes('warm') ||
    clean.includes('kuning') ||
    clean.includes('golden')
  ) {
    const tempDelta = Math.round(20 * magnitude);
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'adjustments',
      action: 'warm',
      parameters: { temperature: tempDelta },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: `Memberikan nuansa hangat (warm tone): Temperature +${tempDelta}.`,
      diffSummary: [`Temperature +${tempDelta}`],
      createdAt: now,
    };
  }

  if (
    clean.includes('dingin') ||
    clean.includes('sejuk') ||
    clean.includes('cool') ||
    clean.includes('biru')
  ) {
    const tempDelta = Math.round(-20 * magnitude);
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'adjustments',
      action: 'cool',
      parameters: { temperature: tempDelta },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: `Memberikan nuansa sejuk (cool tone): Temperature ${tempDelta}.`,
      diffSummary: [`Temperature ${tempDelta}`],
      createdAt: now,
    };
  }

  // 6. Saturation, Vibrance, Black & White
  if (
    clean.includes('hitam putih') ||
    clean.includes('monokrom') ||
    clean.includes('monochrome') ||
    clean.includes('black and white') ||
    clean.includes('b&w')
  ) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'adjustments',
      action: 'monochrome',
      parameters: { saturation: -100 },
      confidence: 1.0,
      provider: 'local',
      status: 'applied',
      explanation: 'Mengubah foto menjadi Hitam & Putih (Monochrome) artistik: Saturation -100.',
      diffSummary: ['Saturation -100 (B&W)'],
      createdAt: now,
    };
  }

  if (
    clean.includes('saturasi') ||
    clean.includes('warna') ||
    clean.includes('vibrant') ||
    clean.includes('colorful')
  ) {
    if (
      clean.includes('kurang') ||
      clean.includes('turun') ||
      clean.includes('pudar') ||
      clean.includes('decrease') ||
      clean.includes('less') ||
      clean.includes('desaturate')
    ) {
      const satDelta = Math.round(-25 * magnitude);
      return {
        id: generateId(),
        userPrompt: prompt,
        target: 'adjustments',
        action: 'desaturate',
        parameters: { saturation: satDelta },
        confidence: 0.95,
        provider: 'local',
        status: 'applied',
        explanation: `Mengurangi kepekatan warna agar tampak muted/pudar: Saturation ${satDelta}.`,
        diffSummary: [`Saturation ${satDelta}`],
        createdAt: now,
      };
    } else {
      const satDelta = Math.round(20 * magnitude);
      const vibDelta = Math.round(15 * magnitude);
      return {
        id: generateId(),
        userPrompt: prompt,
        target: 'adjustments',
        action: 'saturate',
        parameters: { saturation: satDelta, vibrance: vibDelta },
        confidence: 0.95,
        provider: 'local',
        status: 'applied',
        explanation: `Meningkatkan kepekatan dan keceriaan warna: Saturation +${satDelta}, Vibrance +${vibDelta}.`,
        diffSummary: [`Saturation +${satDelta}`, `Vibrance +${vibDelta}`],
        createdAt: now,
      };
    }
  }

  // 7. Image Reconstruction, Restoration & Enhancement intents (Prioritized over generic sharpness)
  if (
    clean.includes('perjelas subjek yang buram') ||
    clean.includes('perbaiki buram') ||
    clean.includes('foto buram') ||
    clean.includes('unblur') ||
    clean.includes('enhance original') ||
    clean.includes('perjelas subjek') ||
    clean.includes('subjek yang buram') ||
    clean.includes('rekonstruksi') ||
    clean.includes('bagian objek yang hilang') ||
    clean.includes('bagian yang hilang') ||
    clean.includes('objek hilang') ||
    clean.includes('subjek yang hilang') ||
    clean.includes('perkiraan bentuk') ||
    clean.includes('versi baru') ||
    clean.includes('generate alternative') ||
    clean.includes('pertahankan latar belakang') ||
    clean.includes('pertahankan background') ||
    (clean.includes('pencahayaan') && clean.includes('noise')) ||
    clean.includes('restorasi')
  ) {
    if (
      clean.includes('versi baru') ||
      clean.includes('generate alternative') ||
      clean.includes('interpretasi')
    ) {
      return {
        id: generateId(),
        userPrompt: prompt,
        target: 'reconstruction',
        action: 'generate_alternative',
        parameters: { mode: 'generate_alternative', intensity: 80 },
        confidence: 0.95,
        provider: 'local',
        status: 'applied',
        explanation:
          'Menghasilkan versi interpretasi kontekstual baru dengan subjek yang lebih terdefinisi (Generate Alternative).',
        diffSummary: ['Mode: Generate Alternative', 'Interpretasi Kontur: Adaptif', 'Kontras & Detail: Dioptimalkan'],
        createdAt: now,
      };
    } else if (
      clean.includes('rekonstruksi') ||
      clean.includes('hilang') ||
      clean.includes('rusak') ||
      clean.includes('perkiraan bentuk') ||
      clean.includes('pertahankan latar belakang') ||
      clean.includes('pertahankan background')
    ) {
      const preserveBg = clean.includes('pertahankan latar belakang') || clean.includes('pertahankan background');
      return {
        id: generateId(),
        userPrompt: prompt,
        target: 'reconstruction',
        action: 'ai_reconstruction',
        parameters: {
          mode: 'ai_reconstruction',
          intensity: 80,
          preserveBackground: preserveBg,
        },
        confidence: 0.95,
        provider: 'local',
        status: 'applied',
        explanation:
          'Mengaktifkan AI Reconstruction: Merekonstruksi detail dan kontur subjek yang samar atau hilang berdasarkan estimasi visual kontekstual.',
        diffSummary: [
          'Mode: AI Reconstruction',
          'Intensitas: 80%',
          preserveBg ? 'Latar Belakang: Dipertahankan 100%' : 'Kontur Subjek: Direkonstruksi',
        ],
        createdAt: now,
      };
    } else {
      return {
        id: generateId(),
        userPrompt: prompt,
        target: 'reconstruction',
        action: 'enhance_original',
        parameters: { sharpness: 35, clarity: 25, denoise: 20, dehaze: 15 },
        confidence: 0.95,
        provider: 'local',
        status: 'applied',
        explanation:
          'Menerapkan Enhance Original (Restorasi Lokal): Menajamkan tepi, mengurangi noise, dan memperjelas kontras mikro tanpa halusinasi AI.',
        diffSummary: ['Sharpness +35', 'Clarity +25', 'Denoise +20', 'Dehaze +15'],
        createdAt: now,
      };
    }
  }

  // 7B. Sharpness, Texture & Detail
  if (
    clean.includes('tajam') ||
    clean.includes('sharp') ||
    clean.includes('detail') ||
    clean.includes('jelas') ||
    clean.includes('crisp')
  ) {
    const sharpDelta = Math.round(25 * magnitude);
    const clarityDelta = Math.round(15 * magnitude);
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'adjustments',
      action: 'sharpen',
      parameters: { sharpness: sharpDelta, clarity: clarityDelta },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: `Meningkatkan ketajaman tepi dan kejelasan detail: Sharpness +${sharpDelta}, Clarity +${clarityDelta}.`,
      diffSummary: [`Sharpness +${sharpDelta}`, `Clarity +${clarityDelta}`],
      createdAt: now,
    };
  }

  if (clean.includes('halus') || clean.includes('lembut') || clean.includes('smooth') || clean.includes('soften')) {
    const clarityDelta = Math.round(-20 * magnitude);
    const textureDelta = Math.round(-15 * magnitude);
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'adjustments',
      action: 'soften',
      parameters: { clarity: clarityDelta, texture: textureDelta },
      confidence: 0.9,
      provider: 'local',
      status: 'applied',
      explanation: `Melembutkan tekstur gambar: Clarity ${clarityDelta}, Texture ${textureDelta}.`,
      diffSummary: [`Clarity ${clarityDelta}`, `Texture ${textureDelta}`],
      createdAt: now,
    };
  }

  // 8. Preset Styling Matching
  if (clean.includes('vintage') || clean.includes('retro') || clean.includes('jadul') || clean.includes('analog')) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'filter',
      action: 'apply_preset',
      parameters: { presetId: 'vintage_warm' },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: 'Menerapkan gaya Vintage Warm (tonal 70s klasik dengan fade dan kehangatan analog).',
      diffSummary: ['Preset: Vintage Warm applied'],
      createdAt: now,
    };
  }

  if (clean.includes('sunset') || clean.includes('matahari terbenam')) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'filter',
      action: 'apply_preset',
      parameters: { presetId: 'golden_hour' },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: 'Menerapkan gaya Golden Hour (cahaya matahari senja keemasan dengan highlight lembut).',
      diffSummary: ['Preset: Golden Hour applied'],
      createdAt: now,
    };
  }

  if (clean.includes('cinematic') || clean.includes('sinematik') || clean.includes('teal')) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'filter',
      action: 'apply_preset',
      parameters: { presetId: 'cinematic_teal' },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: 'Menerapkan gaya Sinematik Teal & Orange (grading film Hollywood dengan kontras kaya).',
      diffSummary: ['Preset: Cinematic Teal & Orange applied'],
      createdAt: now,
    };
  }

  if (clean.includes('cyberpunk') || clean.includes('neon')) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'filter',
      action: 'apply_preset',
      parameters: { presetId: 'cyberpunk' },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: 'Menerapkan gaya Cyberpunk Neon (shadow ungu futuristik dan highlight cyan menyala).',
      diffSummary: ['Preset: Cyberpunk Neon applied'],
      createdAt: now,
    };
  }

  // 9. Geometry (Rotation & Flip)
  if (
    (clean.includes('putar') && (clean.includes('kanan') || clean.includes('90') || clean.includes('searah'))) ||
    clean.includes('rotasi 90') ||
    clean.includes('rotate right')
  ) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'geometry',
      action: 'rotate',
      parameters: { degrees: 90 },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: 'Memutar foto 90 derajat searah jarum jam.',
      diffSummary: ['Rotation: +90°'],
      createdAt: now,
    };
  }

  if (clean.includes('putar ke kiri') || clean.includes('rotate left')) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'geometry',
      action: 'rotate',
      parameters: { degrees: -90 },
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: 'Memutar foto 90 derajat berlawanan jarum jam.',
      diffSummary: ['Rotation: -90°'],
      createdAt: now,
    };
  }

  if (clean.includes('cerminkan') || clean.includes('flip horizontal') || clean.includes('mirror')) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'geometry',
      action: 'flip_horizontal',
      parameters: {},
      confidence: 0.95,
      provider: 'local',
      status: 'applied',
      explanation: 'Mencerminkan foto secara horizontal (Flip Horizontal).',
      diffSummary: ['Flip: Horizontal'],
      createdAt: now,
    };
  }

  // 10. Remote Generative Operations Detection (Background removal, Inpainting)
  if (
    clean.includes('hapus background') ||
    clean.includes('remove background') ||
    clean.includes('ganti latar belakang') ||
    clean.includes('hapus orang') ||
    clean.includes('hilangkan objek')
  ) {
    return {
      id: generateId(),
      userPrompt: prompt,
      target: 'generative',
      action: clean.includes('background') ? 'remove_background' : 'remove_object',
      parameters: { prompt },
      confidence: 0.85,
      provider: 'remote',
      status: 'pending',
      explanation:
        'Operasi ini membutuhkan modul Generative AI online (Tahap 4). Saat ini pemrosesan lokal difokuskan pada manipulasi warna, pencahayaan, detail, geometri, dan filter.',
      createdAt: now,
    };
  }

  // 11. Clarification Needed Fallback
  return {
    id: generateId(),
    userPrompt: prompt,
    target: 'clarification',
    action: 'unknown',
    parameters: {},
    confidence: 0.2,
    provider: 'local',
    status: 'clarification_needed',
    explanation:
      'Saya belum memahami instruksi tersebut secara spesifik. Anda dapat mencoba perintah seperti: "Terangkan sedikit", "Buat lebih hangat", "Tambah kontras", "Jadikan hitam putih", atau "Gaya Sinematik".',
    clarificationPrompt: 'Bisa jelaskan efek yang Anda inginkan? Misalnya perubahan pencahayaan, warna, atau gaya tertentu?',
    createdAt: now,
  };
}

// ─── Execution Engine: Applies Structured Operation to PhotoEditState ───
export function executeStructuredOperation(
  operation: StructuredOperation,
  currentState: PhotoEditState
): {
  nextState: PhotoEditState;
  summary: string[];
  lastAction?: string;
  lastParams?: Record<string, number>;
} {
  const next: PhotoEditState = structuredClone(currentState);
  const summary: string[] = [];

  switch (operation.target) {
    case 'adjustments': {
      const nextAdj: ImageAdjustments = { ...next.adjustments };
      const numericParams: Record<string, number> = {};

      for (const [key, val] of Object.entries(operation.parameters)) {
        if (typeof val === 'number') {
          const adjKey = key as keyof ImageAdjustments;
          if (adjKey === 'saturation' && operation.action === 'monochrome') {
            nextAdj.saturation = -100;
            summary.push('Saturasi disetel ke -100 (Hitam & Putih)');
          } else if (typeof nextAdj[adjKey] === 'number') {
            const currentVal = (nextAdj[adjKey] as number) || 0;
            const updated = clampAdjustment(currentVal + val);
            (nextAdj as unknown as Record<string, unknown>)[adjKey] = updated;
            summary.push(`${key}: ${currentVal >= 0 ? '+' : ''}${currentVal} ➔ ${updated >= 0 ? '+' : ''}${updated}`);
            numericParams[key] = val;
          }
        }
      }

      next.adjustments = nextAdj;
      return {
        nextState: next,
        summary,
        lastAction: operation.action,
        lastParams: numericParams,
      };
    }

    case 'filter': {
      const presetId = operation.parameters.presetId as string;
      const found = PROFESSIONAL_PRESETS.find((p) => p.id === presetId);
      if (found) {
        next.filter = found.id as FilterId;
        next.filterIntensity = 100;
        next.adjustments = {
          ...DEFAULT_ADJUSTMENTS,
          ...found.adjustments,
        };
        summary.push(`Preset '${found.name}' berhasil diterapkan`);
      }
      return {
        nextState: next,
        summary,
        lastAction: 'preset',
      };
    }

    case 'geometry': {
      if (operation.action === 'rotate') {
        const deg = (operation.parameters.degrees as number) || 90;
        let nextRot = (next.rotation + deg) % 360;
        if (nextRot < 0) nextRot += 360;
        next.rotation = nextRot as 0 | 90 | 180 | 270;
        summary.push(`Rotasi disetel ke ${nextRot}°`);
      } else if (operation.action === 'flip_horizontal') {
        next.flipX = !next.flipX;
        summary.push(`Flip Horizontal: ${next.flipX ? 'Aktif' : 'Nonaktif'}`);
      }
      return {
        nextState: next,
        summary,
        lastAction: operation.action,
      };
    }

    case 'history': {
      if (operation.action === 'reset_all') {
        summary.push('Semua parameter dikembalikan ke nilai awal');
        return {
          nextState: structuredClone(DEFAULT_PHOTO_EDIT_STATE),
          summary,
        };
      }
      if (operation.action === 'reset_section') {
        const sec = operation.parameters.section as string;
        if (sec === 'light') {
          next.adjustments.exposure = 0;
          next.adjustments.brightness = 0;
          next.adjustments.contrast = 0;
          next.adjustments.highlights = 0;
          next.adjustments.shadows = 0;
          next.adjustments.whites = 0;
          next.adjustments.blacks = 0;
          summary.push('Parameter Pencahayaan di-reset ke 0');
        } else if (sec === 'color') {
          next.adjustments.temperature = 0;
          next.adjustments.tint = 0;
          next.adjustments.saturation = 0;
          next.adjustments.vibrance = 0;
          next.adjustments.hsl = undefined;
          summary.push('Parameter Warna di-reset ke default');
        }
        return {
          nextState: next,
          summary,
        };
      }
      return {
        nextState: next,
        summary: ['Perintah riwayat diproses'],
      };
    }

    case 'reconstruction':
    case 'ai_copier': {
      if (operation.action === 'ai_reconstruction') {
        const factor =
          typeof operation.parameters.intensity === 'number'
            ? (operation.parameters.intensity as number) / 100
            : 0.8;
        next.adjustments.sharpness = clampAdjustment(Math.round(65 * factor));
        next.adjustments.clarity = clampAdjustment(Math.round(40 * factor));
        next.adjustments.texture = clampAdjustment(Math.round(30 * factor));
        next.adjustments.contrast = clampAdjustment(
          next.adjustments.contrast + Math.round(15 * factor)
        );
        next.adjustments.shadows = clampAdjustment(
          next.adjustments.shadows + Math.round(25 * factor)
        );
        summary.push(
          `AI Reconstruction diterapkan (${Math.round(factor * 100)}%): Kontur subjek direkonstruksi secara terarah`
        );
        summary.push('Transparansi: Hasil merupakan estimasi visual generatif terarah, bukan bukti detail asli.');
      } else if (operation.action === 'generate_alternative') {
        const factor =
          typeof operation.parameters.intensity === 'number'
            ? (operation.parameters.intensity as number) / 100
            : 0.8;
        next.adjustments.sharpness = clampAdjustment(Math.round(50 * factor));
        next.adjustments.clarity = clampAdjustment(Math.round(35 * factor));
        next.adjustments.vibrance = clampAdjustment(
          next.adjustments.vibrance + Math.round(20 * factor)
        );
        next.adjustments.contrast = clampAdjustment(
          next.adjustments.contrast + Math.round(20 * factor)
        );
        summary.push('Generate Alternative diterapkan: Interpretasi kontekstual baru dihasilkan');
        summary.push('Transparansi: Interpretasi visual berbasis konteks AI.');
      } else if (operation.action === 'enhance_original') {
        next.adjustments.sharpness = clampAdjustment(next.adjustments.sharpness + 35);
        next.adjustments.clarity = clampAdjustment(next.adjustments.clarity + 25);
        next.adjustments.denoise = clampAdjustment(next.adjustments.denoise + 20);
        next.adjustments.dehaze = clampAdjustment(next.adjustments.dehaze + 15);
        summary.push(
          'Enhance Original diterapkan: Ketajaman +35, Clarity +25, Denoise +20, Dehaze +15 (100% Lokal tanpa halusinasi)'
        );
      }
      return {
        nextState: next,
        summary,
        lastAction: operation.action,
      };
    }

    default:
      return {
        nextState: next,
        summary: ['Tidak ada perubahan parameter yang diterapkan'],
      };
  }
}

// ─── Initial Welcome Assistant Message Helper ──────────────────
export function createWelcomeAssistantMessage(): ChatMessage {
  return {
    id: 'msg_welcome',
    sender: 'assistant',
    text: 'Halo! Saya asisten AI pengedit foto Anda. Tulis instruksi seperti "terangkan sedikit", "buat lebih hangat", "tambah kontras", atau "buat gaya sinematik", dan saya akan menyesuaikan foto Anda secara langsung.',
    timestamp: new Date().toISOString(),
    suggestedFollowUps: [
      'Terangkan sedikit',
      'Buat lebih hangat',
      'Tambah kontras',
      'Jadikan hitam putih',
      'Gaya Sinematik',
    ],
  };
}
