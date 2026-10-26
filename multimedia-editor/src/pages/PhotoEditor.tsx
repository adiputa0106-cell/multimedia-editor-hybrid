import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type PhotoEditState,
  type FilterId,
  type TextLayer,
  type ResolutionPreset,
  type Project,
  type AIExtractedColorProfile,
  type ImageAdjustments,
  type PhotoExportFormat,
  DEFAULT_PHOTO_EDIT_STATE,
  DEFAULT_ADJUSTMENTS,
  clampAdjustment,
  generateId,
  RESOLUTION_MAP,
  type SaveStatus,
} from '../core/types';
import { HistoryManager } from '../core/history';
import {
  saveProject,
  getProject,
  exportProjectToFile,
  saveMediaAsset,
  getMediaAsset,
  saveLastActiveSession,
  getLastActiveSession,
  clearLastActiveSession,
  generateThumbnail,
} from '../core/storage';
import {
  loadImage,
  renderPhotoToCanvas,
  exportPhotoToBlob,
  downloadBlob,
} from '../core/photoEngine';
import {
  analyzeImageColors,
  computeAITransferParameters,
  mapMoodToPreset,
  PRESET_AI_REFERENCES,
  type AITransferOptions,
} from '../core/aiFilterEngine';
import {
  PROFESSIONAL_PRESETS,
  getCustomPresets,
  saveCustomPreset,
  deleteCustomPreset,
  type CustomUserPreset,
} from '../core/presets';
import { type HSLColorName, type AIMatchMode, type ToneCurvePoints } from '../core/types';
import './PhotoEditor.css';
import AIChatAssistant from '../components/AIChatAssistant';
import { AIProviderRegistry, RemoteGenerativeProvider } from '../core/aiProviderAdapter';
import type { StructuredOperation, EditSessionContext } from '../core/conversationTypes';
import {
  analyzeImageElementQuality,
  type ImageQualityReport,
} from '../core/aiReconstructionEngine';

const ACCEPTED_FORMATS = 'image/jpeg,image/png,image/webp';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

type ToolTab = 'adjust' | 'crop' | 'filter' | 'ai' | 'text' | 'export';
type AdjustSection = 'light' | 'color' | 'curve' | 'detail' | 'effects' | 'grading';

export default function PhotoEditor() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Source image
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [targetColorProfile, setTargetColorProfile] = useState<AIExtractedColorProfile | null>(null);

  // Edit state + history
  const [editState, setEditState] = useState<PhotoEditState>(
    structuredClone(DEFAULT_PHOTO_EDIT_STATE)
  );
  const historyRef = useRef<HistoryManager<PhotoEditState>>(
    new HistoryManager(DEFAULT_PHOTO_EDIT_STATE)
  );
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<ToolTab>('adjust');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<PhotoExportFormat>('jpeg');
  const [exportQuality, setExportQuality] = useState(92);
  const [exportResolution, setExportResolution] = useState<ResolutionPreset>('original');

  // Adjust UI section accordion
  const [openAdjustSection, setOpenAdjustSection] = useState<AdjustSection>('light');
  const [activeHSLColor, setActiveHSLColor] = useState<HSLColorName>('orange');

  // Filter tab state
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [customPresets, setCustomPresets] = useState<CustomUserPreset[]>(() => getCustomPresets());
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Project persistence state & restoration refs
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const isRestoringProjectRef = useRef<boolean>(false);
  const loadedProjectEditStateRef = useRef<PhotoEditState | null>(null);

  // Asset management & Autosave states
  const currentAssetIdRef = useRef<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const [missingAsset, setMissingAsset] = useState<string | null>(null);
  const [resumableSession, setResumableSession] = useState<{ id: string; name: string } | null>(null);
  const [isAIChatOpen, setIsAIChatOpen] = useState<boolean>(false);

  // Debounced history commit refs (batches slider micro-ticks into clean undo states)
  const historyDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHistoryStateRef = useRef<PhotoEditState | null>(null);
  const isDraggingSliderRef = useRef<boolean>(false);
  const stateBeforeSliderDragRef = useRef<PhotoEditState | null>(null);

  // Viewport resize & screen orientation observer revision
  const [viewportRevision, setViewportRevision] = useState<number>(0);

  // Crop mode
  const [cropMode, setCropMode] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);

  // ─── AI Filter Copier State (14 Kontrol Penuh) ─────────────
  const aiReferenceInputRef = useRef<HTMLInputElement>(null);
  const [selectedAIProfile, setSelectedAIProfile] = useState<AIExtractedColorProfile | null>(
    PRESET_AI_REFERENCES[0].profile
  );
  const [aiReferenceThumb, setAiReferenceThumb] = useState<string | null>(null);
  const [aiReferenceName, setAiReferenceName] = useState<string>(PRESET_AI_REFERENCES[0].title);
  const [aiReferenceGradient, setAiReferenceGradient] = useState<string | null>(
    PRESET_AI_REFERENCES[0].sampleGradient
  );
  const [isAnalyzingAI, setIsAnalyzingAI] = useState<boolean>(false);
  const [aiIntensity, setAiIntensity] = useState<number>(100);
  const [aiProtectSkin, setAiProtectSkin] = useState<boolean>(true); // Preserve Facial Identity & Complexion
  const [aiPreserveTexture, setAiPreserveTexture] = useState<boolean>(true); // Preserve Original Texture (lock denoise=0, limit sharpness)
  const [aiPreserveBodyShape, setAiPreserveBodyShape] = useState<boolean>(true); // Preserve Body Shape (strict 1:1, 0 warp)
  const [aiSkinSmoothing, setAiSkinSmoothing] = useState<boolean>(false); // Skin Smoothing (Strictly OFF by default)
  const [aiFaceRetouching, setAiFaceRetouching] = useState<boolean>(false); // Face Retouching (Strictly OFF by default)
  const [aiBodyReshaping, setAiBodyReshaping] = useState<boolean>(false); // Body Reshaping (Strictly OFF by default)
  const [aiGenerativeRecon, setAiGenerativeRecon] = useState<boolean>(false); // Generative Reconstruction (Strictly OFF)
  const [zoom100, setZoom100] = useState<boolean>(false); // 100% Zoom (Pixel-to-Pixel 1:1 Inspection)
  const [splitCompare, setSplitCompare] = useState<boolean>(false); // Split Before / After Mode
  const [splitSliderPos, setSplitSliderPos] = useState<number>(50); // Split position 0-100%
  const [aiIncludeAdjustments, setAiIncludeAdjustments] = useState<boolean>(true);
  const [aiIncludeGrading, setAiIncludeGrading] = useState<boolean>(true);
  const [aiIncludeFilter, setAiIncludeFilter] = useState<boolean>(false);
  const [isComparingAI, setIsComparingAI] = useState<boolean>(false);
  const [aiPreviousAdjustments, setAiPreviousAdjustments] = useState<ImageAdjustments | null>(null);
  const [aiMatchMode, setAiMatchMode] = useState<AIMatchMode>('balanced');
  const [aiProcessStatus, setAiProcessStatus] = useState<string>('Siap Diekspor ✓');

  // ─── AI Image Reconstruction & Quality Diagnostic State ───
  const [aiSubTab, setAiSubTab] = useState<'filter_copier' | 'reconstruction' | 'background_removal'>('filter_copier');
  const [reconMode, setReconMode] = useState<'enhance_original' | 'ai_reconstruction' | 'generate_alternative'>('enhance_original');
  const [reconIntensity, setReconIntensity] = useState<number>(80);
  const [reconSubjectHint, setReconSubjectHint] = useState<string>('');
  const [qualityReport, setQualityReport] = useState<ImageQualityReport | null>(null);
  const [isAnalyzingQuality, setIsAnalyzingQuality] = useState<boolean>(false);

  // ─── AI Background Removal State (P2 Online Server) ───────
  const [bgRemovalConsent, setBgRemovalConsent] = useState<boolean>(false);
  const [isProcessingBgRemoval, setIsProcessingBgRemoval] = useState<boolean>(false);
  const [bgRemovalProgress, setBgRemovalProgress] = useState<string>('');
  const [bgRemovalPercent, setBgRemovalPercent] = useState<number>(0);
  const [bgRemovalResultUrl, setBgRemovalResultUrl] = useState<string | null>(null);
  const [bgRemovalError, setBgRemovalError] = useState<string | null>(null);
  const [bgRemovalErrorCode, setBgRemovalErrorCode] = useState<string | null>(null);
  const [backendHealth, setBackendHealth] = useState<{
    available: boolean;
    providerConfigured: boolean;
    activeProvider?: string;
    model?: string;
    message?: string;
  } | null>(null);
  const [isComparingBgRemoval, setIsComparingBgRemoval] = useState<boolean>(false);
  const bgRemovalAbortRef = useRef<AbortController | null>(null);

  // ─── Toast Helper ──────────────────────────────────────
  const showToast = (message: string, type: string) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ─── Screen Orientation & Resize Observer ─────────────
  useEffect(() => {
    const handleResize = () => {
      setViewportRevision((v) => v + 1);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && previewContainerRef.current) {
      ro = new ResizeObserver(() => {
        setViewportRevision((v) => v + 1);
      });
      ro.observe(previewContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (ro) ro.disconnect();
    };
  }, []);

  // ─── History Helpers (With Debounced Commit for Sliders) ───
  const flushHistory = useCallback(() => {
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current);
      historyDebounceTimerRef.current = null;
    }
    if (pendingHistoryStateRef.current) {
      historyRef.current.push(pendingHistoryStateRef.current);
      setCanUndo(historyRef.current.canUndo);
      setCanRedo(historyRef.current.canRedo);
      pendingHistoryStateRef.current = null;
    }
    isDraggingSliderRef.current = false;
    stateBeforeSliderDragRef.current = null;
  }, []);

  // Immediate push for discrete actions (preset, reset, rotate, flip, text layers, etc.)
  const pushState = useCallback(
    (newState: PhotoEditState) => {
      flushHistory();
      historyRef.current.push(newState);
      setEditState(newState);
      setCanUndo(historyRef.current.canUndo);
      setCanRedo(historyRef.current.canRedo);
    },
    [flushHistory]
  );

  // Debounced push for continuous slider dragging (real-time preview, single commit per gesture)
  const pushStateDebounced = useCallback(
    (newState: PhotoEditState) => {
      if (!isDraggingSliderRef.current) {
        isDraggingSliderRef.current = true;
        stateBeforeSliderDragRef.current = editState;
      }
      setEditState(newState);
      pendingHistoryStateRef.current = newState;

      if (historyDebounceTimerRef.current) {
        clearTimeout(historyDebounceTimerRef.current);
      }

      historyDebounceTimerRef.current = setTimeout(() => {
        if (pendingHistoryStateRef.current) {
          historyRef.current.push(pendingHistoryStateRef.current);
          setCanUndo(historyRef.current.canUndo);
          setCanRedo(historyRef.current.canRedo);
          pendingHistoryStateRef.current = null;
        }
        isDraggingSliderRef.current = false;
        stateBeforeSliderDragRef.current = null;
        historyDebounceTimerRef.current = null;
      }, 350);
    },
    [editState]
  );

  const handleUndo = useCallback(() => {
    // If user clicks undo while a slider drag is debouncing, immediately revert to the state before drag
    if (historyDebounceTimerRef.current || pendingHistoryStateRef.current) {
      if (historyDebounceTimerRef.current) {
        clearTimeout(historyDebounceTimerRef.current);
        historyDebounceTimerRef.current = null;
      }
      pendingHistoryStateRef.current = null;
      if (stateBeforeSliderDragRef.current) {
        setEditState(stateBeforeSliderDragRef.current);
        stateBeforeSliderDragRef.current = null;
        isDraggingSliderRef.current = false;
        setCanUndo(historyRef.current.canUndo);
        setCanRedo(historyRef.current.canRedo);
        return;
      }
    }
    const prev = historyRef.current.undo();
    if (prev) {
      setEditState(prev);
      setCanUndo(historyRef.current.canUndo);
      setCanRedo(historyRef.current.canRedo);
    }
  }, []);

  const handleRedo = useCallback(() => {
    flushHistory();
    const next = historyRef.current.redo();
    if (next) {
      setEditState(next);
      setCanUndo(historyRef.current.canUndo);
      setCanRedo(historyRef.current.canRedo);
    }
  }, [flushHistory]);

  const handleReset = useCallback(() => {
    flushHistory();
    const fresh = structuredClone(DEFAULT_PHOTO_EDIT_STATE);
    historyRef.current.reset(fresh);
    setEditState(fresh);
    setCanUndo(false);
    setCanRedo(false);
  }, [flushHistory]);

  const handleResetAdjustments = useCallback(() => {
    const nextState: PhotoEditState = {
      ...editState,
      adjustments: structuredClone(DEFAULT_ADJUSTMENTS),
    };
    pushState(nextState);
    showToast('Semua penyesuaian (adjustments) telah di-reset ke 0', 'info');
  }, [editState, pushState]);

  const handleCopyAdjustments = useCallback(() => {
    try {
      const payload = {
        adjustments: editState.adjustments,
        filter: editState.filter,
        filterIntensity: editState.filterIntensity,
      };
      localStorage.setItem('media_studio_copied_adjustments', JSON.stringify(payload));
      showToast('Penyesuaian warna & efek berhasil disalin ke clipboard!', 'success');
    } catch {
      showToast('Gagal menyalin penyesuaian', 'error');
    }
  }, [editState]);

  const handlePasteAdjustments = useCallback(() => {
    try {
      const raw = localStorage.getItem('media_studio_copied_adjustments');
      if (!raw) {
        showToast('Belum ada penyesuaian yang disalin. Salin dari foto lain terlebih dahulu.', 'warning');
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.adjustments) {
        showToast('Data penyesuaian tidak valid', 'error');
        return;
      }
      const nextState: PhotoEditState = {
        ...editState,
        adjustments: {
          ...editState.adjustments,
          ...parsed.adjustments,
        },
        filter: parsed.filter !== undefined ? parsed.filter : editState.filter,
        filterIntensity: parsed.filterIntensity !== undefined ? parsed.filterIntensity : editState.filterIntensity,
      };
      pushState(nextState);
      showToast('Penyesuaian berhasil diterapkan pada foto ini!', 'success');
    } catch {
      showToast('Gagal menempelkan penyesuaian', 'error');
    }
  }, [editState, pushState]);

  // Scoped reset per category
  const handleResetSection = useCallback(
    (section: AdjustSection) => {
      const nextAdjustments: ImageAdjustments = { ...editState.adjustments };
      switch (section) {
        case 'light':
          nextAdjustments.exposure = 0;
          nextAdjustments.brightness = 0;
          nextAdjustments.contrast = 0;
          nextAdjustments.highlights = 0;
          nextAdjustments.shadows = 0;
          nextAdjustments.whites = 0;
          nextAdjustments.blacks = 0;
          break;
        case 'color':
          nextAdjustments.temperature = 0;
          nextAdjustments.tint = 0;
          nextAdjustments.saturation = 0;
          nextAdjustments.vibrance = 0;
          nextAdjustments.hsl = undefined;
          break;
        case 'curve':
          nextAdjustments.toneCurve = undefined;
          break;
        case 'detail':
          nextAdjustments.sharpness = 0;
          nextAdjustments.clarity = 0;
          nextAdjustments.texture = 0;
          nextAdjustments.denoise = 0;
          nextAdjustments.dehaze = 0;
          break;
        case 'effects':
          nextAdjustments.vignette = 0;
          nextAdjustments.grain = 0;
          nextAdjustments.fade = 0;
          break;
        case 'grading':
          nextAdjustments.gradingShadows = undefined;
          nextAdjustments.gradingMidtones = undefined;
          nextAdjustments.gradingHighlights = undefined;
          break;
      }
      pushState({ ...editState, adjustments: nextAdjustments });
      showToast(`Kategori ${section.toUpperCase()} di-reset ke default`, 'info');
    },
    [editState, pushState]
  );

  // ─── File import ───────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setError(`Format tidak didukung: ${file.type || 'unknown'}. Gunakan JPEG, PNG, atau WebP.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(`File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimum 50 MB.`);
      return;
    }

    try {
      const img = await loadImage(file);
      setSourceImage(img);
      setFileName(file.name);
      setMissingAsset(null);

      // Persist binary media asset to Asset Store in IndexedDB
      const assetId = currentAssetIdRef.current || generateId();
      currentAssetIdRef.current = assetId;
      try {
        await saveMediaAsset(assetId, file);
      } catch (assetErr) {
        console.warn('Gagal menyimpan aset media biner ke IndexedDB:', assetErr);
      }

      if (isRestoringProjectRef.current && loadedProjectEditStateRef.current) {
        const restored = structuredClone(loadedProjectEditStateRef.current);
        setEditState(restored);
        historyRef.current.reset(restored);
        setCanUndo(false);
        setCanRedo(false);
        isRestoringProjectRef.current = false;
        loadedProjectEditStateRef.current = null;
        showToast(`Foto '${file.name}' terhubung ke draf proyek`, 'success');
      } else {
        handleReset();
        showToast('Foto berhasil dimuat. Menganalisis profil warna...', 'info');
      }

      // Asynchronous background color profile extraction for differential AI matching
      analyzeImageColors(img)
        .then((profile) => {
          setTargetColorProfile(profile);
          showToast(`Analisis profil foto selesai (${profile.colorMoodTag})`, 'success');
        })
        .catch(() => {
          console.warn('Gagal mengekstrak profil target, fallback default');
        });
    } catch {
      setError('Gagal memuat gambar. File mungkin rusak.');
    }
  };

  // ─── Foto Sampel Uji Coba Cepat ────────────────────────
  const handleLoadSamplePhoto = () => {
    const oc = document.createElement('canvas');
    oc.width = 1200;
    oc.height = 800;
    const ctx = oc.getContext('2d')!;

    // Golden hour sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, 500);
    sky.addColorStop(0, '#2c3e50');
    sky.addColorStop(0.4, '#e67e22');
    sky.addColorStop(0.7, '#f39c12');
    sky.addColorStop(1, '#f1c40f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1200, 500);

    // Glowing sun
    ctx.beginPath();
    ctx.arc(800, 320, 80, 0, Math.PI * 2);
    ctx.fillStyle = '#fff7d6';
    ctx.shadowColor = '#f39c12';
    ctx.shadowBlur = 40;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Mountain silhouettes
    ctx.fillStyle = '#1e272e';
    ctx.beginPath();
    ctx.moveTo(0, 500);
    ctx.lineTo(250, 280);
    ctx.lineTo(500, 420);
    ctx.lineTo(750, 240);
    ctx.lineTo(1050, 400);
    ctx.lineTo(1200, 310);
    ctx.lineTo(1200, 500);
    ctx.closePath();
    ctx.fill();

    // Ocean & reflections
    const sea = ctx.createLinearGradient(0, 500, 0, 800);
    sea.addColorStop(0, '#d35400');
    sea.addColorStop(0.3, '#34495e');
    sea.addColorStop(1, '#1a252f');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 500, 1200, 300);

    // Sun reflection streaks
    ctx.fillStyle = 'rgba(255, 234, 167, 0.35)';
    ctx.fillRect(720, 500, 160, 300);

    // Human silhouette with skin tone for testing skin protection
    ctx.fillStyle = '#e0ac69'; // Skin tone
    ctx.beginPath();
    ctx.arc(380, 580, 32, 0, Math.PI * 2); // face
    ctx.fill();
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(350, 612, 60, 120); // body

    oc.toBlob(async (blob) => {
      if (!blob) return;
      const assetId = generateId();
      currentAssetIdRef.current = assetId;
      try {
        await saveMediaAsset(assetId, blob);
      } catch {}

      const sampleUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        setSourceImage(img);
        setFileName('sample_sunset_portrait.jpg');
        setMissingAsset(null);
        handleReset();
        analyzeImageColors(img).then((p) => {
          setTargetColorProfile(p);
          showToast(`Foto sampel dimuat (Mood: ${p.colorMoodTag})`, 'success');
        });
      };
      img.src = sampleUrl;
    }, 'image/jpeg', 0.95);
  };

  // ─── Preview rendering ────────────────────────────────
  useEffect(() => {
    if (!sourceImage || !canvasRef.current) return;

    const container = previewContainerRef.current;
    if (!container) return;

    // Calculate display size to fit container
    const maxW = container.clientWidth - 32;
    const maxH = container.clientHeight - 32;

    const rotated = editState.rotation === 90 || editState.rotation === 270;
    let sw = sourceImage.naturalWidth;
    let sh = sourceImage.naturalHeight;

    if (editState.crop) {
      sw = editState.crop.width * sourceImage.naturalWidth;
      sh = editState.crop.height * sourceImage.naturalHeight;
    }

    const baseW = rotated ? sh : sw;
    const baseH = rotated ? sw : sh;
    
    // Zoom 100% uses 1:1 true pixel resolution; otherwise scales to fit preview box
    const scale = zoom100 ? 1 : Math.min(maxW / baseW, maxH / baseH, 1);
    const displayW = Math.round(baseW * scale);
    const displayH = Math.round(baseH * scale);

    const canvas = canvasRef.current;
    canvas.width = displayW;
    canvas.height = displayH;
    const ctx = canvas.getContext('2d')!;

    if (splitCompare) {
      // Split Before / After Mode
      const origRendered = renderPhotoToCanvas(sourceImage, DEFAULT_PHOTO_EDIT_STATE, displayW, displayH);
      const editRendered = renderPhotoToCanvas(sourceImage, editState, displayW, displayH);

      const splitX = Math.max(1, Math.min(displayW - 1, Math.round((displayW * splitSliderPos) / 100)));

      // Draw original slice on left
      ctx.drawImage(origRendered, 0, 0, splitX, displayH, 0, 0, splitX, displayH);
      // Draw edited slice on right
      ctx.drawImage(editRendered, splitX, 0, displayW - splitX, displayH, splitX, 0, displayW - splitX, displayH);

      // Draw split divider line
      ctx.strokeStyle = '#00d4aa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, displayH);
      ctx.stroke();

      // Badges on canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(Math.max(10, splitX - 55), 12, 45, 20);
      ctx.fillRect(Math.min(displayW - 55, splitX + 10), 12, 45, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ASLI', Math.max(10, splitX - 55) + 22, 22);
      ctx.fillText('AI EDIT', Math.min(displayW - 55, splitX + 10) + 22, 22);
    } else {
      const stateToRender = isComparingAI ? DEFAULT_PHOTO_EDIT_STATE : editState;
      const rendered = renderPhotoToCanvas(sourceImage, stateToRender, displayW, displayH);
      ctx.drawImage(rendered, 0, 0);
    }
  }, [sourceImage, editState, isComparingAI, zoom100, splitCompare, splitSliderPos, viewportRevision]);

  // ─── Adjustment handlers ──────────────────────────────
  const updateAdjustment = (key: keyof ImageAdjustments, value: number) => {
    const newState: PhotoEditState = {
      ...editState,
      adjustments: {
        ...editState.adjustments,
        [key]: clampAdjustment(value),
      },
    };
    pushStateDebounced(newState);
  };

  const resetSingleAdjustment = (key: keyof ImageAdjustments) => {
    const defaultVal = DEFAULT_ADJUSTMENTS[key];
    const newState: PhotoEditState = {
      ...editState,
      adjustments: {
        ...editState.adjustments,
        [key]: defaultVal,
      },
    };
    pushState(newState);
  };

  const updateHSLChannel = (
    color: HSLColorName,
    prop: 'hue' | 'saturation' | 'luminance',
    value: number
  ) => {
    const currentHSL = editState.adjustments.hsl || DEFAULT_ADJUSTMENTS.hsl || {};
    const currentChannel = currentHSL[color] || { hue: 0, saturation: 0, luminance: 0 };
    const nextState: PhotoEditState = {
      ...editState,
      adjustments: {
        ...editState.adjustments,
        hsl: {
          ...currentHSL,
          [color]: {
            ...currentChannel,
            [prop]: clampAdjustment(value),
          },
        },
      },
    };
    pushStateDebounced(nextState);
  };

  const updateGradingWheel = (
    wheel: 'gradingShadows' | 'gradingMidtones' | 'gradingHighlights',
    prop: 'hue' | 'saturation' | 'luminance',
    value: number
  ) => {
    const currentWheel = editState.adjustments[wheel] || { hue: 0, saturation: 0, luminance: 0 };
    const nextState: PhotoEditState = {
      ...editState,
      adjustments: {
        ...editState.adjustments,
        [wheel]: {
          ...currentWheel,
          [prop]: prop === 'hue' ? Math.max(0, Math.min(360, value)) : clampAdjustment(value),
        },
      },
    };
    pushStateDebounced(nextState);
  };

  const updateToneCurve = (
    channel: 'shadows' | 'midtones' | 'highlights' | 'red' | 'green' | 'blue',
    value: number
  ) => {
    const currentCurve: ToneCurvePoints = editState.adjustments.toneCurve || {
      shadows: 0,
      midtones: 0,
      highlights: 0,
    };
    const nextState: PhotoEditState = {
      ...editState,
      adjustments: {
        ...editState.adjustments,
        toneCurve: {
          ...currentCurve,
          [channel]: clampAdjustment(value),
        },
      },
    };
    pushStateDebounced(nextState);
  };

  const resetToneCurve = () => {
    const nextState: PhotoEditState = {
      ...editState,
      adjustments: {
        ...editState.adjustments,
        toneCurve: { shadows: 0, midtones: 0, highlights: 0, red: 0, green: 0, blue: 0 },
      },
    };
    pushState(nextState);
    showToast('Tone curve di-reset ke netral', 'info');
  };

  const setFilter = (id: FilterId) => {
    pushState({ ...editState, filter: id });
  };

  const setFilterIntensity = (intensity: number) => {
    pushStateDebounced({ ...editState, filterIntensity: Math.max(0, Math.min(100, intensity)) });
  };

  const applyPresetConfig = (presetAdjustments: Partial<ImageAdjustments>, filterId?: FilterId, intensity?: number) => {
    const mergedAdjustments: ImageAdjustments = {
      ...DEFAULT_ADJUSTMENTS,
      ...presetAdjustments,
    };
    const nextState: PhotoEditState = {
      ...editState,
      filter: filterId || 'none',
      filterIntensity: intensity !== undefined ? intensity : 100,
      adjustments: mergedAdjustments,
    };
    pushState(nextState);
  };

  // ─── Preset Management ────────────────────────────────
  const handleSaveCustomPreset = () => {
    if (!newPresetName.trim()) {
      showToast('Masukkan nama preset terlebih dahulu', 'warning');
      return;
    }
    const newPreset: CustomUserPreset = {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      filter: editState.filter,
      filterIntensity: editState.filterIntensity ?? 100,
      adjustments: structuredClone(editState.adjustments),
      createdAt: new Date().toISOString(),
    };
    saveCustomPreset(newPreset);
    setCustomPresets(getCustomPresets());
    setPresetModalOpen(false);
    setNewPresetName('');
    showToast(`Preset '${newPreset.name}' berhasil disimpan!`, 'success');
  };

  const handleDeletePreset = (id: string, name: string) => {
    deleteCustomPreset(id);
    setCustomPresets(getCustomPresets());
    showToast(`Preset '${name}' dihapus`, 'info');
  };

  // ─── AI Differential Transfer ─────────────────────────
  const handleApplyAIFilter = async (forcedIntensity?: number, forcedMode?: AIMatchMode) => {
    if (!selectedAIProfile) {
      showToast('Pilih foto referensi terlebih dahulu', 'warning');
      return;
    }

    const currentIntensity = forcedIntensity !== undefined ? forcedIntensity : aiIntensity;
    const currentMode = forcedMode !== undefined ? forcedMode : aiMatchMode;

    setAiProcessStatus('Menganalisis Foto Target...');

    // Save previous state for AI reset if not already saved
    if (!aiPreviousAdjustments) {
      setAiPreviousAdjustments(structuredClone(editState.adjustments));
    }

    // Ensure we have a target profile, or compute one on-the-fly
    let target = targetColorProfile;
    if (!target && sourceImage) {
      try {
        setAiProcessStatus('Menganalisis Foto Target...');
        target = await analyzeImageColors(sourceImage);
        setTargetColorProfile(target);
      } catch {
        // Fallback to neutral
      }
    }

    if (!target) {
      target = {
        exposure: 0,
        contrast: 0,
        brightness: 0,
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
        confidence: 1,
        colorMoodTag: 'cinematic_warm',
        dominantPalette: ['#4a5568', '#4a5568', '#4a5568', '#4a5568', '#4a5568'],
        analysisTimeMs: 0,
        blackPoint: 0,
        whitePoint: 255,
        dynamicRange: 255,
        hasHumanSkin: false,
        skinToneRatio: 0,
        histogram: { shadowsAvg: 50, midtonesAvg: 128, highlightsAvg: 200, quantiles: [12, 64, 128, 192, 240] },
      };
    }

    setAiProcessStatus('Menghitung Pencocokan Adaptif...');

    // Differential matching with strict texture preservation and facial/body protection
    const aiOptions: AITransferOptions = {
      intensity: currentIntensity / 100,
      matchMode: currentMode,
      preserveSkinTones: aiProtectSkin,
      preserveTexture: aiPreserveTexture,
      preserveBodyShape: aiPreserveBodyShape,
      skinSmoothing: aiSkinSmoothing,
      faceRetouching: aiFaceRetouching,
      bodyReshaping: aiBodyReshaping,
      generativeReconstruction: aiGenerativeRecon,
    };
    const diff = computeAITransferParameters(target, selectedAIProfile, aiOptions);

    setAiProcessStatus('Rendering Preview...');

    let nextAdjustments: ImageAdjustments = structuredClone(aiPreviousAdjustments || editState.adjustments);

    if (aiIncludeAdjustments) {
      nextAdjustments = {
        ...nextAdjustments,
        exposure: diff.exposure,
        brightness: diff.brightness,
        contrast: diff.contrast,
        highlights: diff.highlights,
        shadows: diff.shadows,
        whites: diff.whites,
        blacks: diff.blacks,
        temperature: diff.temperature,
        tint: diff.tint,
        saturation: diff.saturation,
        vibrance: diff.vibrance,
        clarity: diff.clarity,
        vignette: diff.vignette,
        grain: diff.grain,
        fade: diff.fade,
        toneCurve: diff.toneCurve,
        hsl: diff.hsl,
      };
    }

    if (aiIncludeGrading) {
      nextAdjustments.gradingShadows = diff.gradingShadows;
      nextAdjustments.gradingMidtones = diff.gradingMidtones;
      nextAdjustments.gradingHighlights = diff.gradingHighlights;
    }

    let nextFilter: FilterId = 'none';
    if (aiIncludeFilter) {
      const mapped = mapMoodToPreset(selectedAIProfile.colorMoodTag);
      if (mapped && mapped !== 'none') {
        nextFilter = mapped;
      }
    }

    const nextState: PhotoEditState = {
      ...editState,
      filter: nextFilter,
      filterIntensity: currentIntensity,
      adjustments: nextAdjustments,
    };

    pushState(nextState);
    setAiProcessStatus('Siap Diekspor ✓');
    showToast(`✨ Gaya AI '${selectedAIProfile.colorMoodTag}' diterapkan (${currentMode.toUpperCase()} | Intensitas ${currentIntensity}%)`, 'success');
  };

  const handleResetAIFilter = () => {
    if (aiPreviousAdjustments) {
      pushState({
        ...editState,
        adjustments: structuredClone(aiPreviousAdjustments),
        filter: 'none',
        filterIntensity: 100,
      });
      setAiPreviousAdjustments(null);
      showToast('Filter AI di-reset ke kondisi sebelum aplikasi', 'info');
    } else {
      pushState({
        ...editState,
        adjustments: structuredClone(DEFAULT_ADJUSTMENTS),
        filter: 'none',
        filterIntensity: 100,
      });
      showToast('Filter AI di-reset', 'info');
    }
  };

  // ─── AI Reconstruction & Enhancement Handlers ─────────
  const handleRunQualityAnalysis = useCallback(() => {
    if (!sourceImage) return;
    setIsAnalyzingQuality(true);
    setTimeout(() => {
      try {
        const rep = analyzeImageElementQuality(sourceImage);
        setQualityReport(rep);
        showToast(`Analisis degradasi selesai (Skor Ketajaman: ${rep.blurScore}/100)`, 'success');
      } catch {
        showToast('Gagal menganalisis kualitas citra', 'error');
      } finally {
        setIsAnalyzingQuality(false);
      }
    }, 120);
  }, [sourceImage]);

  const handleApplyReconstruction = useCallback(() => {
    if (!sourceImage) return;

    if (reconMode === 'enhance_original') {
      const factor = reconIntensity / 100;
      const nextAdj: ImageAdjustments = {
        ...editState.adjustments,
        sharpness: clampAdjustment(Math.round(40 * factor)),
        clarity: clampAdjustment(Math.round(25 * factor)),
        denoise: clampAdjustment(Math.round(20 * factor)),
        dehaze: clampAdjustment(Math.round(15 * factor)),
        shadows: clampAdjustment(editState.adjustments.shadows + Math.round(20 * factor)),
      };
      pushState({ ...editState, adjustments: nextAdj });
      showToast('Enhance Original berhasil diterapkan! (Ketajaman & Denoise dioptimalkan)', 'success');
    } else if (reconMode === 'ai_reconstruction') {
      const factor = reconIntensity / 100;
      const nextAdj: ImageAdjustments = {
        ...editState.adjustments,
        sharpness: clampAdjustment(Math.round(65 * factor)),
        clarity: clampAdjustment(Math.round(40 * factor)),
        texture: clampAdjustment(Math.round(30 * factor)),
        contrast: clampAdjustment(editState.adjustments.contrast + Math.round(15 * factor)),
        highlights: clampAdjustment(editState.adjustments.highlights - Math.round(10 * factor)),
        shadows: clampAdjustment(editState.adjustments.shadows + Math.round(25 * factor)),
      };
      pushState({ ...editState, adjustments: nextAdj });
      showToast('AI Reconstruction diterapkan: Kontur subjek direkonstruksi secara terarah!', 'success');
    } else {
      const factor = reconIntensity / 100;
      const nextAdj: ImageAdjustments = {
        ...editState.adjustments,
        sharpness: clampAdjustment(Math.round(50 * factor)),
        clarity: clampAdjustment(Math.round(35 * factor)),
        vibrance: clampAdjustment(editState.adjustments.vibrance + Math.round(20 * factor)),
        contrast: clampAdjustment(editState.adjustments.contrast + Math.round(20 * factor)),
      };
      pushState({ ...editState, adjustments: nextAdj });
      showToast('Variasi Alternatif berhasil diterapkan pada foto!', 'success');
    }
  }, [sourceImage, reconMode, reconIntensity, editState, pushState]);

  // ─── Transform handlers ───────────────────────────────
  const handleRotate = () => {
    const newRotation = ((editState.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    pushState({ ...editState, rotation: newRotation });
  };

  const handleFlipX = () => {
    pushState({ ...editState, flipX: !editState.flipX });
  };

  const handleFlipY = () => {
    pushState({ ...editState, flipY: !editState.flipY });
  };

  // ─── Crop Handlers (Mouse & Touch Supported) ───────────
  const handleCropMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setCropStart({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
    setCropEnd(null);
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropMode || !cropStart || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setCropEnd({
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    });
  };

  const handleCropTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!cropMode || !canvasRef.current || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    setCropStart({
      x: Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height)),
    });
    setCropEnd(null);
  };

  const handleCropTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!cropMode || !cropStart || !canvasRef.current || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    setCropEnd({
      x: Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height)),
    });
  };

  const handleCropTouchEnd = () => {
    if (cropMode && cropStart && cropEnd) {
      applyCrop();
    }
  };

  const applyCrop = () => {
    if (!cropStart || !cropEnd) return;
    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const width = Math.abs(cropEnd.x - cropStart.x);
    const height = Math.abs(cropEnd.y - cropStart.y);

    if (width < 0.02 || height < 0.02) {
      showToast('Area crop terlalu kecil', 'warning');
      return;
    }

    // If already cropped, calculate relative to existing crop
    let finalCrop;
    if (editState.crop) {
      finalCrop = {
        x: editState.crop.x + x * editState.crop.width,
        y: editState.crop.y + y * editState.crop.height,
        width: width * editState.crop.width,
        height: height * editState.crop.height,
      };
    } else {
      finalCrop = { x, y, width, height };
    }

    pushState({ ...editState, crop: finalCrop });
    setCropMode(false);
    setCropStart(null);
    setCropEnd(null);
    showToast('Crop diterapkan', 'success');
  };

  const resetCrop = () => {
    pushState({ ...editState, crop: null });
    setCropMode(false);
    setCropStart(null);
    setCropEnd(null);
  };

  // ─── Text layers ──────────────────────────────────────
  const addTextLayer = () => {
    const newLayer: TextLayer = {
      id: generateId(),
      text: 'Teks baru',
      x: 0.5,
      y: 0.5,
      fontSize: 32,
      fontFamily: 'Inter',
      color: '#ffffff',
      rotation: 0,
      bold: false,
      italic: false,
    };
    pushState({
      ...editState,
      textLayers: [...editState.textLayers, newLayer],
    });
  };

  const updateTextLayer = (id: string, updates: Partial<TextLayer>) => {
    pushState({
      ...editState,
      textLayers: editState.textLayers.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    });
  };

  const removeTextLayer = (id: string) => {
    pushState({
      ...editState,
      textLayers: editState.textLayers.filter((l) => l.id !== id),
    });
  };

  // ─── Export Dimensions & Ratio Math ────────────────────
  const getExportDimensions = useCallback(() => {
    if (!sourceImage) return { width: 0, height: 0, baseW: 0, baseH: 0 };
    let sw = sourceImage.naturalWidth;
    let sh = sourceImage.naturalHeight;
    if (editState.crop) {
      sw = Math.max(1, Math.round(editState.crop.width * sourceImage.naturalWidth));
      sh = Math.max(1, Math.round(editState.crop.height * sourceImage.naturalHeight));
    }
    const isRotated = editState.rotation === 90 || editState.rotation === 270;
    const baseW = isRotated ? sh : sw;
    const baseH = isRotated ? sw : sh;
    const aspect = baseW / baseH;

    if (exportResolution === 'original' || exportResolution === 'custom') {
      return { width: baseW, height: baseH, baseW, baseH };
    }
    const preset = RESOLUTION_MAP[exportResolution];
    if (!preset) return { width: baseW, height: baseH, baseW, baseH };

    if (aspect >= 1) {
      return { width: preset.width, height: Math.max(1, Math.round(preset.width / aspect)), baseW, baseH };
    } else {
      return { width: Math.max(1, Math.round(preset.height * aspect)), height: preset.height, baseW, baseH };
    }
  }, [sourceImage, editState.crop, editState.rotation, exportResolution]);

  // ─── Export ────────────────────────────────────────────
  const handleExport = async () => {
    if (!sourceImage) return;
    setExporting(true);
    try {
      const { width: outW, height: outH } = getExportDimensions();
      const isOriginal = exportResolution === 'original' || exportResolution === 'custom';
      const targetW = isOriginal ? undefined : outW;
      const targetH = isOriginal ? undefined : outH;

      const fullCanvas = renderPhotoToCanvas(sourceImage, editState, targetW, targetH);
      const blob = await exportPhotoToBlob(fullCanvas, exportFormat, exportQuality / 100);
      let ext = 'jpg';
      if (exportFormat === 'png') ext = 'png';
      else if (exportFormat === 'webp') ext = 'webp';
      const baseName = fileName.replace(/\.[^.]+$/, '');
      const saved = await downloadBlob(blob, `${baseName}_edited.${ext}`);
      if (saved) {
        showToast(
          `Diekspor: ${(blob.size / 1024).toFixed(0)} KB (${fullCanvas.width}×${fullCanvas.height} ${exportFormat.toUpperCase()})`,
          'success'
        );
      }
    } catch {
      showToast('Gagal mengekspor foto', 'error');
    } finally {
      setExporting(false);
    }
  };

  // ─── Project Management ────────────────────────────────
  const handleSaveProject = async () => {
    if (!sourceImage) return;
    const id = projectId || generateId();
    if (!projectId) setProjectId(id);
    const pName = projectName || fileName.replace(/\.[^.]+$/, '') || 'Proyek Foto';
    const thumb = canvasRef.current ? generateThumbnail(canvasRef.current, 240, 160) : undefined;

    const project: Project = {
      schemaVersion: 1,
      projectId: id,
      name: pName,
      mediaType: 'photo',
      thumbnail: thumb,
      source: {
        localReference: fileName,
        assetId: currentAssetIdRef.current || undefined,
        fileName,
        mimeType:
          exportFormat === 'png'
            ? 'image/png'
            : exportFormat === 'webp'
            ? 'image/webp'
            : 'image/jpeg',
        fileSize: 0,
        width: sourceImage.naturalWidth,
        height: sourceImage.naturalHeight,
      },
      editState,
      exportSettings: {
        resolution: exportResolution,
        maintainAspectRatio: true,
        photoFormat: exportFormat,
        photoQuality: exportQuality / 100,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await saveProject(project);
      saveLastActiveSession(id);
      setSaveStatus('saved');
      showToast(`Proyek '${pName}' tersimpan di IndexedDB`, 'success');
    } catch {
      setSaveStatus('error');
      showToast('Gagal menyimpan proyek ke IndexedDB', 'error');
    }
  };

  const handleExportProjectPackage = () => {
    if (!sourceImage) return;
    const id = projectId || generateId();
    const pName = projectName || fileName.replace(/\.[^.]+$/, '') || 'Proyek Foto';
    const thumb = canvasRef.current ? generateThumbnail(canvasRef.current, 240, 160) : undefined;

    const project: Project = {
      schemaVersion: 1,
      projectId: id,
      name: pName,
      mediaType: 'photo',
      thumbnail: thumb,
      source: {
        localReference: fileName,
        assetId: currentAssetIdRef.current || undefined,
        fileName,
        mimeType:
          exportFormat === 'png'
            ? 'image/png'
            : exportFormat === 'webp'
            ? 'image/webp'
            : 'image/jpeg',
        fileSize: 0,
        width: sourceImage.naturalWidth,
        height: sourceImage.naturalHeight,
      },
      editState,
      exportSettings: {
        resolution: exportResolution,
        maintainAspectRatio: true,
        photoFormat: exportFormat,
        photoQuality: exportQuality / 100,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    exportProjectToFile(project);
    showToast('Berkas proyek (.json) berhasil diunduh', 'success');
  };

  // ─── Debounced Autosave to IndexedDB ───────────────────
  useEffect(() => {
    if (!sourceImage) return;
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    setSaveStatus('dirty');

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        const id = projectId || generateId();
        if (!projectId) setProjectId(id);
        const pName = projectName || fileName.replace(/\.[^.]+$/, '') || 'Proyek Foto';
        const thumb = canvasRef.current ? generateThumbnail(canvasRef.current, 240, 160) : undefined;

        const projToSave: Project = {
          schemaVersion: 1,
          projectId: id,
          name: pName,
          mediaType: 'photo',
          thumbnail: thumb,
          source: {
            localReference: fileName,
            assetId: currentAssetIdRef.current || undefined,
            fileName,
            mimeType:
              exportFormat === 'png'
                ? 'image/png'
                : exportFormat === 'webp'
                ? 'image/webp'
                : 'image/jpeg',
            fileSize: 0,
            width: sourceImage.naturalWidth,
            height: sourceImage.naturalHeight,
          },
          editState,
          exportSettings: {
            resolution: exportResolution,
            maintainAspectRatio: true,
            photoFormat: exportFormat,
            photoQuality: exportQuality / 100,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await saveProject(projToSave);
        saveLastActiveSession(id);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [editState, sourceImage, projectId, projectName, fileName, exportFormat, exportResolution, exportQuality]);

  // ─── Project & Session Recovery ────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pId = params.get('project');
    if (pId) {
      getProject(pId).then(async (proj) => {
        if (proj && proj.mediaType === 'photo') {
          setProjectId(proj.projectId);
          setProjectName(proj.name);
          setFileName(proj.source.fileName);
          const pEdit = proj.editState as PhotoEditState;
          setEditState(pEdit);
          loadedProjectEditStateRef.current = pEdit;
          historyRef.current.reset(pEdit);
          saveLastActiveSession(proj.projectId);

          // Restore binary media asset from persistent store if available
          if (proj.source.assetId) {
            currentAssetIdRef.current = proj.source.assetId;
            try {
              const assetBlob = await getMediaAsset(proj.source.assetId);
              if (assetBlob) {
                const file = new File([assetBlob], proj.source.fileName, { type: proj.source.mimeType });
                const img = await loadImage(file);
                setSourceImage(img);
                setMissingAsset(null);
                isRestoringProjectRef.current = false;
                showToast(`Proyek '${proj.name}' berhasil dipulihkan secara otomatis!`, 'success');
                return;
              }
            } catch (err) {
              console.warn('Gagal memulihkan aset biner:', err);
            }
          }

          // If asset is missing in local DB (e.g. imported from JSON file)
          isRestoringProjectRef.current = true;
          setMissingAsset(proj.source.fileName);
          showToast(`Proyek '${proj.name}' dimuat. Hubungkan kembali file sumber foto.`, 'warning');
        }
      });
    } else {
      // Check if there is an unsaved / previous active session that can be resumed
      const lastSessionId = getLastActiveSession();
      if (lastSessionId) {
        getProject(lastSessionId).then((proj) => {
          if (proj && proj.mediaType === 'photo') {
            setResumableSession({ id: proj.projectId, name: proj.name });
          }
        });
      }
    }
  }, []);

  // ─── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  // ─── Unsaved Edits Protection & Back Navigation ──────
  const handleGoHome = useCallback(() => {
    if (sourceImage && canUndo) {
      const confirmLeave = window.confirm(
        'Anda memiliki perubahan foto yang belum disimpan. Yakin ingin kembali ke Beranda?'
      );
      if (!confirmLeave) return;
    }
    navigate('/');
  }, [sourceImage, canUndo, navigate]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sourceImage && canUndo) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sourceImage, canUndo]);

  useEffect(() => {
    if (!sourceImage || !canUndo) return;
    const onPopState = () => {
      const confirmLeave = window.confirm(
        'Anda memiliki perubahan foto yang belum disimpan. Yakin ingin kembali ke Beranda?'
      );
      if (!confirmLeave) {
        window.history.pushState(null, '', window.location.href);
      } else {
        navigate('/');
      }
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [sourceImage, canUndo, navigate]);

  // ─── AI Background Removal Handlers (P2 Backend Online) ───
  const checkBackendHealthStatus = useCallback(async () => {
    try {
      const provider = AIProviderRegistry.getProvider('remote') as RemoteGenerativeProvider;
      const health = await provider.checkHealth();
      setBackendHealth(health);
      return health;
    } catch {
      const fallback = { available: false, providerConfigured: false, message: 'Server backend offline.' };
      setBackendHealth(fallback);
      return fallback;
    }
  }, []);

  const handleApplyNewImageVersion = useCallback(
    async (newImageDataUrl: string, description: string = 'Versi Baru AI') => {
      try {
        showToast('Memuat hasil generatif sebagai versi citra baru...', 'info');
        const res = await fetch(newImageDataUrl);
        const blob = await res.blob();
        const baseName = fileName ? fileName.replace(/\.[^.]+$/, '') : 'photo';
        const newFile = new File([blob], `${baseName}_nobg.png`, { type: 'image/png' });

        const newImg = await loadImage(newFile);
        const newAssetId = generateId();
        currentAssetIdRef.current = newAssetId;

        try {
          await saveMediaAsset(newAssetId, newFile);
        } catch (assetErr) {
          console.warn('Gagal menyimpan aset biner versi baru:', assetErr);
        }

        setSourceImage(newImg);
        setFileName(newFile.name);
        setBgRemovalResultUrl(null);
        handleReset();

        showToast(`✓ ${description} berhasil dimuat! Foto sumber asli tetap tersimpan aman.`, 'success');
      } catch (err: unknown) {
        showToast(`Gagal menerapkan versi baru: ${(err as Error).message}`, 'error');
      }
    },
    [fileName, handleReset]
  );

  const handleStartBackgroundRemoval = useCallback(async () => {
    if (!sourceImage || !canvasRef.current) {
      showToast('Muat foto terlebih dahulu sebelum menghapus latar belakang.', 'error');
      return;
    }

    if (!bgRemovalConsent) {
      showToast('Harap setujui persetujuan pemrosesan online terlebih dahulu.', 'error');
      return;
    }

    setBgRemovalError(null);
    setBgRemovalErrorCode(null);
    setBgRemovalResultUrl(null);
    setIsProcessingBgRemoval(true);
    setBgRemovalProgress('Menghubungi server backend AI...');
    setBgRemovalPercent(10);

    const controller = new AbortController();
    bgRemovalAbortRef.current = controller;

    try {
      const remoteProvider = AIProviderRegistry.getProvider('remote');
      const op: StructuredOperation = {
        id: generateId(),
        userPrompt: 'hapus background',
        target: 'generative',
        action: 'remove_background',
        parameters: { prompt: 'hapus background' },
        confidence: 1.0,
        provider: 'remote',
        status: 'pending',
        explanation: 'Penghapusan latar belakang otomatis menggunakan AI generatif online.',
        createdAt: new Date().toISOString(),
      };

      const ctx: EditSessionContext = {
        currentState: editState,
        previousOperations: [],
        sourceFileName: fileName,
        imageDimensions: { width: sourceImage.naturalWidth, height: sourceImage.naturalHeight },
        sourceCanvas: canvasRef.current,
        abortSignal: controller.signal,
        onProgress: (p) => {
          setBgRemovalProgress(p.stage);
          setBgRemovalPercent(p.percent);
        },
      };

      setBgRemovalProgress('Mengirim citra & memproses model AI...');
      const result = await remoteProvider.executeOperation(op, ctx);

      if (result.errorCode || !result.resultImage) {
        setBgRemovalErrorCode(result.errorCode || 'UNKNOWN_ERROR');
        setBgRemovalError(result.summary.join(' '));
        showToast(result.summary[0] || 'Gagal memproses latar belakang.', 'error');
      } else {
        setBgRemovalResultUrl(result.resultImage);
        showToast('Latar belakang berhasil dihapus! Periksa hasil pratinjau di bawah.', 'success');
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name === 'AbortError') {
        showToast('Proses penghapusan latar belakang dibatalkan.', 'info');
      } else {
        setBgRemovalError(e.message);
        showToast(`Error: ${e.message}`, 'error');
      }
    } finally {
      setIsProcessingBgRemoval(false);
      setBgRemovalProgress('');
      setBgRemovalPercent(0);
      bgRemovalAbortRef.current = null;
    }
  }, [sourceImage, bgRemovalConsent, editState, fileName]);

  const handleCancelBgRemovalRequest = useCallback(() => {
    if (bgRemovalAbortRef.current) {
      bgRemovalAbortRef.current.abort();
      bgRemovalAbortRef.current = null;
      setIsProcessingBgRemoval(false);
      setBgRemovalProgress('');
      setBgRemovalPercent(0);
      showToast('Permintaan pemrosesan AI dibatalkan.', 'info');
    }
  }, []);

  // ─── Render ────────────────────────────────────────────
  return (
    <div className="photo-editor">
      {/* Header */}
      <header className="pe-header">
        <button
          className="btn btn-ghost btn-sm pe-btn-back"
          onClick={handleGoHome}
          id="btn-back-home"
          title="Kembali ke Beranda"
        >
          <span className="pe-btn-back-arrow">←</span>
          <span className="pe-btn-back-text">Beranda</span>
        </button>
        <h1 className="pe-header-title">Photo Editor</h1>
        {sourceImage && (
          <div
            className={`pe-save-status pe-save-status--${saveStatus}`}
            title={
              saveStatus === 'saving'
                ? 'Sedang menyimpan proyek ke IndexedDB...'
                : saveStatus === 'saved'
                ? 'Semua perubahan tersimpan otomatis di perangkat'
                : saveStatus === 'dirty'
                ? 'Ada perubahan belum tersimpan (menunggu autosave)'
                : saveStatus === 'error'
                ? 'Gagal menyimpan ke IndexedDB'
                : 'Siap'
            }
            id="badge-save-status"
          >
            {saveStatus === 'saving' && '⏳ Menyimpan...'}
            {saveStatus === 'saved' && '✓ Tersimpan'}
            {saveStatus === 'dirty' && '● Belum disimpan'}
            {saveStatus === 'error' && '⚠️ Gagal simpan'}
          </div>
        )}
        <div className="pe-header-actions">
          <button
            className="btn btn-ghost btn-sm pe-action-btn"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            id="btn-undo"
          >
            <span className="pe-btn-icon">↶</span>
            <span className="pe-btn-label">Undo</span>
          </button>
          <button
            className="btn btn-ghost btn-sm pe-action-btn"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            id="btn-redo"
          >
            <span className="pe-btn-icon">↷</span>
            <span className="pe-btn-label">Redo</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm pe-action-btn ${isAIChatOpen ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setIsAIChatOpen((v) => !v)}
            disabled={!sourceImage}
            title="Buka/Tutup Asisten Percakapan AI (Conversational Photo Editor)"
            id="btn-toggle-ai-chat"
            style={
              isAIChatOpen
                ? { background: 'linear-gradient(135deg, #7c5cfc, #00d4aa)', border: 'none', color: '#fff' }
                : { color: 'var(--color-accent)' }
            }
          >
            <span className="pe-btn-icon">💬</span>
            <span className="pe-btn-label">AI Chat</span>
          </button>
          <button
            className="btn btn-ghost btn-sm pe-action-btn"
            onClick={handleReset}
            disabled={!sourceImage}
            title="Reset semua editan"
            id="btn-reset"
          >
            <span className="pe-btn-icon">⟲</span>
            <span className="pe-btn-label">Reset</span>
          </button>
          <button
            className="btn btn-secondary btn-sm pe-action-btn"
            onClick={handleSaveProject}
            disabled={!sourceImage}
            title="Simpan draf proyek ke penyimpanan lokal browser (IndexedDB)"
            id="btn-save-project-photo"
          >
            <span className="pe-btn-icon">📌</span>
            <span className="pe-btn-label">Simpan</span>
          </button>
          <button
            className="btn btn-primary btn-sm pe-action-btn pe-action-btn--download"
            onClick={handleExport}
            disabled={!sourceImage || exporting}
            title="Unduh foto hasil editing langsung ke galeri / penyimpanan"
            id="btn-quick-download"
            style={{ fontWeight: 'bold', background: 'linear-gradient(135deg, #7c5cfc 0%, #00d4aa 100%)', border: 'none' }}
          >
            <span className="pe-btn-icon">{exporting ? '⏳' : '📥'}</span>
            <span className="pe-btn-label">{exporting ? 'Ekspor...' : 'Unduh'}</span>
          </button>
          <button
            className="btn btn-secondary btn-sm pe-action-btn"
            onClick={handleExportProjectPackage}
            disabled={!sourceImage}
            title="Unduh paket proyek (.json)"
            id="btn-package-project-photo"
          >
            <span className="pe-btn-icon">📦</span>
            <span className="pe-btn-label">.json</span>
          </button>
        </div>
      </header>

      {/* Resumable Session Recovery Banner */}
      {!sourceImage && resumableSession && (
        <div className="pe-recovery-banner" id="banner-resumable-session">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🔄 Ditemukan sesi editing foto sebelumnya:</span>
            <strong>{resumableSession.name}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                navigate(`/photo?project=${resumableSession.id}`);
                setResumableSession(null);
              }}
              id="btn-resume-session"
            >
              Lanjutkan Proyek
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                clearLastActiveSession();
                setResumableSession(null);
              }}
              id="btn-dismiss-resume"
            >
              Abaikan
            </button>
          </div>
        </div>
      )}

      <div className="pe-body">
        {/* Preview area */}
        <div className={`pe-preview ${zoom100 ? 'pe-preview--zoom100' : ''}`} ref={previewContainerRef}>
          {sourceImage ? (
            <>
              {/* Floating Inspection Toolbar */}
              <div className="pe-inspect-toolbar">
                <button
                  type="button"
                  className={`pe-inspect-btn ${zoom100 ? 'pe-inspect-btn--active' : ''}`}
                  onClick={() => setZoom100((prev) => !prev)}
                  title="Zoom 100% ukuran asli piksel (1:1) untuk inspeksi tekstur kulit, pori-pori & rambut"
                  id="btn-inspect-zoom100"
                >
                  <span>{zoom100 ? '🔍 Zoom: 100% (1:1)' : '🔍 Fit Layar'}</span>
                </button>

                <button
                  type="button"
                  className={`pe-inspect-btn ${splitCompare ? 'pe-inspect-btn--active' : ''}`}
                  onClick={() => setSplitCompare((prev) => !prev)}
                  title="Bandingkan langsung foto asli vs hasil edit dengan garis pembelah"
                  id="btn-inspect-split"
                >
                  <span>🌓 Split Compare</span>
                </button>

                {splitCompare && (
                  <div className="pe-split-slider-container">
                    <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>Garis:</span>
                    <input
                      type="range"
                      className="pe-split-slider"
                      min="5"
                      max="95"
                      value={splitSliderPos}
                      onChange={(e) => setSplitSliderPos(parseInt(e.target.value))}
                      id="slider-split-pos"
                    />
                    <span style={{ fontSize: '10px', fontWeight: 600 }}>{splitSliderPos}%</span>
                  </div>
                )}

                <button
                  type="button"
                  className="pe-inspect-btn"
                  onMouseDown={() => setIsComparingAI(true)}
                  onMouseUp={() => setIsComparingAI(false)}
                  onTouchStart={() => setIsComparingAI(true)}
                  onTouchEnd={() => setIsComparingAI(false)}
                  title="Tahan untuk melihat foto asli sebelum diedit"
                  id="btn-inspect-hold"
                >
                  <span>👁️ Tahan Asli</span>
                </button>
              </div>

              <canvas
                ref={canvasRef}
                className={`pe-canvas ${cropMode ? 'pe-canvas--cropping' : ''}`}
                onMouseDown={handleCropMouseDown}
                onMouseMove={handleCropMouseMove}
                onMouseUp={() => {
                  if (cropMode && cropStart && cropEnd) applyCrop();
                }}
                onTouchStart={handleCropTouchStart}
                onTouchMove={handleCropTouchMove}
                onTouchEnd={handleCropTouchEnd}
              />
              {cropMode && cropStart && cropEnd && (
                <div
                  className="pe-crop-overlay"
                  style={{
                    left: `${Math.min(cropStart.x, cropEnd.x) * 100}%`,
                    top: `${Math.min(cropStart.y, cropEnd.y) * 100}%`,
                    width: `${Math.abs(cropEnd.x - cropStart.x) * 100}%`,
                    height: `${Math.abs(cropEnd.y - cropStart.y) * 100}%`,
                  }}
                />
              )}
              {isComparingAI && (
                <div
                  style={{
                    position: 'absolute',
                    top: 24,
                    backgroundColor: 'rgba(231, 76, 60, 0.95)',
                    color: '#ffffff',
                    padding: '6px 16px',
                    borderRadius: '20px',
                    fontWeight: 700,
                    fontSize: '12px',
                    letterSpacing: '0.5px',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                    zIndex: 10,
                    pointerEvents: 'none',
                    animation: 'pulse 1.5s infinite',
                  }}
                >
                  👁️ FOTO ASLI (BEFORE)
                </div>
              )}
              <div className="pe-info-bar">
                <span>{fileName}</span>
                <span>
                  {sourceImage.naturalWidth}×{sourceImage.naturalHeight}
                </span>
                <span>Rotasi: {editState.rotation}°</span>
                {editState.crop && <span>Cropped</span>}
              </div>
            </>
          ) : missingAsset ? (
            <div className="pe-missing-asset-card" id="card-missing-asset">
              <div style={{ fontSize: '36px' }}>⚠️</div>
              <h3 style={{ color: 'var(--color-warning)', margin: '4px 0' }}>File Sumber Foto Perlu Dihubungkan</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', maxWidth: '380px', margin: '4px 0 12px 0', lineHeight: 1.5 }}>
                Proyek ini menggunakan file foto <strong>&quot;{missingAsset}&quot;</strong>.
                Penyimpanan lokal browser memerlukan konfirmasi file foto sumber untuk merender preview dan ekspor.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-md"
                  onClick={() => fileInputRef.current?.click()}
                  id="btn-relink-asset"
                >
                  📁 Hubungkan File Sumber
                </button>
                <button
                  className="btn btn-ghost btn-md"
                  onClick={() => {
                    setMissingAsset(null);
                    handleReset();
                  }}
                  id="btn-cancel-missing-asset"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <div className="pe-empty">
              <div className="pe-empty-icon">
                <svg viewBox="0 0 64 64" fill="none" width="64" height="64">
                  <rect x="8" y="14" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2" />
                  <circle cx="22" cy="28" r="5" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 42l14-10 8 6 12-14 14 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <h2>Pilih foto untuk diedit</h2>
              <p>JPEG, PNG, WebP — maks 50 MB</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => fileInputRef.current?.click()}
                  id="btn-import-photo"
                >
                  📁 Pilih Foto
                </button>
                <button
                  className="btn btn-secondary btn-lg"
                  onClick={handleLoadSamplePhoto}
                  id="btn-sample-photo"
                  style={{ background: 'rgba(124, 92, 252, 0.15)', borderColor: '#7c5cfc', color: '#fff' }}
                >
                  🖼️ Coba Foto Sampel (Demo)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar tools */}
        {sourceImage && (
          <aside className="pe-sidebar">
            {/* Tab buttons */}
            <nav className="pe-tabs">
              {(
                [
                  { id: 'adjust', icon: '☀', label: 'Adjust' },
                  { id: 'crop', icon: '⬒', label: 'Crop' },
                  { id: 'filter', icon: '✦', label: 'Filter' },
                  { id: 'ai', icon: '🤖', label: 'AI Copier' },
                  { id: 'text', icon: 'T', label: 'Teks' },
                  { id: 'export', icon: '↓', label: 'Ekspor' },
                ] as { id: ToolTab; icon: string; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  className={`pe-tab ${activeTab === tab.id ? 'pe-tab--active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                  id={`tab-${tab.id}`}
                >
                  <span className="pe-tab-icon">{tab.icon}</span>
                  <span className="pe-tab-label">{tab.label}</span>
                </button>
              ))}
            </nav>

            {/* Panel content */}
            <div className="pe-panel">
              {/* ADJUST TAB */}
              {activeTab === 'adjust' && (
                <div className="pe-panel-content">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 className="pe-panel-title" style={{ margin: 0 }}>Adjustments</h3>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleCopyAdjustments}
                        title="Salin semua penyesuaian saat ini ke clipboard internal"
                        id="btn-copy-adjustments"
                        style={{ fontSize: '11px', padding: '2px 8px' }}
                      >
                        📋 Salin
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handlePasteAdjustments}
                        title="Terapkan penyesuaian yang disalin ke foto ini"
                        id="btn-paste-adjustments"
                        style={{ fontSize: '11px', padding: '2px 8px' }}
                      >
                        📋 Tempel
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleResetAdjustments}
                        title="Kembalikan semua slider penyesuaian ke 0"
                        id="btn-reset-adjustments"
                        style={{ fontSize: '11px', color: '#ff7b72', padding: '2px 8px' }}
                      >
                        ⟲ Reset All
                      </button>
                    </div>
                  </div>

                  {/* Accordion Tabs */}
                  <div className="pe-accordion-nav">
                    {[
                      { id: 'light', label: '💡 Light' },
                      { id: 'color', label: '🎨 Color' },
                      { id: 'curve', label: '📈 Curve' },
                      { id: 'detail', label: '🔍 Detail' },
                      { id: 'effects', label: '✨ Effects' },
                      { id: 'grading', label: '🎭 Grading' },
                    ].map((sec) => (
                      <button
                        key={sec.id}
                        type="button"
                        className={`pe-accordion-btn ${openAdjustSection === sec.id ? 'pe-accordion-btn--active' : ''}`}
                        onClick={() => setOpenAdjustSection(sec.id as AdjustSection)}
                        id={`acc-${sec.id}`}
                      >
                        {sec.label}
                      </button>
                    ))}
                  </div>

                  {/* SECTION: LIGHT */}
                  {openAdjustSection === 'light' && (
                    <div className="pe-accordion-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          💡 Pencahayaan
                        </span>
                        <button
                          type="button"
                          className="pe-slider-reset-btn"
                          onClick={() => handleResetSection('light')}
                          title="Reset semua penyesuaian Light ke 0"
                          style={{ padding: '2px 8px', width: 'auto', borderRadius: '4px', fontSize: '11px' }}
                        >
                          ↺ Reset Light
                        </button>
                      </div>
                      {[
                        { key: 'exposure' as const, label: '☀ Exposure', min: -100, max: 100 },
                        { key: 'brightness' as const, label: '🔆 Brightness', min: -100, max: 100 },
                        { key: 'contrast' as const, label: '◐ Contrast', min: -100, max: 100 },
                        { key: 'highlights' as const, label: '◻ Highlights', min: -100, max: 100 },
                        { key: 'shadows' as const, label: '◼ Shadows', min: -100, max: 100 },
                        { key: 'whites' as const, label: '◽ Whites', min: -100, max: 100 },
                        { key: 'blacks' as const, label: '◾ Blacks', min: -100, max: 100 },
                      ].map(({ key, label, min, max }) => (
                        <div className="pe-slider-group" key={key}>
                          <div className="pe-slider-header">
                            <label className="pe-slider-label">{label}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="pe-slider-value">
                                {editState.adjustments[key] > 0 ? `+${editState.adjustments[key]}` : editState.adjustments[key]}
                              </span>
                              <button
                                type="button"
                                className="pe-slider-reset-btn"
                                onClick={() => resetSingleAdjustment(key)}
                                title={`Reset ${label}`}
                              >
                                ↺
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            className="slider"
                            min={min}
                            max={max}
                            value={editState.adjustments[key]}
                            onChange={(e) => updateAdjustment(key, parseInt(e.target.value))}
                            id={`slider-${key}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* SECTION: COLOR */}
                  {openAdjustSection === 'color' && (
                    <div className="pe-accordion-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          🎨 Suhu &amp; Warna
                        </span>
                        <button
                          type="button"
                          className="pe-slider-reset-btn"
                          onClick={() => handleResetSection('color')}
                          title="Reset semua penyesuaian Color &amp; HSL ke 0"
                          style={{ padding: '2px 8px', width: 'auto', borderRadius: '4px', fontSize: '11px' }}
                        >
                          ↺ Reset Color
                        </button>
                      </div>
                      {[
                        { key: 'temperature' as const, label: '🌡 Temperature', min: -100, max: 100 },
                        { key: 'tint' as const, label: '🌸 Tint', min: -100, max: 100 },
                        { key: 'saturation' as const, label: '🎨 Saturation', min: -100, max: 100 },
                        { key: 'vibrance' as const, label: '💎 Vibrance', min: -100, max: 100 },
                      ].map(({ key, label, min, max }) => (
                        <div className="pe-slider-group" key={key}>
                          <div className="pe-slider-header">
                            <label className="pe-slider-label">{label}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="pe-slider-value">
                                {editState.adjustments[key] > 0 ? `+${editState.adjustments[key]}` : editState.adjustments[key]}
                              </span>
                              <button
                                type="button"
                                className="pe-slider-reset-btn"
                                onClick={() => resetSingleAdjustment(key)}
                                title={`Reset ${label}`}
                              >
                                ↺
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            className="slider"
                            min={min}
                            max={max}
                            value={editState.adjustments[key]}
                            onChange={(e) => updateAdjustment(key, parseInt(e.target.value))}
                            id={`slider-${key}`}
                          />
                        </div>
                      ))}

                      {/* HSL Color Mix Sub-section */}
                      <div className="pe-hsl-box">
                        <span className="pe-hsl-title">HSL Color Mix:</span>
                        <div className="pe-hsl-colors-row">
                          {(['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const).map((c) => (
                            <button
                              key={c}
                              type="button"
                              className={`pe-hsl-color-btn ${activeHSLColor === c ? 'pe-hsl-color-btn--active' : ''}`}
                              onClick={() => setActiveHSLColor(c)}
                              title={`Pilih Warna ${c.toUpperCase()}`}
                              style={{
                                backgroundColor:
                                  c === 'red' ? '#e74c3c' :
                                  c === 'orange' ? '#e67e22' :
                                  c === 'yellow' ? '#f1c40f' :
                                  c === 'green' ? '#2ecc71' :
                                  c === 'aqua' ? '#1abc9c' :
                                  c === 'blue' ? '#3498db' :
                                  c === 'purple' ? '#9b59b6' : '#e84393'
                              }}
                            />
                          ))}
                        </div>

                        {/* Sliders for selected HSL color */}
                        {(['hue', 'saturation', 'luminance'] as const).map((prop) => {
                          const currentVal = (editState.adjustments.hsl || {})[activeHSLColor]?.[prop] ?? 0;
                          return (
                            <div className="pe-slider-group" key={prop} style={{ marginTop: 6 }}>
                              <div className="pe-slider-header">
                                <label className="pe-slider-label" style={{ textTransform: 'capitalize' }}>
                                  {activeHSLColor} {prop}
                                </label>
                                <span className="pe-slider-value">{currentVal > 0 ? `+${currentVal}` : currentVal}</span>
                              </div>
                              <input
                                type="range"
                                className="slider"
                                min="-100"
                                max="100"
                                value={currentVal}
                                onChange={(e) => updateHSLChannel(activeHSLColor, prop, parseInt(e.target.value))}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SECTION: TONE CURVE */}
                  {openAdjustSection === 'curve' && (
                    <div className="pe-accordion-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          📈 S-Curve &amp; RGB Curves
                        </span>
                        <button
                          type="button"
                          className="pe-slider-reset-btn"
                          onClick={resetToneCurve}
                          title="Reset Tone Curve"
                          style={{ padding: '2px 8px', width: 'auto', borderRadius: '4px' }}
                        >
                          ↺ Reset Curve
                        </button>
                      </div>

                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                        RGB Composite Luminance S-Curve:
                      </span>
                      {[
                        { key: 'highlights' as const, label: '🌕 Highlights S-Curve', min: -100, max: 100 },
                        { key: 'midtones' as const, label: '🌓 Midtones S-Curve', min: -100, max: 100 },
                        { key: 'shadows' as const, label: '🌑 Shadows S-Curve', min: -100, max: 100 },
                      ].map(({ key, label, min, max }) => {
                        const val = editState.adjustments.toneCurve?.[key] ?? 0;
                        return (
                          <div className="pe-slider-group" key={key} style={{ marginTop: 4 }}>
                            <div className="pe-slider-header">
                              <label className="pe-slider-label">{label}</label>
                              <span className="pe-slider-value">{val > 0 ? `+${val}` : val}</span>
                            </div>
                            <input
                              type="range"
                              className="slider"
                              min={min}
                              max={max}
                              value={val}
                              onChange={(e) => updateToneCurve(key, parseInt(e.target.value))}
                              id={`slider-curve-${key}`}
                            />
                          </div>
                        );
                      })}

                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                          Individual Color Channel Curves:
                        </span>
                        {[
                          { key: 'red' as const, label: '🔴 Red Channel Balance', color: '#ff6b6b' },
                          { key: 'green' as const, label: '🟢 Green Channel Balance', color: '#51cf66' },
                          { key: 'blue' as const, label: '🔵 Blue Channel Balance', color: '#339af0' },
                        ].map(({ key, label, color }) => {
                          const val = editState.adjustments.toneCurve?.[key] ?? 0;
                          return (
                            <div className="pe-slider-group" key={key} style={{ marginTop: 4 }}>
                              <div className="pe-slider-header">
                                <label className="pe-slider-label" style={{ color }}>{label}</label>
                                <span className="pe-slider-value">{val > 0 ? `+${val}` : val}</span>
                              </div>
                              <input
                                type="range"
                                className="slider"
                                min="-100"
                                max="100"
                                value={val}
                                onChange={(e) => updateToneCurve(key, parseInt(e.target.value))}
                                id={`slider-curve-${key}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SECTION: DETAIL */}
                  {openAdjustSection === 'detail' && (
                    <div className="pe-accordion-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          🗡 Ketajaman &amp; Tekstur
                        </span>
                        <button
                          type="button"
                          className="pe-slider-reset-btn"
                          onClick={() => handleResetSection('detail')}
                          title="Reset semua Detail ke 0"
                          style={{ padding: '2px 8px', width: 'auto', borderRadius: '4px', fontSize: '11px' }}
                        >
                          ↺ Reset Detail
                        </button>
                      </div>
                      {[
                        { key: 'sharpness' as const, label: '🗡 Sharpness', min: 0, max: 100 },
                        { key: 'clarity' as const, label: '💎 Clarity', min: -100, max: 100 },
                        { key: 'texture' as const, label: '🧱 Texture', min: -100, max: 100 },
                        { key: 'denoise' as const, label: '💧 Denoise', min: 0, max: 100 },
                        { key: 'dehaze' as const, label: '🌫 Dehaze', min: -100, max: 100 },
                      ].map(({ key, label, min, max }) => (
                        <div className="pe-slider-group" key={key}>
                          <div className="pe-slider-header">
                            <label className="pe-slider-label">{label}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="pe-slider-value">
                                {editState.adjustments[key] > 0 ? `+${editState.adjustments[key]}` : editState.adjustments[key]}
                              </span>
                              <button
                                type="button"
                                className="pe-slider-reset-btn"
                                onClick={() => resetSingleAdjustment(key)}
                                title={`Reset ${label}`}
                              >
                                ↺
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            className="slider"
                            min={min}
                            max={max}
                            value={editState.adjustments[key]}
                            onChange={(e) => updateAdjustment(key, parseInt(e.target.value))}
                            id={`slider-${key}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* SECTION: EFFECTS */}
                  {openAdjustSection === 'effects' && (
                    <div className="pe-accordion-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          ✨ Efek Khusus
                        </span>
                        <button
                          type="button"
                          className="pe-slider-reset-btn"
                          onClick={() => handleResetSection('effects')}
                          title="Reset semua Effects ke 0"
                          style={{ padding: '2px 8px', width: 'auto', borderRadius: '4px', fontSize: '11px' }}
                        >
                          ↺ Reset Effects
                        </button>
                      </div>
                      {[
                        { key: 'vignette' as const, label: '🔘 Vignette', min: -100, max: 100 },
                        { key: 'grain' as const, label: '🌾 Film Grain', min: 0, max: 100 },
                        { key: 'fade' as const, label: '🌫 Fade (Matte Film)', min: 0, max: 100 },
                      ].map(({ key, label, min, max }) => (
                        <div className="pe-slider-group" key={key}>
                          <div className="pe-slider-header">
                            <label className="pe-slider-label">{label}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="pe-slider-value">
                                {editState.adjustments[key] > 0 ? `+${editState.adjustments[key]}` : editState.adjustments[key]}
                              </span>
                              <button
                                type="button"
                                className="pe-slider-reset-btn"
                                onClick={() => resetSingleAdjustment(key)}
                                title={`Reset ${label}`}
                              >
                                ↺
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            className="slider"
                            min={min}
                            max={max}
                            value={editState.adjustments[key]}
                            onChange={(e) => updateAdjustment(key, parseInt(e.target.value))}
                            id={`slider-${key}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* SECTION: COLOR GRADING 3-WAY */}
                  {openAdjustSection === 'grading' && (
                    <div className="pe-accordion-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          🎭 3-Way Color Wheels
                        </span>
                        <button
                          type="button"
                          className="pe-slider-reset-btn"
                          onClick={() => handleResetSection('grading')}
                          title="Reset semua Color Grading"
                          style={{ padding: '2px 8px', width: 'auto', borderRadius: '4px', fontSize: '11px' }}
                        >
                          ↺ Reset Grading
                        </button>
                      </div>
                      {(['gradingShadows', 'gradingMidtones', 'gradingHighlights'] as const).map((wheel) => {
                        const title = wheel === 'gradingShadows' ? '🌑 Shadows Tint' : wheel === 'gradingMidtones' ? '🌓 Midtones Tint' : '🌕 Highlights Tint';
                        const current = editState.adjustments[wheel] || { hue: 0, saturation: 0, luminance: 0 };
                        const lum = current.luminance ?? 0;
                        return (
                          <div key={wheel} className="pe-grading-wheel-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="pe-grading-wheel-title">{title}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                H:{current.hue}° S:{current.saturation}% L:{lum}
                              </span>
                            </div>
                            <div className="pe-slider-group" style={{ marginTop: 4 }}>
                              <label className="pe-slider-label" style={{ fontSize: '11px' }}>Hue (Warna 0–360°)</label>
                              <input
                                type="range"
                                className="slider"
                                min="0"
                                max="360"
                                value={current.hue}
                                onChange={(e) => updateGradingWheel(wheel, 'hue', parseInt(e.target.value))}
                                style={{
                                  background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
                                }}
                              />
                            </div>
                            <div className="pe-slider-group" style={{ marginTop: 4 }}>
                              <label className="pe-slider-label" style={{ fontSize: '11px' }}>Saturation (Intensitas)</label>
                              <input
                                type="range"
                                className="slider"
                                min="0"
                                max="100"
                                value={current.saturation}
                                onChange={(e) => updateGradingWheel(wheel, 'saturation', parseInt(e.target.value))}
                              />
                            </div>
                            <div className="pe-slider-group" style={{ marginTop: 4 }}>
                              <label className="pe-slider-label" style={{ fontSize: '11px' }}>Luminance (Pencahayaan)</label>
                              <input
                                type="range"
                                className="slider"
                                min="-100"
                                max="100"
                                value={lum}
                                onChange={(e) => updateGradingWheel(wheel, 'luminance', parseInt(e.target.value))}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pe-section-divider" />

                  <h3 className="pe-panel-title">Transform</h3>
                  <div className="pe-transform-btns">
                    <button className="btn btn-secondary btn-sm" onClick={handleRotate} id="btn-rotate">
                      ↻ Rotate 90°
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={handleFlipX} id="btn-flip-h">
                      ↔ Flip H
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={handleFlipY} id="btn-flip-v">
                      ↕ Flip V
                    </button>
                  </div>
                </div>
              )}

              {/* CROP TAB */}
              {activeTab === 'crop' && (
                <div className="pe-panel-content">
                  <h3 className="pe-panel-title">Crop</h3>
                  <p className="pe-hint">
                    {cropMode
                      ? 'Klik dan seret pada foto untuk memilih area crop.'
                      : 'Aktifkan mode crop, lalu klik-seret pada gambar.'}
                  </p>
                  <div className="pe-crop-actions">
                    {!cropMode ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setCropMode(true)}
                        id="btn-start-crop"
                      >
                        ✂ Mulai Crop
                      </button>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setCropMode(false);
                          setCropStart(null);
                          setCropEnd(null);
                        }}
                        id="btn-cancel-crop"
                      >
                        ✕ Batalkan
                      </button>
                    )}
                    {editState.crop && (
                      <button className="btn btn-ghost btn-sm" onClick={resetCrop} id="btn-reset-crop">
                        ⟲ Reset Crop
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* FILTER TAB: 15 Preset Profesional + Custom Presets */}
              {activeTab === 'filter' && (
                <div className="pe-panel-content">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h3 className="pe-panel-title" style={{ margin: 0 }}>Filter &amp; Preset</h3>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPresetModalOpen(true)}
                      style={{ fontSize: '11px' }}
                      id="btn-save-custom-preset"
                    >
                      + Simpan Preset
                    </button>
                  </div>

                  {/* Category Chips */}
                  <div className="pe-filter-categories">
                    {[
                      { id: 'all', label: 'Semua' },
                      { id: 'cinematic', label: 'Cinematic' },
                      { id: 'film', label: 'Film/Vintage' },
                      { id: 'portrait', label: 'Portrait' },
                      { id: 'clean', label: 'Clean' },
                      { id: 'creative', label: 'Creative' },
                      { id: 'custom', label: `Kustom (${customPresets.length})` },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={`pe-category-chip ${filterCategory === cat.id ? 'pe-category-chip--active' : ''}`}
                        onClick={() => setFilterCategory(cat.id)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Filter Intensity Slider */}
                  {editState.filter !== 'none' && (
                    <div className="pe-slider-group" style={{ marginBottom: 14 }}>
                      <div className="pe-slider-header">
                        <label className="pe-slider-label">Intensitas Filter ({editState.filter})</label>
                        <span className="pe-slider-value">{editState.filterIntensity ?? 100}%</span>
                      </div>
                      <input
                        type="range"
                        className="slider"
                        min="0"
                        max="100"
                        value={editState.filterIntensity ?? 100}
                        onChange={(e) => setFilterIntensity(parseInt(e.target.value))}
                        id="slider-filter-intensity"
                      />
                    </div>
                  )}

                  {/* Reset Filter Button */}
                  {editState.filter !== 'none' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setFilter('none');
                        setFilterIntensity(100);
                      }}
                      style={{ marginBottom: 12, width: '100%' }}
                      id="btn-reset-filter-only"
                    >
                      ✕ Hapus Efek Filter (Kembali ke Normal)
                    </button>
                  )}

                  {/* Custom Presets Section */}
                  {filterCategory === 'custom' && (
                    <div className="pe-presets-grid-15">
                      {customPresets.map((cp) => (
                        <div
                          key={cp.id}
                          className="pe-preset-card-pro"
                          onClick={() => applyPresetConfig(cp.adjustments, cp.filter, cp.filterIntensity)}
                        >
                          <div className="pe-preset-swatch" style={{ background: 'linear-gradient(135deg, #7c5cfc, #00d4aa)' }} />
                          <div className="pe-preset-info">
                            <span className="pe-preset-name">{cp.name}</span>
                            <span className="pe-preset-desc">Dibuat: {new Date(cp.createdAt).toLocaleDateString()}</span>
                          </div>
                          <button
                            type="button"
                            className="pe-preset-del-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePreset(cp.id, cp.name);
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      ))}
                      {customPresets.length === 0 && (
                        <p className="pe-hint" style={{ gridColumn: '1 / -1' }}>
                          Belum ada preset kustom tersimpan. Klik '+ Simpan Preset' untuk menyimpan setelan saat ini!
                        </p>
                      )}
                    </div>
                  )}

                  {/* Professional 15 Presets */}
                  {filterCategory !== 'custom' && (
                    <div className="pe-presets-grid-15">
                      {PROFESSIONAL_PRESETS
                        .filter((p) => filterCategory === 'all' || p.category === filterCategory)
                        .map((preset) => (
                          <div
                            key={preset.id}
                            className={`pe-preset-card-pro ${editState.filter === preset.id ? 'pe-preset-card-pro--active' : ''}`}
                            onClick={() => applyPresetConfig(preset.adjustments, preset.id, preset.defaultIntensity)}
                            id={`preset-card-${preset.id}`}
                          >
                            <div className="pe-preset-swatch" style={{ background: preset.sampleGradient }} />
                            <div className="pe-preset-info">
                              <span className="pe-preset-name">{preset.name}</span>
                              <span className="pe-preset-desc">{preset.description}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Save Preset Dialog */}
                  {presetModalOpen && (
                    <div className="pe-modal-backdrop">
                      <div className="pe-modal-card">
                        <h4>Simpan Preset Kustom</h4>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 8 }}>
                          Semua pengaturan pencahayaan, warna, efek, dan filter saat ini akan disimpan.
                        </p>
                        <input
                          type="text"
                          className="pe-text-input"
                          placeholder="Nama Preset (contoh: Senja Hangat)"
                          value={newPresetName}
                          onChange={(e) => setNewPresetName(e.target.value)}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setPresetModalOpen(false)}
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={handleSaveCustomPreset}
                          >
                            Simpan
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AI FILTER COPIER & RECONSTRUCTION TAB */}
              {activeTab === 'ai' && (
                <div className="pe-panel-content pe-ai-container">
                  {/* AI Subtab Switcher */}
                  <div className="pe-recon-subtabs">
                    <button
                      type="button"
                      className={`btn btn-sm ${aiSubTab === 'filter_copier' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setAiSubTab('filter_copier')}
                      id="btn-subtab-filter-copier"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <span>🤖 AI Filter Copier</span>
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${aiSubTab === 'reconstruction' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => {
                        setAiSubTab('reconstruction');
                        if (!qualityReport && sourceImage) {
                          handleRunQualityAnalysis();
                        }
                      }}
                      id="btn-subtab-reconstruction"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <span>🔍 Restorasi &amp; Rekonstruksi</span>
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${aiSubTab === 'background_removal' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => {
                        setAiSubTab('background_removal');
                        checkBackendHealthStatus();
                      }}
                      id="btn-subtab-background-removal"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <span>✂️ Hapus Background</span>
                    </button>
                  </div>

                  {aiSubTab === 'filter_copier' && (
                    <>
                      <div className="pe-ai-badge-banner">
                        <div className="pe-ai-badge-title">
                      <span>🤖 AI Filter Copier Pro</span>
                    </div>
                    <span className="pe-ai-tag">Non-Destruktif</span>
                  </div>

                  <p className="pe-ai-desc">
                    Tiru mood warna, pencahayaan, tone curve, dan karakter visual dari foto referensi mana pun secara otomatis menggunakan analisis histogram diferensial tanpa merusak foto asli.
                  </p>

                  {/* KONTROL 1, 2, 3, 4: DUAL PREVIEW (TARGET VS REFERENSI) */}
                  <div className="pe-ai-dual-preview-grid">
                    {/* Foto Target Box */}
                    <div className="pe-ai-thumb-card">
                      <span className="pe-ai-thumb-header">1. Foto Target (Asli)</span>
                      <div className="pe-ai-thumb-wrapper">
                        {sourceImage ? (
                          <img
                            src={sourceImage.src}
                            alt="Foto Target"
                            className="pe-ai-mini-thumb"
                          />
                        ) : (
                          <div className="pe-ai-empty-thumb">Kosong</div>
                        )}
                      </div>
                      <span className="pe-ai-thumb-name" title={fileName}>{fileName || 'Foto Belum Dimuat'}</span>
                      <span className="pe-ai-thumb-status">
                        {targetColorProfile ? `Mood: ${targetColorProfile.colorMoodTag}` : 'Menganalisis...'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ fontSize: '10px', marginTop: 4 }}
                      >
                        📁 Ganti Target
                      </button>
                    </div>

                    {/* Foto Referensi Box */}
                    <div className="pe-ai-thumb-card">
                      <span className="pe-ai-thumb-header">2. Foto Referensi (Gaya)</span>
                      <div className="pe-ai-thumb-wrapper">
                        {aiReferenceThumb ? (
                          <img src={aiReferenceThumb} alt="Foto Referensi" className="pe-ai-mini-thumb" />
                        ) : (
                          <div
                            className="pe-ai-empty-thumb"
                            style={{ background: aiReferenceGradient || '#7c5cfc' }}
                          />
                        )}
                      </div>
                      <span className="pe-ai-thumb-name" title={aiReferenceName}>{aiReferenceName}</span>
                      <span className="pe-ai-thumb-status">
                        {selectedAIProfile ? `Gaya: ${selectedAIProfile.colorMoodTag}` : 'Belum Ada'}
                      </span>
                      {/* KONTROL 11: Ganti Referensi */}
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => aiReferenceInputRef.current?.click()}
                        style={{ fontSize: '10px', marginTop: 4 }}
                        id="btn-change-ai-ref"
                      >
                        📷 Ganti Referensi
                      </button>
                    </div>
                  </div>

                  {/* KONTROL 6: Tombol Analisis Referensi Ulang */}
                  <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1, fontSize: '11px' }}
                      onClick={() => {
                        if (aiReferenceThumb) {
                          const img = new Image();
                          img.crossOrigin = 'anonymous';
                          img.onload = async () => {
                            setIsAnalyzingAI(true);
                            try {
                              const prof = await analyzeImageColors(img);
                              setSelectedAIProfile(prof);
                              showToast(`Analisis ulang berhasil (${prof.colorMoodTag})`, 'success');
                            } finally {
                              setIsAnalyzingAI(false);
                            }
                          };
                          img.src = aiReferenceThumb;
                        } else {
                          showToast('Pilih atau unggah foto referensi kustom untuk menganalisis', 'info');
                        }
                      }}
                      id="btn-reanalyze-ref"
                    >
                      {isAnalyzingAI ? '⏳ Menganalisis...' : '🔍 Analisis Ulang Referensi'}
                    </button>
                  </div>

                  {/* KONTROL 14: INDIKATOR PROSES & METRIK DIFERENSIAL */}
                  {selectedAIProfile && (
                    <div className="pe-ai-card">
                      {/* STATUS INDIKATOR PROSES NYATA (Section 12) */}
                      <div className="pe-ai-status-banner" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'rgba(124, 92, 252, 0.12)',
                        border: '1px solid rgba(124, 92, 252, 0.3)',
                        borderRadius: '8px',
                        marginBottom: '10px',
                        fontSize: '12px',
                      }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Status Engine:</span>
                        <span style={{ fontWeight: 600, color: '#00d4aa' }}>{aiProcessStatus}</span>
                      </div>

                      {/* Extracted 5-Color Dominant Palette */}
                      <div className="pe-ai-palette-section">
                        <span className="pe-ai-palette-label">Palet Dominan Referensi:</span>
                        <div className="pe-ai-palette-row">
                          {selectedAIProfile.dominantPalette.map((hex, idx) => (
                            <div
                              key={idx}
                              className="pe-ai-swatch"
                              style={{ backgroundColor: hex }}
                              title={`Warna #${idx + 1}: ${hex}`}
                              onClick={() => {
                                navigator.clipboard.writeText(hex);
                                showToast(`Kode warna ${hex} disalin ke clipboard`, 'info');
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Color & Light Metric Bars */}
                      <div className="pe-ai-metrics">
                        <div className="pe-ai-metric-item">
                          <span className="pe-ai-metric-name">Kecerahan:</span>
                          <span className="pe-ai-metric-val">
                            {selectedAIProfile.brightness > 0 ? `+${selectedAIProfile.brightness}` : selectedAIProfile.brightness}
                          </span>
                        </div>
                        <div className="pe-ai-metric-item">
                          <span className="pe-ai-metric-name">Kontras:</span>
                          <span className="pe-ai-metric-val">
                            {selectedAIProfile.contrast > 0 ? `+${selectedAIProfile.contrast}` : selectedAIProfile.contrast}
                          </span>
                        </div>
                        <div className="pe-ai-metric-item">
                          <span className="pe-ai-metric-name">Saturasi:</span>
                          <span className="pe-ai-metric-val">
                            {selectedAIProfile.saturation > 0 ? `+${selectedAIProfile.saturation}` : selectedAIProfile.saturation}
                          </span>
                        </div>
                        <div className="pe-ai-metric-item">
                          <span className="pe-ai-metric-name">Kulit Manusia:</span>
                          <span className="pe-ai-metric-val" style={{ color: selectedAIProfile.hasHumanSkin ? '#2ecc71' : 'inherit' }}>
                            {selectedAIProfile.hasHumanSkin ? 'Terdeteksi ✓' : 'Tidak'}
                          </span>
                        </div>
                        {selectedAIProfile.labStats && (
                          <div className="pe-ai-metric-item" style={{ gridColumn: 'span 2' }}>
                            <span className="pe-ai-metric-name">CIE Lab (L*, a*, b*):</span>
                            <span className="pe-ai-metric-val" style={{ fontSize: '11px' }}>
                              L:{selectedAIProfile.labStats.lMean} a:{selectedAIProfile.labStats.aMean} b:{selectedAIProfile.labStats.bMean}
                            </span>
                          </div>
                        )}
                        {selectedAIProfile.shadowClippingPercent !== undefined && (
                          <div className="pe-ai-metric-item" style={{ gridColumn: 'span 2' }}>
                            <span className="pe-ai-metric-name">Clipping Gelap / Terang:</span>
                            <span className="pe-ai-metric-val" style={{ fontSize: '11px' }}>
                              {selectedAIProfile.shadowClippingPercent}% / {selectedAIProfile.highlightClippingPercent}%
                            </span>
                          </div>
                        )}
                      </div>

                      {/* MODE PENCOCOKAN ADAPTIF (Section 5: Natural, Balanced, Strong) */}
                      <div style={{ margin: '12px 0 14px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label className="pe-slider-label" style={{ fontSize: '11px', fontWeight: 600 }}>
                            Mode Pencocokan Adaptif:
                          </label>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            {aiMatchMode === 'natural' ? 'Alami (55%)' : aiMatchMode === 'strong' ? 'Tegas (100%)' : 'Seimbang (85%)'}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                          {[
                            { id: 'natural' as const, label: '🌿 Natural', desc: 'Konservatif & Halus' },
                            { id: 'balanced' as const, label: '⚖️ Balanced', desc: 'Standar Lightroom' },
                            { id: 'strong' as const, label: '⚡ Strong', desc: 'Sinematik Tegas' },
                          ].map((mode) => (
                            <button
                              key={mode.id}
                              type="button"
                              className={`btn btn-xs ${aiMatchMode === mode.id ? 'btn-primary' : 'btn-ghost'}`}
                              style={{
                                padding: '6px 4px',
                                flexDirection: 'column',
                                display: 'flex',
                                alignItems: 'center',
                                fontSize: '11px',
                                border: aiMatchMode === mode.id ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                                background: aiMatchMode === mode.id ? 'rgba(124, 92, 252, 0.25)' : 'rgba(255,255,255,0.03)',
                              }}
                              onClick={() => {
                                setAiMatchMode(mode.id);
                                if (aiPreviousAdjustments) {
                                  handleApplyAIFilter(aiIntensity, mode.id);
                                }
                              }}
                              id={`btn-mode-${mode.id}`}
                            >
                              <strong>{mode.label}</strong>
                              <span style={{ fontSize: '9px', opacity: 0.8 }}>{mode.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* KONTROL 8: SLIDER INTENSITAS AI FILTER (0–100%) */}
                      <div className="pe-slider-group">
                        <div className="pe-slider-header">
                          <label className="pe-slider-label">Intensitas AI Filter (0–100%)</label>
                          <span className="pe-slider-value">{aiIntensity}%</span>
                        </div>
                        <input
                          type="range"
                          className="slider"
                          min="0"
                          max="100"
                          value={aiIntensity}
                          onChange={(e) => setAiIntensity(parseInt(e.target.value))}
                          id="slider-ai-intensity"
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          {[
                            { label: '0% Asli', val: 0 },
                            { label: '35% Halus', val: 35 },
                            { label: '70% Alami', val: 70 },
                            { label: '100% Penuh', val: 100 },
                          ].map((p) => (
                            <button
                              key={p.val}
                              type="button"
                              className={`btn btn-ghost btn-sm ${aiIntensity === p.val ? 'btn-secondary' : ''}`}
                              style={{ flex: 1, fontSize: '11px', padding: '2px 6px' }}
                              onClick={() => {
                                setAiIntensity(p.val);
                                if (aiPreviousAdjustments) {
                                  handleApplyAIFilter(p.val);
                                }
                              }}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* AI Options Toggles */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={aiIncludeAdjustments}
                            onChange={(e) => setAiIncludeAdjustments(e.target.checked)}
                          />
                          <span>Salin Pencahayaan &amp; Kontras Diferensial</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={aiIncludeGrading}
                            onChange={(e) => setAiIncludeGrading(e.target.checked)}
                          />
                          <span>Salin 3-Way Color Grading (Shadows &amp; Highlights)</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={aiIncludeFilter}
                            onChange={(e) => setAiIncludeFilter(e.target.checked)}
                          />
                          <span>Salin Filter Spektral Terdekat</span>
                        </label>
                      </div>

                      {/* SECTION 6: PROTEKSI TEKSTUR, WAJAH & TUBUH */}
                      <div className="pe-protection-card">
                        <div className="pe-protection-title">
                          <span>🛡️ Preservasi Tekstur, Wajah &amp; Tubuh</span>
                        </div>
                        <div className="pe-protection-list">
                          <label className="pe-protection-item">
                            <input
                              type="checkbox"
                              checked={aiPreserveTexture}
                              onChange={(e) => setAiPreserveTexture(e.target.checked)}
                              id="toggle-preserve-texture"
                            />
                            <div className="pe-protection-label">
                              <span className="pe-protection-name">
                                Preserve Original Texture <span className="pe-badge-safe">ON (Aktif)</span>
                              </span>
                              <span className="pe-protection-desc">
                                Mengunci denoise = 0 &amp; membatasi sharpness agar pori-pori kulit, rambut halus, kerutan, dan serat pakaian tetap asli 100%.
                              </span>
                            </div>
                          </label>

                          <label className="pe-protection-item">
                            <input
                              type="checkbox"
                              checked={aiProtectSkin}
                              onChange={(e) => setAiProtectSkin(e.target.checked)}
                              id="toggle-preserve-face"
                            />
                            <div className="pe-protection-label">
                              <span className="pe-protection-name">
                                Preserve Facial Identity <span className="pe-badge-safe">ON (Aktif)</span>
                              </span>
                              <span className="pe-protection-desc">
                                Menjaga struktur anatomi wajah, warna melanin kulit, dan proporsi fitur alami dari pergeseran hue ekstrem.
                              </span>
                            </div>
                          </label>

                          <label className="pe-protection-item">
                            <input
                              type="checkbox"
                              checked={aiPreserveBodyShape}
                              onChange={(e) => setAiPreserveBodyShape(e.target.checked)}
                              id="toggle-preserve-body"
                            />
                            <div className="pe-protection-label">
                              <span className="pe-protection-name">
                                Preserve Body Shape <span className="pe-badge-safe">ON (Aktif)</span>
                              </span>
                              <span className="pe-protection-desc">
                                Isometrik 1:1 ketat — dilarang keras mengubah bentuk tubuh, postur, atau ukuran anggota badan.
                              </span>
                            </div>
                          </label>

                          <label className="pe-protection-item">
                            <input
                              type="checkbox"
                              checked={aiSkinSmoothing}
                              onChange={(e) => setAiSkinSmoothing(e.target.checked)}
                              id="toggle-skin-smoothing"
                            />
                            <div className="pe-protection-label">
                              <span className="pe-protection-name">
                                Skin Smoothing <span className="pe-badge-off">OFF (Dilarang)</span>
                              </span>
                              <span className="pe-protection-desc">
                                Nonaktif — tidak ada penghalusan kulit otomatis, blur bilateral, atau penghapusan tanda lahir/tahi lalat.
                              </span>
                            </div>
                          </label>

                          <label className="pe-protection-item">
                            <input
                              type="checkbox"
                              checked={aiFaceRetouching}
                              onChange={(e) => setAiFaceRetouching(e.target.checked)}
                              id="toggle-face-retouch"
                            />
                            <div className="pe-protection-label">
                              <span className="pe-protection-name">
                                Face Retouching <span className="pe-badge-off">OFF (Dilarang)</span>
                              </span>
                              <span className="pe-protection-desc">
                                Nonaktif — tidak ada modifikasi hidung, mata, bibir, rahang, atau alis wajah.
                              </span>
                            </div>
                          </label>

                          <label className="pe-protection-item">
                            <input
                              type="checkbox"
                              checked={aiBodyReshaping}
                              onChange={(e) => setAiBodyReshaping(e.target.checked)}
                              id="toggle-body-reshape"
                            />
                            <div className="pe-protection-label">
                              <span className="pe-protection-name">
                                Body Reshaping <span className="pe-badge-off">OFF (Dilarang)</span>
                              </span>
                              <span className="pe-protection-desc">
                                Nonaktif — tidak ada penyesuaian pinggang, pelangsingan, atau pembentukan ulang tubuh.
                              </span>
                            </div>
                          </label>

                          <label className="pe-protection-item">
                            <input
                              type="checkbox"
                              checked={aiGenerativeRecon}
                              onChange={(e) => setAiGenerativeRecon(e.target.checked)}
                              id="toggle-generative-recon"
                            />
                            <div className="pe-protection-label">
                              <span className="pe-protection-name">
                                Generative Reconstruction <span className="pe-badge-off">OFF (Dilarang)</span>
                              </span>
                              <span className="pe-protection-desc">
                                Nonaktif — murni pemrosesan piksel matematis deterministik (color grading), tanpa AI sintetis generatif.
                              </span>
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* KONTROL 7 & 13: TERAPKAN & TERAPKAN ULANG */}
                      <div className="pe-ai-actions">
                        <button
                          className="btn btn-primary pe-ai-apply-btn"
                          onClick={() => handleApplyAIFilter()}
                          id="btn-apply-ai-filter"
                          style={{ fontWeight: 700, background: 'linear-gradient(135deg, #7c5cfc 0%, #00d4aa 100%)', border: 'none' }}
                        >
                          ✨ Terapkan Filter AI ke Foto Saya
                        </button>

                        {/* KONTROL 9: TOMBOL BEFORE / AFTER */}
                        <button
                          className="btn btn-ghost pe-ai-compare-btn"
                          onMouseDown={() => setIsComparingAI(true)}
                          onMouseUp={() => setIsComparingAI(false)}
                          onTouchStart={() => setIsComparingAI(true)}
                          onTouchEnd={() => setIsComparingAI(false)}
                          id="btn-compare-ai"
                        >
                          👁️ Tahan untuk Bandingkan (Before/After)
                        </button>

                        {/* KONTROL 10: RESET FILTER AI */}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={handleResetAIFilter}
                          id="btn-reset-ai-filter"
                          style={{ color: '#ff7b72' }}
                        >
                          ⟲ Reset Filter AI Saja
                        </button>

                        {/* KONTROL 12: SIMPAN SEBAGAI PRESET */}
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setNewPresetName(`AI_${selectedAIProfile.colorMoodTag}`);
                            setPresetModalOpen(true);
                          }}
                          id="btn-save-ai-as-preset"
                        >
                          💾 Simpan Pengaturan AI Ini sebagai Preset
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Preset Quick Inspirations */}
                  <span className="pe-ai-presets-title" style={{ marginTop: 12 }}>Atau Pilih Gaya Referensi Siap Pakai:</span>
                  <div className="pe-ai-presets-grid">
                    {PRESET_AI_REFERENCES.map((preset) => (
                      <button
                        key={preset.id}
                        className={`pe-ai-preset-card ${selectedAIProfile?.colorMoodTag === preset.profile.colorMoodTag && aiReferenceName === preset.title ? 'pe-ai-preset-card--active' : ''}`}
                        onClick={() => {
                          setSelectedAIProfile(preset.profile);
                          setAiReferenceThumb(null);
                          setAiReferenceGradient(preset.sampleGradient);
                          setAiReferenceName(preset.title);
                          showToast(`Inspirasi '${preset.title}' dipilih`, 'info');
                        }}
                        id={`btn-preset-ai-${preset.id}`}
                      >
                        <div
                          className="pe-ai-preset-dot"
                          style={{ background: preset.sampleGradient }}
                        />
                        <span className="pe-ai-preset-name">{preset.title}</span>
                      </button>
                    ))}
                  </div>
                    </>
                  )}

                  {/* AI IMAGE RECONSTRUCTION & ENHANCEMENT PANEL */}
                  {aiSubTab === 'reconstruction' && (
                    <div className="pe-recon-container">
                      <div className="pe-ai-badge-banner">
                        <div className="pe-ai-badge-title">
                          <span>🔍 AI Image Reconstruction & Enhancement</span>
                        </div>
                        <span className="pe-ai-tag">Hybrid CV + AI</span>
                      </div>

                      <p className="pe-ai-desc">
                        Restorasi citra cerdas untuk foto buram, noise sensor, beresolusi rendah, pencahayaan buruk, atau bagian subjek yang rusak/hilang dengan pemrosesan lokal non-generatif dan rekonstruksi adaptif.
                      </p>

                      {/* 1. ANALISIS KONDISI & DIAGNOSTIK GAMBAR */}
                      <div className="pe-recon-card" id="card-image-diagnostics">
                        <div className="pe-recon-card-title">
                          <span>🔬 1. Analisis Kondisi & Diagnostik Citra</span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={handleRunQualityAnalysis}
                            disabled={isAnalyzingQuality || !sourceImage}
                            id="btn-run-quality-analysis"
                          >
                            {isAnalyzingQuality ? '⏳ Menganalisis...' : '🔄 Analisis Ulang'}
                          </button>
                        </div>

                        {qualityReport ? (
                          <>
                            <div className="pe-quality-grid">
                              {/* Blur & Focus Score */}
                              <div className="pe-metric-tile" id="metric-tile-blur">
                                <span className="pe-metric-label">Ketajaman & Fokus</span>
                                <div className="pe-metric-val">
                                  <span>{qualityReport.blurScore}/100</span>
                                  <span
                                    className="pe-metric-status"
                                    style={{
                                      color:
                                        qualityReport.blurScore >= 50
                                          ? '#34d399'
                                          : qualityReport.blurScore >= 35
                                          ? '#fcd34d'
                                          : '#f87171',
                                    }}
                                  >
                                    {qualityReport.blurScore >= 50
                                      ? '✓ Tajam'
                                      : qualityReport.blurScore >= 35
                                      ? '⚠️ Fokus Lembut'
                                      : '⚠️ Buram / Motion Blur'}
                                  </span>
                                </div>
                                <div className="pe-metric-bar">
                                  <div
                                    className="pe-metric-fill"
                                    style={{
                                      width: `${qualityReport.blurScore}%`,
                                      background:
                                        qualityReport.blurScore >= 50
                                          ? '#10b981'
                                          : qualityReport.blurScore >= 35
                                          ? '#f59e0b'
                                          : '#ef4444',
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Noise & Artefak */}
                              <div className="pe-metric-tile" id="metric-tile-noise">
                                <span className="pe-metric-label">Noise & Artefak</span>
                                <div className="pe-metric-val">
                                  <span>{qualityReport.noiseScore}/100</span>
                                  <span
                                    className="pe-metric-status"
                                    style={{
                                      color:
                                        qualityReport.noiseScore <= 30
                                          ? '#34d399'
                                          : qualityReport.noiseScore <= 55
                                          ? '#fcd34d'
                                          : '#f87171',
                                    }}
                                  >
                                    {qualityReport.noiseScore <= 30
                                      ? '✓ Bersih'
                                      : qualityReport.noiseScore <= 55
                                      ? 'Sedang'
                                      : '⚠️ Noise Tinggi'}
                                  </span>
                                </div>
                                <div className="pe-metric-bar">
                                  <div
                                    className="pe-metric-fill"
                                    style={{
                                      width: `${qualityReport.noiseScore}%`,
                                      background:
                                        qualityReport.noiseScore <= 30
                                          ? '#10b981'
                                          : qualityReport.noiseScore <= 55
                                          ? '#f59e0b'
                                          : '#ef4444',
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Pencahayaan & Rentang Dinamis */}
                              <div className="pe-metric-tile" id="metric-tile-lighting">
                                <span className="pe-metric-label">Pencahayaan & Dynamic Range</span>
                                <div className="pe-metric-val">
                                  <span>{qualityReport.lightingScore}/100</span>
                                  <span
                                    className="pe-metric-status"
                                    style={{
                                      color:
                                        qualityReport.lightingScore >= 60
                                          ? '#34d399'
                                          : qualityReport.lightingScore >= 40
                                          ? '#fcd34d'
                                          : '#f87171',
                                    }}
                                  >
                                    {qualityReport.lightingScore >= 60
                                      ? '✓ Seimbang'
                                      : '⚠️ Perlu Koreksi'}
                                  </span>
                                </div>
                                <div className="pe-metric-bar">
                                  <div
                                    className="pe-metric-fill"
                                    style={{
                                      width: `${qualityReport.lightingScore}%`,
                                      background:
                                        qualityReport.lightingScore >= 60 ? '#10b981' : '#f59e0b',
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Resolusi & Dimensi */}
                              <div className="pe-metric-tile" id="metric-tile-resolution">
                                <span className="pe-metric-label">Resolusi & Dimensi</span>
                                <div className="pe-metric-val">
                                  <span>{qualityReport.megapixel} MP</span>
                                  <span className="pe-metric-status" style={{ color: '#93c5fd' }}>
                                    {qualityReport.width}×{qualityReport.height}
                                  </span>
                                </div>
                                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                                  Kategori: {qualityReport.resolutionCategory.toUpperCase()}
                                </div>
                              </div>
                            </div>

                            {/* Daftar Masalah Terdeteksi */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                                Masalah Citra Terdeteksi:
                              </span>
                              <div className="pe-issues-list">
                                {qualityReport.detectedIssues.length > 0 ? (
                                  qualityReport.detectedIssues.map((issue, idx) => (
                                    <span key={idx} className="pe-issue-chip">
                                      ⚠️ {issue}
                                    </span>
                                  ))
                                ) : (
                                  <span className="pe-issue-chip pe-issue-chip--good">
                                    ✓ Citra dalam kondisi baik (tanpa degradasi signifikan)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Rekomendasi Naratif */}
                            <div className="pe-summary-alert">
                              <strong>💡 Rekomendasi AI: </strong>
                              {qualityReport.analysisSummary}
                            </div>
                          </>
                        ) : (
                          <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>
                            {sourceImage ? 'Memeriksa kualitas citra...' : 'Muat foto terlebih dahulu untuk menjalankan analisis.'}
                          </div>
                        )}
                      </div>

                      {/* 2. PILIHAN MODE RESTORASI (3 PILIHAN UTAMA) */}
                      <div className="pe-recon-card" id="card-restoration-modes">
                        <div className="pe-recon-card-title">
                          <span>🛠️ 2. Pilih Mode Restorasi</span>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>3 Pilihan Strategi</span>
                        </div>

                        <div className="pe-mode-cards">
                          {/* Mode 1: Enhance Original */}
                          <div
                            className={`pe-mode-card ${reconMode === 'enhance_original' ? 'pe-mode-card--active' : ''}`}
                            onClick={() => setReconMode('enhance_original')}
                            id="btn-mode-enhance-original"
                          >
                            <div className="pe-mode-header">
                              <span className="pe-mode-title">1. Enhance Original</span>
                              <span className="pe-mode-badge pe-mode-badge--green">Lokal (Rp 0) • Zero Halusinasi</span>
                            </div>
                            <p className="pe-mode-desc">
                              Memperbaiki ketajaman, denoise, bayangan, dan kontras mikro dengan mempertahankan 100% informasi visual asli tanpa penambahan detail spekulatif.
                            </p>
                          </div>

                          {/* Mode 2: AI Reconstruction */}
                          <div
                            className={`pe-mode-card ${reconMode === 'ai_reconstruction' ? 'pe-mode-card--active' : ''}`}
                            onClick={() => setReconMode('ai_reconstruction')}
                            id="btn-mode-ai-reconstruction"
                          >
                            <div className="pe-mode-header">
                              <span className="pe-mode-title">2. AI Reconstruction</span>
                              <span className="pe-mode-badge pe-mode-badge--purple">Generatif Terarah</span>
                            </div>
                            <p className="pe-mode-desc">
                              Merekonstruksi bagian subjek yang rusak, buram parah, atau tertutup berdasarkan kontur yang tampak, konteks lingkungan, dan petunjuk pengguna.
                            </p>
                          </div>

                          {/* Mode 3: Generate Alternative */}
                          <div
                            className={`pe-mode-card ${reconMode === 'generate_alternative' ? 'pe-mode-card--active' : ''}`}
                            onClick={() => setReconMode('generate_alternative')}
                            id="btn-mode-generate-alternative"
                          >
                            <div className="pe-mode-header">
                              <span className="pe-mode-title">3. Generate Alternative</span>
                              <span className="pe-mode-badge pe-mode-badge--cyan">Interpretasi Konteks</span>
                            </div>
                            <p className="pe-mode-desc">
                              Membuat variasi interpretasi alternatif dari gambar sumber dengan subjek yang lebih jelas, hidup, dan terdefinisi secara artistik.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 3. KONTEKS & PETUNJUK SUBJEK */}
                      <div className="pe-recon-card" id="card-subject-context">
                        <div className="pe-recon-card-title">
                          <span>💡 3. Konteks & Petunjuk Subjek</span>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>Opsional</span>
                        </div>

                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', margin: 0 }}>
                          Jika bentuk objek samar, tertutup, atau tidak lengkap, berikan deskripsi singkat untuk memandu AI merekonstruksi bentuk dengan tepat:
                        </p>

                        <input
                          type="text"
                          className="pe-text-input"
                          placeholder="Misal: Kucing oranye di sofa, wajah tersenyum, atau plat nomor sedan..."
                          value={reconSubjectHint}
                          onChange={(e) => setReconSubjectHint(e.target.value)}
                          style={{
                            background: 'rgba(10, 12, 20, 0.6)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            color: '#fff',
                            fontSize: '11.5px',
                            width: '100%',
                          }}
                          id="input-recon-subject-hint"
                        />

                        {/* Quick Context Action Chips */}
                        <div>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>
                            Instruksi Cepat:
                          </span>
                          <div className="pe-context-chips">
                            <button
                              type="button"
                              className="pe-context-chip"
                              onClick={() => {
                                setReconMode('enhance_original');
                                setReconSubjectHint('Perjelas subjek yang buram');
                              }}
                            >
                              🔍 Perjelas subjek yang buram
                            </button>
                            <button
                              type="button"
                              className="pe-context-chip"
                              onClick={() => {
                                setReconMode('ai_reconstruction');
                                setReconSubjectHint('Rekonstruksi bagian objek yang hilang');
                              }}
                            >
                              🧩 Rekonstruksi bagian yang hilang
                            </button>
                            <button
                              type="button"
                              className="pe-context-chip"
                              onClick={() => {
                                setReconMode('ai_reconstruction');
                                setReconSubjectHint('Perkiraan bentuk objek');
                              }}
                            >
                              ✨ Perkiraan bentuk objek
                            </button>
                            <button
                              type="button"
                              className="pe-context-chip"
                              onClick={() => {
                                setReconMode('generate_alternative');
                                setReconSubjectHint('Versi baru dengan subjek lebih jelas');
                              }}
                            >
                              🎨 Versi baru subjek lebih jelas
                            </button>
                            <button
                              type="button"
                              className="pe-context-chip"
                              onClick={() => {
                                setReconMode('enhance_original');
                                setReconSubjectHint('Pertahankan latar belakang');
                              }}
                            >
                              🛡️ Pertahankan background
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 4. KONTROL INTENSITAS & AKSI */}
                      <div className="pe-recon-card" id="card-recon-intensity">
                        <div className="pe-recon-card-title">
                          <span>🎚️ 4. Intensitas Restorasi</span>
                          <span style={{ fontWeight: 700, color: '#818cf8' }}>{reconIntensity}%</span>
                        </div>

                        <input
                          type="range"
                          min={10}
                          max={100}
                          value={reconIntensity}
                          onChange={(e) => setReconIntensity(Number(e.target.value))}
                          className="pe-slider"
                          id="slider-recon-intensity"
                        />

                        <div style={{ display: 'flex', gap: '8px', marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ flex: 1, padding: '10px 14px', fontSize: '12px', fontWeight: 600 }}
                            onClick={handleApplyReconstruction}
                            id="btn-apply-reconstruction"
                          >
                            🚀 Terapkan Restorasi ke Foto
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            title="Tahan untuk melihat foto asli sebelum restorasi"
                            onMouseDown={() => {
                              setAiPreviousAdjustments(structuredClone(editState.adjustments));
                              setEditState((prev) => ({
                                ...prev,
                                adjustments: structuredClone(DEFAULT_ADJUSTMENTS),
                              }));
                            }}
                            onMouseUp={() => {
                              if (aiPreviousAdjustments) {
                                setEditState((prev) => ({
                                  ...prev,
                                  adjustments: structuredClone(aiPreviousAdjustments),
                                }));
                                setAiPreviousAdjustments(null);
                              }
                            }}
                            onMouseLeave={() => {
                              if (aiPreviousAdjustments) {
                                setEditState((prev) => ({
                                  ...prev,
                                  adjustments: structuredClone(aiPreviousAdjustments),
                                }));
                                setAiPreviousAdjustments(null);
                              }
                            }}
                            style={{ padding: '10px 12px', fontSize: '11px' }}
                            id="btn-hold-compare-recon"
                          >
                            👁️ Tahan Bandingkan
                          </button>
                        </div>
                      </div>

                      {/* 5. KOTAK TRANSPARANSI & ETIKA AI */}
                      <div className="pe-disclaimer-box" id="box-recon-disclaimer">
                        <span style={{ fontSize: '14px' }}>⚠️</span>
                        <div>
                          <strong>Transparansi Rekonstruksi AI:</strong>{' '}
                          Hasil rekonstruksi generatif merupakan estimasi kemungkinan visual berbasis konteks AI, bukan pemulihan fakta forensik dari detail asli yang telah hilang dari file gambar.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─── P2 AI BACKGROUND REMOVAL SUBTAB ────────────── */}
                  {aiSubTab === 'background_removal' && (
                    <div className="pe-recon-container">
                      <div className="pe-ai-badge-banner">
                        <div className="pe-ai-badge-title">
                          <span>✂️ AI Background Removal</span>
                        </div>
                        <span className="pe-ai-tag">Online Serverless</span>
                      </div>

                      <p className="pe-ai-desc">
                        Hapus latar belakang foto secara otomatis dengan model segmentasi canggih (RMBG-1.4). Hasil berupa citra PNG transparan resolusi penuh yang dapat disimpan sebagai versi baru tanpa merusak foto asli.
                      </p>

                      {/* Server Status Badge */}
                      <div style={{ marginBottom: 10 }}>
                        {backendHealth?.providerConfigured ? (
                          <div className="pe-server-badge pe-server-badge--online" id="badge-server-status">
                            <span>●</span>
                            <span>Server Siap ({backendHealth.activeProvider} — {backendHealth.model})</span>
                          </div>
                        ) : backendHealth?.available ? (
                          <div className="pe-server-badge pe-server-badge--unconfigured" id="badge-server-status">
                            <span>⚠️</span>
                            <span>Provider Belum Dikonfigurasi (Atur AI_PROVIDER_API_KEY di .env)</span>
                          </div>
                        ) : (
                          <div className="pe-server-badge pe-server-badge--offline" id="badge-server-status">
                            <span>●</span>
                            <span>Backend Offline (Jalankan 'npm run server')</span>
                          </div>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          style={{ marginLeft: 6, fontSize: '10px' }}
                          onClick={checkBackendHealthStatus}
                        >
                          🔄 Refresh Status
                        </button>
                      </div>

                      {/* Consent Card */}
                      <div className="pe-recon-card" id="card-bg-consent">
                        <div className="pe-recon-card-title">
                          <span>🛡️ 1. Persetujuan Pemrosesan Online</span>
                        </div>
                        <label className="pe-consent-checkbox-label">
                          <input
                            type="checkbox"
                            checked={bgRemovalConsent}
                            onChange={(e) => setBgRemovalConsent(e.target.checked)}
                            id="checkbox-bg-consent"
                          />
                          <span>
                            Saya mengizinkan pengiriman foto ke server AI online untuk penghapusan background. Data citra diproses murni di memori dan tidak disimpan permanen di server.
                          </span>
                        </label>
                      </div>

                      {/* Execution Card */}
                      <div className="pe-recon-card" id="card-bg-action">
                        <div className="pe-recon-card-title">
                          <span>⚙️ 2. Eksekusi Hapus Background</span>
                        </div>

                        {!isProcessingBgRemoval ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '10px', fontSize: '12px', fontWeight: 600 }}
                            onClick={handleStartBackgroundRemoval}
                            disabled={!bgRemovalConsent || !sourceImage}
                            id="btn-start-bg-removal"
                          >
                            ✂️ Mulai Hapus Background (AI)
                          </button>
                        ) : (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#818cf8', marginBottom: 4 }}>
                              <span>⏳ {bgRemovalProgress || 'Sedang memproses...'}</span>
                              <span style={{ fontWeight: 700 }}>{bgRemovalPercent}%</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden', marginBottom: 10 }}>
                              <div
                                style={{
                                  width: `${bgRemovalPercent}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, #7c5cfc, #00d4aa)',
                                  transition: 'width 0.3s ease',
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ width: '100%' }}
                              onClick={handleCancelBgRemovalRequest}
                              id="btn-cancel-bg-removal"
                            >
                              ⏹️ Batalkan Permintaan
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Error Display */}
                      {bgRemovalError && (
                        <div className="pe-disclaimer-box" style={{ borderColor: '#ef4444', color: '#fca5a5' }} id="box-bg-error">
                          <span style={{ fontSize: '14px' }}>⚠️</span>
                          <div>
                            <strong>Kendala Pemrosesan:</strong> {bgRemovalError}
                            {bgRemovalErrorCode === 'PROVIDER_NOT_CONFIGURED' && (
                              <div style={{ marginTop: 4, fontSize: '10px', color: '#fbbf24' }}>
                                Catatan: Buat file <code>.env</code> berdasarkan <code>.env.example</code> dan isi <code>AI_PROVIDER_API_KEY</code> dengan token Hugging Face Anda.
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Result Preview & Non-Destructive Versioning */}
                      {bgRemovalResultUrl && (
                        <div className="pe-recon-card" id="card-bg-result" style={{ borderColor: 'rgba(124, 92, 252, 0.4)' }}>
                          <div className="pe-recon-card-title">
                            <span>✨ 3. Hasil Transparan &amp; Pratinjau</span>
                          </div>

                          <div className="pe-checkerboard-box">
                            <img
                              src={isComparingBgRemoval && sourceImage ? sourceImage.src : bgRemovalResultUrl}
                              alt="Hasil Hapus Background"
                              className="pe-checkerboard-img"
                            />
                          </div>

                          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              style={{ flex: 1 }}
                              onMouseDown={() => setIsComparingBgRemoval(true)}
                              onMouseUp={() => setIsComparingBgRemoval(false)}
                              onMouseLeave={() => setIsComparingBgRemoval(false)}
                              id="btn-hold-compare-bg"
                            >
                              👁️ Tahan Bandingkan Asli
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => setBgRemovalResultUrl(null)}
                              id="btn-discard-bg-result"
                            >
                              ❌ Buang Hasil
                            </button>
                          </div>

                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '10px', fontSize: '12px', fontWeight: 600 }}
                            onClick={() => handleApplyNewImageVersion(bgRemovalResultUrl, 'Hapus Background AI')}
                            id="btn-apply-bg-version"
                          >
                            🎨 Terapkan Sebagai Versi Baru
                          </button>
                          <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', display: 'block', textAlign: 'center', marginTop: 4 }}>
                            Foto sumber asli tetap tersimpan utuh di galeri proyek.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'text' && (
                <div className="pe-panel-content">
                  <h3 className="pe-panel-title">Text Layers</h3>
                  <button className="btn btn-primary btn-sm" onClick={addTextLayer} id="btn-add-text">
                    + Tambah Teks
                  </button>
                  <div className="pe-text-layers">
                    {editState.textLayers.map((layer) => (
                      <div className="pe-text-layer-card" key={layer.id}>
                        <input
                          type="text"
                          className="pe-text-input"
                          value={layer.text}
                          onChange={(e) => updateTextLayer(layer.id, { text: e.target.value })}
                        />
                        <div className="pe-text-controls">
                          <input
                            type="color"
                            value={layer.color}
                            onChange={(e) => updateTextLayer(layer.id, { color: e.target.value })}
                            className="pe-color-picker"
                          />
                          <input
                            type="range"
                            className="slider"
                            min="12"
                            max="120"
                            value={layer.fontSize}
                            onChange={(e) =>
                              updateTextLayer(layer.id, { fontSize: parseInt(e.target.value) })
                            }
                            title="Font size"
                          />
                          <button
                            className={`btn btn-ghost btn-sm ${layer.bold ? 'pe-text-toggle--active' : ''}`}
                            onClick={() => updateTextLayer(layer.id, { bold: !layer.bold })}
                          >
                            <strong>B</strong>
                          </button>
                          <button
                            className={`btn btn-ghost btn-sm ${layer.italic ? 'pe-text-toggle--active' : ''}`}
                            onClick={() => updateTextLayer(layer.id, { italic: !layer.italic })}
                          >
                            <em>I</em>
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => removeTextLayer(layer.id)}
                            title="Hapus"
                          >
                            🗑
                          </button>
                        </div>
                        <div className="pe-text-pos">
                          <label>
                            X:
                            <input
                              type="range"
                              className="slider"
                              min="0"
                              max="100"
                              value={Math.round(layer.x * 100)}
                              onChange={(e) =>
                                updateTextLayer(layer.id, { x: parseInt(e.target.value) / 100 })
                              }
                            />
                          </label>
                          <label>
                            Y:
                            <input
                              type="range"
                              className="slider"
                              min="0"
                              max="100"
                              value={Math.round(layer.y * 100)}
                              onChange={(e) =>
                                updateTextLayer(layer.id, { y: parseInt(e.target.value) / 100 })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                    {editState.textLayers.length === 0 && (
                      <p className="pe-hint">Belum ada layer teks.</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'export' && (
                <div className="pe-panel-content">
                  <h3 className="pe-panel-title">Export</h3>

                  <div className="pe-export-group">
                    <label className="pe-slider-label">Format</label>
                    <div className="pe-export-format-btns">
                      <button
                        className={`btn btn-sm ${exportFormat === 'jpeg' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setExportFormat('jpeg')}
                        id="btn-format-jpeg"
                      >
                        JPEG
                      </button>
                      <button
                        className={`btn btn-sm ${exportFormat === 'png' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setExportFormat('png')}
                        id="btn-format-png"
                      >
                        PNG
                      </button>
                      <button
                        className={`btn btn-sm ${exportFormat === 'webp' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setExportFormat('webp')}
                        id="btn-format-webp"
                      >
                        WebP
                      </button>
                    </div>
                  </div>

                  {(exportFormat === 'jpeg' || exportFormat === 'webp') && (
                    <div className="pe-slider-group">
                      <div className="pe-slider-header">
                        <label className="pe-slider-label">Kualitas</label>
                        <span className="pe-slider-value">{exportQuality}%</span>
                      </div>
                      <input
                        type="range"
                        className="slider"
                        min="10"
                        max="100"
                        value={exportQuality}
                        onChange={(e) => setExportQuality(parseInt(e.target.value))}
                        id="slider-quality"
                      />
                    </div>
                  )}

                  <div className="pe-export-group">
                    <label className="pe-slider-label">Preset Resolusi</label>
                    <select
                      className="pe-select"
                      value={exportResolution}
                      onChange={(e) => setExportResolution(e.target.value as ResolutionPreset)}
                      id="select-photo-resolution"
                    >
                      <option value="original">Resolusi Asli ({getExportDimensions().baseW}×{getExportDimensions().baseH})</option>
                      <option value="4k_uhd">4K UHD (3840×2160)</option>
                      <option value="qhd_1440p">QHD 1440p / 2K (2560×1440)</option>
                      <option value="fullhd_1080p">Full HD 1080p (1920×1080)</option>
                      <option value="hd_720p">HD 720p (1280×720)</option>
                      <option value="sd_480p">SD 480p (854×480)</option>
                    </select>
                  </div>

                  <div className="pe-export-info">
                    <p>
                      Output Target: <strong>{getExportDimensions().width}×{getExportDimensions().height} {exportResolution === 'original' ? '(Resolusi Penuh Asli)' : `(${RESOLUTION_MAP[exportResolution as keyof typeof RESOLUTION_MAP]?.label})`}</strong>
                    </p>
                    {exportResolution !== 'original' && sourceImage && (
                      getExportDimensions().width > getExportDimensions().baseW && (
                        <p className="pe-note-warning">
                          ⚠️ Resolusi target ({getExportDimensions().width}×{getExportDimensions().height}) lebih besar dari foto sumber ({getExportDimensions().baseW}×{getExportDimensions().baseH}). Upscaling kanvas tidak akan menciptakan detail baru.
                        </p>
                      )
                    )}
                    <p className="pe-hint">
                      File asli tidak akan ditimpa. Hasil disimpan sebagai berkas baru di perangkat Anda.
                    </p>
                  </div>

                  <button
                    className="btn btn-primary btn-lg pe-export-btn"
                    onClick={handleExport}
                    disabled={exporting}
                    id="btn-export"
                  >
                    {exporting ? (
                      <>
                        <span className="spinner" /> Mengekspor...
                      </>
                    ) : (
                      '📥 Ekspor Foto'
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Mobile: new photo button */}
            <div className="pe-sidebar-footer">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => fileInputRef.current?.click()}
                id="btn-change-photo"
              >
                📁 Ganti Foto
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FORMATS}
        onChange={handleFileSelect}
        className="sr-only"
        id="input-file-photo"
      />

      {/* Hidden file input for AI Reference */}
      <input
        ref={aiReferenceInputRef}
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setIsAnalyzingAI(true);
          try {
            const img = await loadImage(file);
            setAiReferenceThumb(URL.createObjectURL(file));
            setAiReferenceGradient(null);
            setAiReferenceName(file.name);
            const profile = await analyzeImageColors(img);
            setSelectedAIProfile(profile);
            showToast(`Analisis Piksel AI Selesai: Mood '${profile.colorMoodTag}' (${Math.round(profile.confidence * 100)}%)`, 'success');
          } catch {
            showToast('Gagal menganalisis foto referensi', 'error');
          } finally {
            setIsAnalyzingAI(false);
            if (aiReferenceInputRef.current) aiReferenceInputRef.current.value = '';
          }
        }}
        className="sr-only"
        id="input-ai-reference"
      />

      {/* Floating AI Chat Trigger Button */}
      {sourceImage && !isAIChatOpen && (
        <button
          type="button"
          className="ai-chat-trigger-btn"
          onClick={() => setIsAIChatOpen(true)}
          id="btn-open-ai-chat"
          title="Buka Asisten AI Percakapan (Conversational Photo Editor)"
        >
          <span>💬 AI Copilot</span>
        </button>
      )}

      {/* AI Chat Assistant Drawer */}
      {sourceImage && (
        <AIChatAssistant
          isOpen={isAIChatOpen}
          onClose={() => setIsAIChatOpen(false)}
          currentState={editState}
          onApplyState={(nextState, reason) => {
            pushState(nextState);
            if (reason) showToast(reason, 'success');
          }}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          fileName={fileName}
          sourceDimensions={
            sourceImage
              ? { width: sourceImage.naturalWidth, height: sourceImage.naturalHeight }
              : { width: 0, height: 0 }
          }
          getCurrentCanvas={() => canvasRef.current}
          onApplyNewImageVersion={handleApplyNewImageVersion}
        />
      )}

      {/* Error display */}
      {error && (
        <div className="pe-error-banner">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.message}</div>
        </div>
      )}
    </div>
  );
}
