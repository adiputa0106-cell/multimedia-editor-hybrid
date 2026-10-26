/**
 * Core types — platform-agnostic edit state.
 * Tidak menyimpan bytes media, hanya instruksi editing.
 */

export const SCHEMA_VERSION = 1;

export type MediaType = 'photo' | 'video';

export interface SourceMetadata {
  localUri: string;          // platform-specific URI
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
  durationMs?: number;       // video only
  frameRate?: number;        // video only, jika diketahui
}

export interface ImageAdjustments {
  brightness: number;        // -100 to 100
  contrast: number;
  saturation: number;
}

export type FilterId =
  | 'none'
  | 'grayscale'
  | 'sepia'
  | 'warm'
  | 'cool'
  | 'vintage'
  | 'dramatic';

export interface TextLayer {
  id: string;
  text: string;
  x: number;                 // 0-1 normalized
  y: number;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export type ColorChannel =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'aqua'
  | 'blue'
  | 'purple'
  | 'magenta';

export interface HSLChannelDelta {
  hue: number;        // -100 to 100
  saturation: number; // -100 to 100
  luminance: number;  // -100 to 100
}

export type HSLMixerState = Record<ColorChannel, HSLChannelDelta>;

export interface AIExtractedColorProfile {
  exposure: number;
  contrast: number;
  brightness: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  confidence: number;
  colorMoodTag: 'cinematic_warm' | 'moody_dark' | 'faded_vintage' | 'crisp_cool' | 'vibrant_nature';
}

export interface PhotoEditState {
  rotation: number;          // 0, 90, 180, 270
  flipX: boolean;
  flipY: boolean;
  adjustments: ImageAdjustments;
  filter: FilterId;
  textLayers: TextLayer[];
  crop: CropRect | null;
  hslMixer?: HSLMixerState;
}

export interface VideoClip {
  id: string;
  sourceIn: number;          // ms
  sourceOut: number;         // ms
  position: number;          // ms on timeline
}

export interface VideoEditState {
  clips: VideoClip[];
  playbackRate: number;
  audioEnabled: boolean;
  audioVolume: number;       // 0-1
  rotation: number;
  adjustments: ImageAdjustments;
  textLayers: TextLayer[];
}

export type ResolutionPreset =
  | 'original'
  | 'sd_480p'
  | 'hd_720p'
  | 'fullhd_1080p'
  | 'qhd_1440p'
  | 'cinema_2k'
  | 'uhd_4k';

export interface ExportSettings {
  resolution: ResolutionPreset;
  photoFormat?: 'jpeg' | 'png';
  photoQuality?: number;
}

export interface Project {
  schemaVersion: number;
  projectId: string;
  name: string;
  mediaType: MediaType;
  source: SourceMetadata;
  editState: PhotoEditState | VideoEditState;
  exportSettings: ExportSettings;
  createdAt: string;
  updatedAt: string;
}

// ─── Defaults ───────────────────────────────────────────

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

export const DEFAULT_HSL_CHANNEL: HSLChannelDelta = Object.freeze({
  hue: 0,
  saturation: 0,
  luminance: 0,
});

export const DEFAULT_HSL_MIXER: HSLMixerState = Object.freeze({
  red: { ...DEFAULT_HSL_CHANNEL },
  orange: { ...DEFAULT_HSL_CHANNEL },
  yellow: { ...DEFAULT_HSL_CHANNEL },
  green: { ...DEFAULT_HSL_CHANNEL },
  aqua: { ...DEFAULT_HSL_CHANNEL },
  blue: { ...DEFAULT_HSL_CHANNEL },
  purple: { ...DEFAULT_HSL_CHANNEL },
  magenta: { ...DEFAULT_HSL_CHANNEL },
});

export const DEFAULT_PHOTO_EDIT_STATE: PhotoEditState = {
  rotation: 0,
  flipX: false,
  flipY: false,
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  filter: 'none',
  textLayers: [],
  crop: null,
  hslMixer: { ...DEFAULT_HSL_MIXER },
};

export const DEFAULT_VIDEO_EDIT_STATE: VideoEditState = {
  clips: [],
  playbackRate: 1,
  audioEnabled: true,
  audioVolume: 1,
  rotation: 0,
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  textLayers: [],
};

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  resolution: 'original',
  photoFormat: 'jpeg',
  photoQuality: 0.92,
};

// ─── Helpers ────────────────────────────────────────────

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function clampAdjustment(v: number): number {
  return Math.max(-100, Math.min(100, v));
}

export function clampVolume(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ─── HistoryManager ─────────────────────────────────────

export class HistoryManager<T> {
  private history: T[] = [];
  private cursor = 0;

  constructor(initialState: T) {
    this.history = [structuredClone(initialState)];
    this.cursor = 0;
  }

  get current(): T {
    return this.history[this.cursor];
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.history.length - 1;
  }

  push(state: T): void {
    this.history = this.history.slice(0, this.cursor + 1);
    this.history.push(structuredClone(state));
    this.cursor = this.history.length - 1;
  }

  undo(): T | null {
    if (!this.canUndo) return null;
    this.cursor--;
    return this.current;
  }

  redo(): T | null {
    if (!this.canRedo) return null;
    this.cursor++;
    return this.current;
  }

  reset(state: T): void {
    this.history = [structuredClone(state)];
    this.cursor = 0;
  }
}
