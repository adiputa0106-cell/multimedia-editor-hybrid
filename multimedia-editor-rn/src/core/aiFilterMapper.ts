import {
  type PhotoEditState,
  type AIExtractedColorProfile,
  clampAdjustment,
  type HistoryManager,
  type FilterId,
} from './types';

export interface ApplyAIFilterOptions {
  intensity?: number; // 0.0 s/d 1.0 (kekuatan aplikasi filter, default: 1.0)
  includeFilterPreset?: boolean;
}

/**
 * Mengaplikasikan hasil ekstraksi visual metadata AI ke dalam Edit-State lokal aplikasi.
 */
export function applyAIFilterToLocalState(
  currentState: PhotoEditState,
  aiProfile: AIExtractedColorProfile,
  history?: HistoryManager<PhotoEditState>,
  options: ApplyAIFilterOptions = {}
): PhotoEditState {
  const { intensity = 1.0, includeFilterPreset = true } = options;

  const blend = (target: number, current: number = 0) =>
    clampAdjustment(Math.round(current + (target - current) * intensity));

  // Mapping parameter AI ke model editState aplikasi lokal
  const nextAdjustments = {
    ...currentState.adjustments,
    brightness: blend(aiProfile.brightness, currentState.adjustments.brightness),
    contrast: blend(aiProfile.contrast, currentState.adjustments.contrast),
    saturation: blend(aiProfile.saturation, currentState.adjustments.saturation),
  };

  const matchedFilter = includeFilterPreset
    ? mapMoodToPresetFilter(aiProfile.colorMoodTag)
    : currentState.filter;

  const updatedState: PhotoEditState = {
    ...currentState,
    adjustments: nextAdjustments,
    filter: matchedFilter,
  };

  // Rekam ke history stack untuk mendukung Undo/Redo multi-level
  if (history) {
    history.push(updatedState);
  }

  return updatedState;
}

/**
 * Helper pemetaan tag mood AI ke preset filter internal
 */
export function mapMoodToPresetFilter(mood: AIExtractedColorProfile['colorMoodTag']): FilterId {
  switch (mood) {
    case 'cinematic_warm':
      return 'warm';
    case 'crisp_cool':
      return 'cool';
    case 'faded_vintage':
      return 'vintage';
    case 'moody_dark':
      return 'dramatic';
    case 'vibrant_nature':
      return 'none';
    default:
      return 'none';
  }
}

/**
 * Simulasi Ekstraksi Visual Metadata AI (Local Client Heuristic)
 * Menganalisis URI foto referensi secara lokal dan menghasilkan profil warna cerdas
 */
export async function simulateAIVisualAnalysis(
  referenceUri: string
): Promise<AIExtractedColorProfile> {
  // Simulasi latensi analisis pemrosesan (300-600ms)
  await new Promise((resolve) => setTimeout(resolve, 450));

  // Buat seed deterministik sederhana berdasarkan nama/URI file
  const hash = referenceUri
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);

  const moodProfiles: AIExtractedColorProfile[] = [
    {
      exposure: 15,
      contrast: 25,
      brightness: 12,
      highlights: -18,
      shadows: 14,
      temperature: 28,
      tint: -6,
      vibrance: 20,
      saturation: 15,
      confidence: 0.94,
      colorMoodTag: 'cinematic_warm',
    },
    {
      exposure: -10,
      contrast: 35,
      brightness: -8,
      highlights: -30,
      shadows: -15,
      temperature: -14,
      tint: 4,
      vibrance: -10,
      saturation: -25,
      confidence: 0.91,
      colorMoodTag: 'moody_dark',
    },
    {
      exposure: 8,
      contrast: -12,
      brightness: 18,
      highlights: 10,
      shadows: 22,
      temperature: 16,
      tint: 12,
      vibrance: -8,
      saturation: -18,
      confidence: 0.88,
      colorMoodTag: 'faded_vintage',
    },
    {
      exposure: 5,
      contrast: 18,
      brightness: 4,
      highlights: -10,
      shadows: 8,
      temperature: -32,
      tint: -10,
      vibrance: 15,
      saturation: 12,
      confidence: 0.93,
      colorMoodTag: 'crisp_cool',
    },
  ];

  return moodProfiles[hash % moodProfiles.length];
}
