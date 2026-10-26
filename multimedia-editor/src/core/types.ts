/**
 * Project Core Types — Platform-Agnostic
 *
 * Edit-state menyimpan instruksi editing, bukan media asli.
 * localReference bersifat khusus platform.
 * Database hanya metadata dan edit-state, bukan bytes foto/video.
 */

export const SCHEMA_VERSION = 1;

// ─── Media Types ───────────────────────────────────────────

export type MediaType = 'photo' | 'video';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'dirty';

export interface SourceMetadata {
  localReference: string; // platform-specific, jangan dipakai lintas perangkat
  assetId?: string; // Stable UUID pointing to persistent asset store (IndexedDB media_assets)
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number; // bytes
  orientation?: number; // EXIF orientation
  durationMs?: number; // video only
  frameRate?: number; // video only, jika diketahui
}

// ─── Photo Edit State ──────────────────────────────────────

export interface CropRect {
  x: number; // 0-1 normalized
  y: number;
  width: number;
  height: number;
}

export type HSLColorName =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'aqua'
  | 'blue'
  | 'purple'
  | 'magenta';

export interface HSLChannelShift {
  hue: number;        // -100 to 100
  saturation: number; // -100 to 100
  luminance: number;  // -100 to 100
}

export interface ColorWheelGrading {
  hue: number;        // 0 to 360 degrees
  saturation: number; // 0 to 100
  luminance?: number; // -100 to 100
}

export type AIMatchMode = 'natural' | 'balanced' | 'strong';

export interface LabColorStats {
  lMean: number; // 0 to 100
  aMean: number; // -128 to 127
  bMean: number; // -128 to 127
  lStd: number;
  aStd: number;
  bStd: number;
}

export interface ToneCurvePoints {
  shadows: number;    // -100 to 100 (Composite RGB S-curve shadows)
  midtones: number;   // -100 to 100 (Composite RGB S-curve midtones)
  highlights: number; // -100 to 100 (Composite RGB S-curve highlights)
  red?: number;       // -100 to 100 (Red channel tone curve offset)
  green?: number;     // -100 to 100 (Green channel tone curve offset)
  blue?: number;      // -100 to 100 (Blue channel tone curve offset)
}

export interface ImageAdjustments {
  // Light
  exposure: number;   // -100 to 100, default 0
  brightness: number; // -100 to 100, default 0
  contrast: number;   // -100 to 100, default 0
  highlights: number; // -100 to 100, default 0
  shadows: number;    // -100 to 100, default 0
  whites: number;     // -100 to 100, default 0
  blacks: number;     // -100 to 100, default 0

  // Color
  temperature: number;// -100 to 100, default 0 (cool -100 to warm +100)
  tint: number;       // -100 to 100, default 0 (green -100 to magenta +100)
  saturation: number; // -100 to 100, default 0
  vibrance: number;   // -100 to 100, default 0
  hsl?: Partial<Record<HSLColorName, HSLChannelShift>>;

  // Detail
  sharpness: number;  // 0 to 100, default 0
  clarity: number;    // -100 to 100, default 0
  texture: number;    // -100 to 100, default 0
  denoise: number;    // 0 to 100, default 0
  dehaze: number;     // -100 to 100, default 0

  // Effects
  vignette: number;   // -100 to 100, default 0
  grain: number;      // 0 to 100, default 0
  fade: number;       // 0 to 100, default 0

  // Advanced Color Grading
  gradingShadows?: ColorWheelGrading;
  gradingMidtones?: ColorWheelGrading;
  gradingHighlights?: ColorWheelGrading;
  toneCurve?: ToneCurvePoints;
}

export type FilterId =
  | 'none'
  | 'grayscale'
  | 'sepia'
  | 'warm'
  | 'cool'
  | 'vintage'
  | 'dramatic'
  // 15 Preset Profesional
  | 'dark_blue_cinematic'
  | 'teal_and_orange'
  | 'vintage_film'
  | 'korean_clean'
  | 'soft_pastel'
  | 'moody_green'
  | 'black_and_white'
  | 'golden_hour'
  | 'cyberpunk'
  | 'professional_portrait'
  | 'matte_film'
  | 'warm_editorial'
  | 'cool_industrial'
  | 'dreamy_glow'
  | 'natural_portrait';

export interface TextLayer {
  id: string;
  text: string;
  x: number; // normalized 0-1
  y: number;
  fontSize: number; // px
  fontFamily: string;
  color: string;
  rotation: number; // degrees
  bold: boolean;
  italic: boolean;
}

export type ColorMoodTag =
  | 'cinematic_warm'
  | 'moody_dark'
  | 'faded_vintage'
  | 'crisp_cool'
  | 'vibrant_nature'
  | 'dramatic_contrast'
  | 'cyberpunk_neon'
  | 'monochrome_classic';

export interface AIExtractedColorProfile {
  exposure: number;
  contrast: number;
  brightness: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number; // -100 (cool) to +100 (warm)
  tint: number;        // -100 (green) to +100 (magenta)
  vibrance: number;
  saturation: number;
  clarity: number;
  fade: number;
  vignette: number;
  grain: number;
  confidence: number;  // 0.0 to 1.0
  colorMoodTag: ColorMoodTag;
  dominantPalette: string[]; // Top 5 Hex color codes
  analysisTimeMs: number;
  blackPoint: number;  // 0-255
  whitePoint: number;  // 0-255
  dynamicRange: number;// 0-255
  hasHumanSkin: boolean;
  skinToneRatio: number; // 0.0 to 1.0
  isMonochrome?: boolean; // True jika gambar hitam-putih / saturasi mendekati nol
  isLowLight?: boolean;   // True jika foto memiliki median luminansi rendah (<55)
  isHighKey?: boolean;    // True jika foto memiliki dominansi luminansi tinggi (>185)
  isBacklit?: boolean;    // True jika foto berkarakter backlight/siluet dengan rentang dinamis ekstrem
  perceivedWarmthLab?: number; // CIE Lab b* mean
  perceivedTintLab?: number;   // CIE Lab a* mean
  histogram: {
    shadowsAvg: number;
    midtonesAvg: number;
    highlightsAvg: number;
    quantiles: [number, number, number, number, number]; // 5th, 25th, 50th, 75th, 95th
  };
  gradingShadows?: ColorWheelGrading;
  gradingMidtones?: ColorWheelGrading;
  gradingHighlights?: ColorWheelGrading;
  toneCurve?: ToneCurvePoints;
  hslChannels?: Partial<Record<HSLColorName, HSLChannelShift>>;
  shadowClippingPercent?: number;    // % pixels at luminance <= 2
  highlightClippingPercent?: number; // % pixels at luminance >= 253
  labStats?: LabColorStats;
}

export interface PhotoEditState {
  crop: CropRect | null;
  rotation: number; // 0, 90, 180, 270
  flipX: boolean;
  flipY: boolean;
  adjustments: ImageAdjustments;
  filter: FilterId;
  filterIntensity?: number; // 0-100, default 100
  textLayers: TextLayer[];
}

// ─── Video Edit State ──────────────────────────────────────

export interface VideoClip {
  id: string;
  sourceIn: number; // ms
  sourceOut: number; // ms
  position: number; // ms on timeline
}

export interface VideoEditState {
  clips: VideoClip[];
  playbackRate: number; // 0.25-4.0
  audioEnabled: boolean;
  audioVolume: number; // 0-1
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  adjustments: ImageAdjustments;
  textLayers: TextLayer[];
}

// ─── Export Settings ───────────────────────────────────────

export type ResolutionPreset =
  | 'sd_480p'
  | 'hd_720p'
  | 'fullhd_1080p'
  | 'qhd_1440p'
  | 'cinema_2k'
  | '4k_uhd'
  | 'custom'
  | 'original';

export type PhotoExportFormat = 'jpeg' | 'png' | 'webp';
export type VideoExportContainer = 'mp4';

export interface ExportSettings {
  resolution: ResolutionPreset;
  customWidth?: number;
  customHeight?: number;
  maintainAspectRatio: boolean;
  // Photo-specific
  photoFormat?: PhotoExportFormat;
  photoQuality?: number; // 0-1 for JPEG and WebP
  // Video-specific
  videoContainer?: VideoExportContainer;
  videoFrameRate?: number;
  videoBitrate?: number; // kbps, if engine supports
}

// ─── Project ───────────────────────────────────────────────

export interface Project {
  schemaVersion: number;
  projectId: string;
  name: string;
  mediaType: MediaType;
  source: SourceMetadata;
  editState: PhotoEditState | VideoEditState;
  exportSettings: ExportSettings;
  createdAt: string; // ISO 8601
  updatedAt: string;
  thumbnail?: string; // small data URL for listing, NOT the full media
}

// ─── Defaults ──────────────────────────────────────────────

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  sharpness: 0,
  clarity: 0,
  texture: 0,
  denoise: 0,
  dehaze: 0,
  vignette: 0,
  grain: 0,
  fade: 0,
};

export const DEFAULT_PHOTO_EDIT_STATE: PhotoEditState = {
  crop: null,
  rotation: 0,
  flipX: false,
  flipY: false,
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  filter: 'none',
  filterIntensity: 100,
  textLayers: [],
};

export const DEFAULT_VIDEO_EDIT_STATE: VideoEditState = {
  clips: [],
  playbackRate: 1,
  audioEnabled: true,
  audioVolume: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  textLayers: [],
};

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  resolution: 'original',
  maintainAspectRatio: true,
  photoFormat: 'jpeg',
  photoQuality: 0.92,
};

// ─── Resolution Presets ────────────────────────────────────

export const RESOLUTION_MAP: Record<
  Exclude<ResolutionPreset, 'custom' | 'original'>,
  { width: number; height: number; label: string }
> = {
  sd_480p: { width: 854, height: 480, label: 'SD 480p' },
  hd_720p: { width: 1280, height: 720, label: 'HD 720p' },
  fullhd_1080p: { width: 1920, height: 1080, label: 'Full HD 1080p' },
  qhd_1440p: { width: 2560, height: 1440, label: 'QHD 1440p' },
  cinema_2k: { width: 2048, height: 1080, label: 'Cinema 2K' },
  '4k_uhd': { width: 3840, height: 2160, label: '4K UHD' },
};

// ─── Validation ────────────────────────────────────────────

export function clampAdjustment(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

export function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function isValidRotation(deg: number): boolean {
  return [0, 90, 180, 270].includes(deg);
}

export function generateId(): string {
  return crypto.randomUUID();
}
