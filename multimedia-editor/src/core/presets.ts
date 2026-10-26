/**
 * 15 Professional Color Grading Presets & Custom Preset Manager
 *
 * Tiap preset merupakan konfigurasi parameter nyata (Light, Color, Detail, Effects, Grading)
 * non-destruktif dengan dukungan intensitas 0-100%, preview swatch, dan penyimpanan preset kustom.
 */

import type { FilterId, ImageAdjustments } from './types';

export interface PresetDefinition {
  id: FilterId;
  name: string;
  category: 'Cinematic' | 'Film & Vintage' | 'Portrait' | 'Mood & Tone' | 'Creative';
  description: string;
  badge: string;
  sampleGradient: string;
  defaultIntensity: number;
  adjustments: Partial<ImageAdjustments>;
}

export interface CustomUserPreset {
  id: string;
  name: string;
  createdAt: string;
  adjustments: ImageAdjustments;
  filter: FilterId;
  filterIntensity: number;
}

export const PROFESSIONAL_PRESETS: PresetDefinition[] = [
  {
    id: 'dark_blue_cinematic',
    name: 'Dark Blue Cinematic',
    category: 'Cinematic',
    description: 'Nuansa biru laut dalam pada bayangan dengan kontras sinematik Hollywood.',
    badge: '🎬 Populer',
    sampleGradient: 'linear-gradient(135deg, #0b1a30 0%, #1a365d 50%, #2b6cb0 100%)',
    defaultIntensity: 100,
    adjustments: {
      exposure: -8,
      contrast: 22,
      highlights: -10,
      shadows: -12,
      temperature: -18,
      tint: 4,
      saturation: -10,
      clarity: 15,
      vignette: 24,
      gradingShadows: { hue: 220, saturation: 45 },
      gradingHighlights: { hue: 200, saturation: 20 },
    },
  },
  {
    id: 'teal_and_orange',
    name: 'Teal & Orange',
    category: 'Cinematic',
    description: 'Warna komplementer blockbuster: bayangan teal dingin dan kulit oranye hangat.',
    badge: '🔥 Blockbuster',
    sampleGradient: 'linear-gradient(135deg, #007791 0%, #20b2aa 45%, #ff8c00 100%)',
    defaultIntensity: 100,
    adjustments: {
      exposure: 0,
      contrast: 18,
      highlights: -6,
      shadows: 10,
      temperature: 12,
      tint: -6,
      saturation: 15,
      vibrance: 25,
      clarity: 12,
      gradingShadows: { hue: 190, saturation: 50 },
      gradingHighlights: { hue: 35, saturation: 45 },
    },
  },
  {
    id: 'vintage_film',
    name: 'Vintage Film',
    category: 'Film & Vintage',
    description: 'Tekstur film analog 35mm dengan bayangan matte terangkat dan butiran halus.',
    badge: '🎞️ 35mm',
    sampleGradient: 'linear-gradient(135deg, #3d312a 0%, #7d6350 50%, #d8b89d 100%)',
    defaultIntensity: 100,
    adjustments: {
      exposure: 4,
      contrast: -8,
      highlights: -15,
      shadows: 20,
      temperature: 16,
      tint: 8,
      saturation: -12,
      fade: 26,
      grain: 28,
      vignette: 15,
    },
  },
  {
    id: 'korean_clean',
    name: 'Korean Clean',
    category: 'Portrait',
    description: 'Gaya visual bersih, kulit porselen cerah, kontras lembut, dan highlight bersinar.',
    badge: '✨ Aesthetic',
    sampleGradient: 'linear-gradient(135deg, #f7fafc 0%, #edf2f7 50%, #e2e8f0 100%)',
    defaultIntensity: 90,
    adjustments: {
      exposure: 14,
      brightness: 10,
      contrast: -12,
      highlights: 12,
      shadows: 18,
      whites: 15,
      blacks: 6,
      temperature: -4,
      tint: 2,
      saturation: -10,
      vibrance: 8,
      clarity: -6,
    },
  },
  {
    id: 'soft_pastel',
    name: 'Soft Pastel',
    category: 'Creative',
    description: 'Warna-warna lembut bernuansa peach-pink pastel dengan pencahayaan dreamy.',
    badge: '🌸 Pastel',
    sampleGradient: 'linear-gradient(135deg, #fbb6ce 0%, #fed7e2 50%, #feebc8 100%)',
    defaultIntensity: 85,
    adjustments: {
      exposure: 10,
      contrast: -16,
      highlights: 8,
      shadows: 22,
      temperature: 8,
      tint: 14,
      saturation: -8,
      vibrance: 12,
      fade: 14,
    },
  },
  {
    id: 'moody_green',
    name: 'Moody Green',
    category: 'Mood & Tone',
    description: 'Tone hijau lumut pekat, bayangan dalam, dan saturasi hangat yang terkendali.',
    badge: '🌲 Hutan',
    sampleGradient: 'linear-gradient(135deg, #1a2f23 0%, #22543d 50%, #276749 100%)',
    defaultIntensity: 100,
    adjustments: {
      exposure: -6,
      contrast: 20,
      highlights: -14,
      shadows: -16,
      temperature: -8,
      tint: -12,
      saturation: -14,
      clarity: 16,
      vignette: 28,
      gradingShadows: { hue: 145, saturation: 35 },
    },
  },
  {
    id: 'black_and_white',
    name: 'Black & White Fine Art',
    category: 'Mood & Tone',
    description: 'Monokrom klasik kontras tinggi dengan gradasi tonal kaya khas cetakan galeri.',
    badge: '⚖️ Klasik',
    sampleGradient: 'linear-gradient(135deg, #111111 0%, #4a5568 50%, #cbd5e0 100%)',
    defaultIntensity: 100,
    adjustments: {
      exposure: 0,
      contrast: 32,
      highlights: 14,
      shadows: -18,
      whites: 18,
      blacks: -12,
      saturation: -100,
      clarity: 22,
      grain: 12,
    },
  },
  {
    id: 'golden_hour',
    name: 'Golden Hour',
    category: 'Mood & Tone',
    description: 'Pancaran sinar matahari sore keemasan yang kaya akan kehangatan dan kelembutan.',
    badge: '🌅 Senja',
    sampleGradient: 'linear-gradient(135deg, #dd6b20 0%, #ed8936 50%, #ecc94b 100%)',
    defaultIntensity: 95,
    adjustments: {
      exposure: 6,
      contrast: 10,
      highlights: -8,
      shadows: 14,
      temperature: 36,
      tint: -2,
      saturation: 18,
      vibrance: 22,
      gradingHighlights: { hue: 42, saturation: 48 },
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    category: 'Creative',
    description: 'Kontras malam kota masa depan: bayangan biru elektrik dan highlight magenta neon.',
    badge: '⚡ Futuristik',
    sampleGradient: 'linear-gradient(135deg, #702459 0%, #b83280 50%, #0bc5ea 100%)',
    defaultIntensity: 100,
    adjustments: {
      exposure: -4,
      contrast: 34,
      highlights: 18,
      shadows: -14,
      temperature: -14,
      tint: 28,
      saturation: 30,
      vibrance: 35,
      clarity: 26,
      vignette: 30,
      gradingShadows: { hue: 195, saturation: 60 },
      gradingHighlights: { hue: 315, saturation: 55 },
    },
  },
  {
    id: 'professional_portrait',
    name: 'Professional Portrait',
    category: 'Portrait',
    description: 'Penyempurnaan warna kulit alami fotografer studio komersial dengan detail tajam.',
    badge: '👤 Studio',
    sampleGradient: 'linear-gradient(135deg, #c05621 0%, #dd6b20 50%, #fbd38d 100%)',
    defaultIntensity: 90,
    adjustments: {
      exposure: 4,
      contrast: 8,
      highlights: -12,
      shadows: 12,
      whites: 6,
      blacks: -4,
      temperature: 4,
      tint: 2,
      saturation: 4,
      vibrance: 12,
      sharpness: 18,
      clarity: 4,
    },
  },
  {
    id: 'matte_film',
    name: 'Matte Film',
    category: 'Film & Vintage',
    description: 'Black point terangkat khas cetakan majalah retro dengan warna teredam.',
    badge: '📖 Editorial',
    sampleGradient: 'linear-gradient(135deg, #2d3748 0%, #4a5568 50%, #718096 100%)',
    defaultIntensity: 95,
    adjustments: {
      exposure: 2,
      contrast: -6,
      highlights: -16,
      shadows: 24,
      fade: 32,
      saturation: -16,
      grain: 20,
    },
  },
  {
    id: 'warm_editorial',
    name: 'Warm Editorial',
    category: 'Portrait',
    description: 'Tampilan majalah mode kelas atas dengan warna hangat elegan dan kontras tegas.',
    badge: '👠 Mode',
    sampleGradient: 'linear-gradient(135deg, #744210 0%, #b7791f 50%, #d69e2e 100%)',
    defaultIntensity: 95,
    adjustments: {
      exposure: 2,
      contrast: 18,
      highlights: -8,
      shadows: 6,
      temperature: 18,
      tint: -4,
      saturation: 8,
      vibrance: 16,
      sharpness: 14,
      clarity: 16,
    },
  },
  {
    id: 'cool_industrial',
    name: 'Cool Industrial',
    category: 'Cinematic',
    description: 'Gaya arsitektur dingin modern: desaturasi baja, bayangan abu-abu dingin, dan ketajaman.',
    badge: '🏢 Arsitektur',
    sampleGradient: 'linear-gradient(135deg, #1a202c 0%, #2d3748 50%, #4a5568 100%)',
    defaultIntensity: 100,
    adjustments: {
      exposure: -4,
      contrast: 24,
      highlights: -6,
      shadows: -10,
      temperature: -24,
      tint: -4,
      saturation: -28,
      clarity: 22,
      sharpness: 16,
    },
  },
  {
    id: 'dreamy_glow',
    name: 'Dreamy Glow',
    category: 'Creative',
    description: 'Efek pencahayaan lembut seperti difusi lensa kabut vintage dengan kehangatan lembut.',
    badge: '☁️ Ethereal',
    sampleGradient: 'linear-gradient(135deg, #fed7d7 0%, #feebc8 50%, #e6fffa 100%)',
    defaultIntensity: 85,
    adjustments: {
      exposure: 12,
      brightness: 12,
      contrast: -18,
      highlights: 20,
      shadows: 16,
      temperature: 6,
      tint: 4,
      saturation: 6,
      clarity: -14,
      fade: 12,
    },
  },
  {
    id: 'natural_portrait',
    name: 'Natural Portrait',
    category: 'Portrait',
    description: 'Restorasi warna akurat alami tanpa pewarnaan berlebih, ideal untuk foto sehari-hari.',
    badge: '🌿 Alami',
    sampleGradient: 'linear-gradient(135deg, #285e61 0%, #319795 50%, #81e6d9 100%)',
    defaultIntensity: 90,
    adjustments: {
      exposure: 2,
      contrast: 6,
      highlights: -4,
      shadows: 8,
      temperature: 2,
      tint: 0,
      saturation: 4,
      vibrance: 10,
      sharpness: 12,
    },
  },
];

const CUSTOM_PRESETS_STORAGE_KEY = 'mediastudio_custom_presets';

export function getCustomPresets(): CustomUserPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomPreset(preset: Omit<CustomUserPreset, 'id' | 'createdAt'>): CustomUserPreset {
  const all = getCustomPresets();
  const created: CustomUserPreset = {
    ...preset,
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  all.unshift(created);
  localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(all));
  return created;
}

export function deleteCustomPreset(id: string): void {
  const all = getCustomPresets().filter((p) => p.id !== id);
  localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(all));
}
