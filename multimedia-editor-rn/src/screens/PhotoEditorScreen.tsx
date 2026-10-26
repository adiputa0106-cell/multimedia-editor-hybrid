import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Switch,
  Platform,
  Image as RNImage,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { Image } from 'expo-image';
import { captureRef } from 'react-native-view-shot';
import { Colors, Spacing, Fonts, Radius } from '../design/tokens';
import {
  type PhotoEditState,
  type FilterId,
  type TextLayer,
  type ResolutionPreset,
  type Project,
  type ColorChannel,
  type HSLMixerState,
  DEFAULT_PHOTO_EDIT_STATE,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_HSL_MIXER,
  HistoryManager,
  clampAdjustment,
  generateId,
  SCHEMA_VERSION,
} from '../core/types';
import { saveProject } from '../core/storage';
import { LightroomSliderRN } from '../design/LightroomSliderRN';
import {
  simulateAIVisualAnalysis,
  applyAIFilterToLocalState,
} from '../core/aiFilterMapper';

const COLOR_CHANNELS: { id: ColorChannel; label: string; color: string }[] = [
  { id: 'red', label: 'Merah', color: '#ff4d4d' },
  { id: 'orange', label: 'Oranye', color: '#ff944d' },
  { id: 'yellow', label: 'Kuning', color: '#ffd11a' },
  { id: 'green', label: 'Hijau', color: '#2ecc71' },
  { id: 'aqua', label: 'Aqua', color: '#00e6e6' },
  { id: 'blue', label: 'Biru', color: '#3385ff' },
  { id: 'purple', label: 'Ungu', color: '#9b59b6' },
  { id: 'magenta', label: 'Magenta', color: '#ff33cc' },
];

type ToolTab = 'adjust' | 'filter' | 'text' | 'export';

const FILTER_LIST: { id: FilterId; label: string; preview: string }[] = [
  { id: 'none', label: 'Original', preview: '🎨' },
  { id: 'grayscale', label: 'B&W', preview: '⬛' },
  { id: 'sepia', label: 'Sepia', preview: '🟫' },
  { id: 'warm', label: 'Warm', preview: '🟠' },
  { id: 'cool', label: 'Cool', preview: '🔵' },
  { id: 'vintage', label: 'Vintage', preview: '🟤' },
  { id: 'dramatic', label: 'Dramatic', preview: '⚫' },
];

const RESOLUTION_OPTIONS: { preset: ResolutionPreset; label: string; note: string; tag?: string }[] = [
  { preset: 'original', label: 'Asli (Original)', note: 'Dimensi penuh file sumber' },
  { preset: 'sd_480p', label: 'SD 480p (854×480)', note: 'Ekspor cepat, ramah memori', tag: 'Ringan' },
  { preset: 'hd_720p', label: 'HD 720p (1280×720)', note: 'Target awal stabil untuk mobile', tag: 'Stabil' },
  { preset: 'fullhd_1080p', label: 'Full HD 1080p (1920×1080)', note: 'Target utama MVP video & foto', tag: 'Rekomendasi' },
  { preset: 'cinema_2k', label: 'Cinema 2K (2048×1080)', note: 'Aspek sinematik 1.90:1' },
  { preset: 'qhd_1440p', label: 'QHD 1440p / 2K (2560×1440)', note: 'Ketajaman tinggi untuk display 2K' },
  { preset: 'uhd_4k', label: '4K UHD (3840×2160)', note: 'Membutuhkan RAM besar & perangkat tinggi', tag: 'Berat' },
];

function buildFilterStyle(filter: FilterId) {
  // expo-image tintColor / CSS filter equivalent via ImageManipulator actions
  // Filters applied at export time via ImageManipulator
  return filter;
}

interface Props {
  initialProject?: Project;
  onBack: () => void;
}

export default function PhotoEditorScreen({ initialProject, onBack }: Props) {
  const [sourceUri, setSourceUri] = useState<string | null>(
    initialProject?.source.localUri ?? null
  );
  const [fileName, setFileName] = useState(initialProject?.source.fileName ?? '');
  const [editState, setEditState] = useState<PhotoEditState>(
    initialProject
      ? (initialProject.editState as PhotoEditState)
      : { ...DEFAULT_PHOTO_EDIT_STATE }
  );
  const historyRef = useRef(new HistoryManager<PhotoEditState>(
    initialProject
      ? (initialProject.editState as PhotoEditState)
      : { ...DEFAULT_PHOTO_EDIT_STATE }
  ));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [activeTab, setActiveTab] = useState<ToolTab>('adjust');
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [exportResolution, setExportResolution] = useState<ResolutionPreset>('original');
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({
    width: initialProject?.source.width || 0,
    height: initialProject?.source.height || 0,
  });
  const imageContainerRef = useRef<View>(null);
  const [projectName, setProjectName] = useState(initialProject?.name ?? '');
  const [projectId] = useState(initialProject?.projectId ?? generateId());
  const [saving, setSaving] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [activeHslChannel, setActiveHslChannel] = useState<ColorChannel>('red');
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);

  const updateHslChannel = (
    channel: ColorChannel,
    property: 'hue' | 'saturation' | 'luminance',
    val: number,
    commit: boolean = false
  ) => {
    setEditState((prev) => {
      const prevHsl = prev.hslMixer || DEFAULT_HSL_MIXER;
      const updatedChannel = {
        ...prevHsl[channel],
        [property]: val,
      };
      const nextHsl: HSLMixerState = {
        ...prevHsl,
        [channel]: updatedChannel,
      };
      const nextState = { ...prev, hslMixer: nextHsl };
      if (commit) {
        historyRef.current.push(nextState);
        setCanUndo(historyRef.current.canUndo);
        setCanRedo(historyRef.current.canRedo);
      }
      return nextState;
    });
  };

  const handleAdjustmentChange = (
    key: 'brightness' | 'contrast' | 'saturation',
    val: number
  ) => {
    setEditState((prev) => ({
      ...prev,
      adjustments: { ...prev.adjustments, [key]: val },
    }));
  };

  const handleAdjustmentCommit = (
    key: 'brightness' | 'contrast' | 'saturation',
    val: number
  ) => {
    setEditState((prev) => {
      const nextState = {
        ...prev,
        adjustments: { ...prev.adjustments, [key]: val },
      };
      historyRef.current.push(nextState);
      setCanUndo(historyRef.current.canUndo);
      setCanRedo(historyRef.current.canRedo);
      return nextState;
    });
  };

  const handleAIFilterCopier = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Izin Diperlukan', 'Akses galeri diperlukan untuk memilih foto referensi.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setIsAnalyzingAI(true);
      try {
        const refUri = result.assets[0].uri;
        const profile = await simulateAIVisualAnalysis(refUri);
        const nextState = applyAIFilterToLocalState(editState, profile, historyRef.current);
        setEditState(nextState);
        setCanUndo(historyRef.current.canUndo);
        setCanRedo(historyRef.current.canRedo);
        Alert.alert(
          '✨ Filter AI Berhasil Disalin',
          `Mood Terdeteksi: ${profile.colorMoodTag.toUpperCase()}\n\n` +
          `• Kecerahan: ${profile.brightness > 0 ? `+${profile.brightness}` : profile.brightness}\n` +
          `• Kontras: ${profile.contrast > 0 ? `+${profile.contrast}` : profile.contrast}\n` +
          `• Saturasi: ${profile.saturation > 0 ? `+${profile.saturation}` : profile.saturation}\n` +
          `Keyakinan AI: ${Math.round(profile.confidence * 100)}%`
        );
      } catch (err) {
        Alert.alert('Gagal Analisis AI', (err as Error).message);
      } finally {
        setIsAnalyzingAI(false);
      }
    }
  };

  useEffect(() => {
    if (sourceUri && (!imageDimensions.width || !imageDimensions.height)) {
      RNImage.getSize(
        sourceUri,
        (width, height) => setImageDimensions({ width, height }),
        () => {}
      );
    }
  }, [sourceUri]);

  const [activeCropRatio, setActiveCropRatio] = useState<string>('original');

  const computeTargetResolution = (preset: ResolutionPreset) => {
    const { width, height } = imageDimensions;
    if (preset === 'original' || !width || !height) {
      return {
        width,
        height,
        text: width && height ? `${width} × ${height} px` : 'Sesuai resolusi asli',
        warning: '',
      };
    }
    const isLandscape = width >= height;
    const aspectRatio = width / height;

    let targetW = width;
    let targetH = height;
    let warning = '';

    if (preset === 'sd_480p') {
      if (isLandscape) {
        targetW = Math.min(width, 854);
        targetH = Math.round(targetW / aspectRatio);
      } else {
        targetH = Math.min(height, 854);
        targetW = Math.round(targetH * aspectRatio);
      }
    } else if (preset === 'hd_720p') {
      if (isLandscape) {
        targetW = Math.min(width, 1280);
        targetH = Math.round(targetW / aspectRatio);
      } else {
        targetH = Math.min(height, 1280);
        targetW = Math.round(targetH * aspectRatio);
      }
    } else if (preset === 'fullhd_1080p') {
      if (isLandscape) {
        targetW = Math.min(width, 1920);
        targetH = Math.round(targetW / aspectRatio);
      } else {
        targetH = Math.min(height, 1920);
        targetW = Math.round(targetH * aspectRatio);
      }
    } else if (preset === 'cinema_2k') {
      if (isLandscape) {
        targetW = Math.min(width, 2048);
        targetH = Math.round(targetW / aspectRatio);
      } else {
        targetH = Math.min(height, 2048);
        targetW = Math.round(targetH * aspectRatio);
      }
    } else if (preset === 'qhd_1440p') {
      if (isLandscape) {
        targetW = Math.min(width, 2560);
        targetH = Math.round(targetW / aspectRatio);
      } else {
        targetH = Math.min(height, 2560);
        targetW = Math.round(targetH * aspectRatio);
      }
      if (width < 2560 && height < 2560) {
        warning = 'Upscaling: Detail asli tidak otomatis bertambah.';
      }
    } else if (preset === 'uhd_4k') {
      if (isLandscape) {
        targetW = Math.min(width, 3840);
        targetH = Math.round(targetW / aspectRatio);
      } else {
        targetH = Math.min(height, 3840);
        targetW = Math.round(targetH * aspectRatio);
      }
      warning = 'Perhatian: Resolusi 4K membutuhkan memori besar & waktu proses lebih lama.';
    }

    return {
      width: targetW,
      height: targetH,
      text: `${targetW} × ${targetH} px`,
      warning,
    };
  };

  const handleSetCropRatio = (ratio: 'original' | '1:1' | '4:5' | '16:9' | '9:16') => {
    setActiveCropRatio(ratio);
    if (!imageDimensions.width || !imageDimensions.height) {
      Alert.alert('Info', 'Import foto terlebih dahulu untuk melakukan crop.');
      return;
    }
    const { width: W, height: H } = imageDimensions;
    if (ratio === 'original') {
      pushState({ ...editState, crop: null });
      return;
    }

    let targetRatio = 1;
    if (ratio === '1:1') targetRatio = 1;
    else if (ratio === '4:5') targetRatio = 4 / 5;
    else if (ratio === '16:9') targetRatio = 16 / 9;
    else if (ratio === '9:16') targetRatio = 9 / 16;

    let cropW = W;
    let cropH = H;
    const currentRatio = W / H;

    if (currentRatio > targetRatio) {
      cropW = Math.round(H * targetRatio);
      cropH = H;
    } else {
      cropW = W;
      cropH = Math.round(W / targetRatio);
    }

    const originX = Math.round((W - cropW) / 2);
    const originY = Math.round((H - cropH) / 2);

    pushState({
      ...editState,
      crop: { originX, originY, width: cropW, height: cropH },
    });
  };

  // ─── History ─────────────────────────────────────────

  const pushState = useCallback((newState: PhotoEditState) => {
    historyRef.current.push(newState);
    setEditState({ ...newState });
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  }, []);

  const handleUndo = () => {
    const prev = historyRef.current.undo();
    if (prev) {
      setEditState({ ...prev });
      setCanUndo(historyRef.current.canUndo);
      setCanRedo(historyRef.current.canRedo);
    }
  };

  const handleRedo = () => {
    const next = historyRef.current.redo();
    if (next) {
      setEditState({ ...next });
      setCanUndo(historyRef.current.canUndo);
      setCanRedo(historyRef.current.canRedo);
    }
  };

  const handleReset = () => {
    Alert.alert('Reset', 'Reset semua perubahan ke kondisi awal?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          const fresh = { ...DEFAULT_PHOTO_EDIT_STATE };
          historyRef.current.reset(fresh);
          setEditState(fresh);
          setCanUndo(false);
          setCanRedo(false);
        },
      },
    ]);
  };

  // ─── Import ───────────────────────────────────────────

  const handleImportPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Izin Diperlukan', 'Akses galeri diperlukan untuk memilih foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSourceUri(asset.uri);
      setFileName(asset.fileName ?? asset.uri.split('/').pop() ?? 'foto.jpg');
      if (asset.width && asset.height) {
        setImageDimensions({ width: asset.width, height: asset.height });
      } else {
        RNImage.getSize(
          asset.uri,
          (width, height) => setImageDimensions({ width, height }),
          () => {}
        );
      }
      const fresh = { ...DEFAULT_PHOTO_EDIT_STATE };
      historyRef.current.reset(fresh);
      setEditState(fresh);
      setCanUndo(false);
      setCanRedo(false);
    }
  };

  // ─── Adjustments ──────────────────────────────────────

  const updateAdjustment = (
    key: 'brightness' | 'contrast' | 'saturation',
    value: number
  ) => {
    pushState({
      ...editState,
      adjustments: { ...editState.adjustments, [key]: clampAdjustment(value) },
    });
  };

  const handleRotate = () => {
    const next = ((editState.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    pushState({ ...editState, rotation: next });
  };

  const handleFlipH = () => pushState({ ...editState, flipX: !editState.flipX });
  const handleFlipV = () => pushState({ ...editState, flipY: !editState.flipY });

  // ─── Export ───────────────────────────────────────────

  const handleExport = async () => {
    if (!sourceUri) return;
    setExporting(true);
    try {

      let exportedUri = sourceUri;

      // Capture the live preview view (including filters, overlays, tints, brightness, contrast, transforms)
      // to ensure all edits are baked into the exported file instead of saving the raw original
      try {
        if (imageContainerRef.current) {
          const snapshotUri = await captureRef(imageContainerRef, {
            format: exportFormat === 'png' ? 'png' : 'jpg',
            quality: exportFormat === 'jpeg' ? 0.95 : 1,
            result: 'tmpfile',
          });
          if (snapshotUri) {
            exportedUri = snapshotUri;
          }
        }
      } catch (snapshotErr) {
        console.warn('captureRef snapshot fallback to manipulation actions:', snapshotErr);
      }

      // Build manipulation actions (resizing or fallback transforms)
      const actions: ImageManipulator.Action[] = [];

      // If captureRef was not used, apply transforms
      if (exportedUri === sourceUri) {
        if (editState.rotation !== 0) actions.push({ rotate: editState.rotation });
        if (editState.flipX) actions.push({ flip: ImageManipulator.FlipType.Horizontal });
        if (editState.flipY) actions.push({ flip: ImageManipulator.FlipType.Vertical });
        if (editState.crop) actions.push({ crop: editState.crop });
      }

      // Resolution downscale (aspect-ratio safe)
      if (exportResolution !== 'original') {
        const target = computeTargetResolution(exportResolution);
        if (target.width && target.height && (target.width !== imageDimensions.width || target.height !== imageDimensions.height)) {
          actions.push({ resize: { width: target.width, height: target.height } });
        }
      }

      const format = exportFormat === 'jpeg'
        ? ImageManipulator.SaveFormat.JPEG
        : ImageManipulator.SaveFormat.PNG;

      const result = await ImageManipulator.manipulateAsync(exportedUri, actions, {
        compress: exportFormat === 'jpeg' ? 0.92 : 1,
        format,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: exportFormat === 'png' ? 'image/png' : 'image/jpeg',
          dialogTitle: `Simpan Foto (${result.width}×${result.height} px)`,
        });
        Alert.alert(
          '✅ Berhasil Diproses',
          `Foto berhasil diekspor!\n• Resolusi: ${result.width} × ${result.height} px\n• Format: ${exportFormat.toUpperCase()}`
        );
      } else {
        Alert.alert(
          '✅ Berhasil',
          `Foto berhasil diekspor!\n• Resolusi: ${result.width} × ${result.height} px\n• Lokasi: ${result.uri}`
        );
      }
    } catch (e) {
      Alert.alert('Gagal Ekspor', (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // ─── Save Project ─────────────────────────────────────

  const handleSaveProject = async () => {
    if (!sourceUri) {
      Alert.alert('Tidak Ada Foto', 'Import foto terlebih dahulu.');
      return;
    }
    const name = projectName.trim() || fileName || 'Proyek Foto';
    setSaving(true);
    try {
      const project: Project = {
        schemaVersion: SCHEMA_VERSION,
        projectId,
        name,
        mediaType: 'photo',
        source: {
          localUri: sourceUri,
          fileName,
          mimeType: 'image/jpeg',
          width: 0,
          height: 0,
          fileSize: 0,
        },
        editState,
        exportSettings: {
          ...DEFAULT_EXPORT_SETTINGS,
          resolution: exportResolution,
          photoFormat: exportFormat,
        },
        createdAt: initialProject?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveProject(project);
      Alert.alert('✅ Tersimpan', `Proyek "${name}" berhasil disimpan.`);
    } catch (e) {
      Alert.alert('Gagal Simpan', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Preview image style ──────────────────────────────

  const getPreviewStyle = () => {
    const transforms: ({ rotate: string } | { scaleX: number } | { scaleY: number })[] = [];
    if (editState.rotation) transforms.push({ rotate: `${editState.rotation}deg` });
    if (editState.flipX) transforms.push({ scaleX: -1 });
    if (editState.flipY) transforms.push({ scaleY: -1 });
    return transforms;
  };

  const getFilterStyle = (): any => {
    if (Platform.OS !== 'web') {
      return {};
    }
    const filters: any[] = [];
    if (editState.adjustments.brightness !== 0) {
      filters.push({ brightness: Math.max(0, 1 + editState.adjustments.brightness * 0.7) });
    }
    if (editState.adjustments.contrast !== 0) {
      filters.push({ contrast: Math.max(0, 1 + editState.adjustments.contrast * 0.7) });
    }
    if (editState.adjustments.saturation !== 0) {
      filters.push({ saturate: Math.max(0, 1 + editState.adjustments.saturation * 0.7) });
    }
    switch (editState.filter) {
      case 'grayscale':
        filters.push({ grayscale: 1 });
        break;
      case 'sepia':
        filters.push({ sepia: 0.85 });
        break;
      case 'warm':
        filters.push({ hueRotate: '-20deg' }, { saturate: 1.3 });
        break;
      case 'cool':
        filters.push({ hueRotate: '25deg' }, { saturate: 1.2 });
        break;
      case 'vintage':
        filters.push({ sepia: 0.4 }, { contrast: 0.95 }, { brightness: 1.05 });
        break;
      case 'dramatic':
        filters.push({ contrast: 1.4 }, { saturate: 1.3 }, { brightness: 0.95 });
        break;
    }
    return filters.length > 0 ? { filter: filters } : {};
  };

  const renderOverlayLayers = () => {
    const overlays: React.ReactNode[] = [];

    // Filter preset tint
    if (editState.filter === 'sepia') {
      overlays.push(
        <View
          key="sepia"
          pointerEvents="none"
          style={[styles.absoluteFillOverlay, { backgroundColor: '#704214', opacity: 0.38 }]}
        />
      );
    } else if (editState.filter === 'warm') {
      overlays.push(
        <View
          key="warm"
          pointerEvents="none"
          style={[styles.absoluteFillOverlay, { backgroundColor: '#ff8800', opacity: 0.22 }]}
        />
      );
    } else if (editState.filter === 'cool') {
      overlays.push(
        <View
          key="cool"
          pointerEvents="none"
          style={[styles.absoluteFillOverlay, { backgroundColor: '#0077ff', opacity: 0.22 }]}
        />
      );
    } else if (editState.filter === 'vintage') {
      overlays.push(
        <View
          key="vintage"
          pointerEvents="none"
          style={[styles.absoluteFillOverlay, { backgroundColor: '#8a6240', opacity: 0.3 }]}
        />
      );
    } else if (editState.filter === 'dramatic') {
      overlays.push(
        <View
          key="dramatic"
          pointerEvents="none"
          style={[styles.absoluteFillOverlay, { backgroundColor: '#000000', opacity: 0.3 }]}
        />
      );
    } else if (editState.filter === 'grayscale') {
      overlays.push(
        <View
          key="grayscale"
          pointerEvents="none"
          style={[styles.absoluteFillOverlay, { backgroundColor: '#222222', opacity: 0.28 }]}
        />
      );
    }

    // Brightness overlay (proportional percentage)
    const b = editState.adjustments.brightness;
    if (b > 0) {
      overlays.push(
        <View
          key="bright-plus"
          pointerEvents="none"
          style={[
            styles.absoluteFillOverlay,
            { backgroundColor: '#ffffff', opacity: Math.min(0.5, (b / 100) * 0.45) },
          ]}
        />
      );
    } else if (b < 0) {
      overlays.push(
        <View
          key="bright-minus"
          pointerEvents="none"
          style={[
            styles.absoluteFillOverlay,
            { backgroundColor: '#000000', opacity: Math.min(0.65, (Math.abs(b) / 100) * 0.6) },
          ]}
        />
      );
    }

    // Contrast overlay (proportional percentage)
    const c = editState.adjustments.contrast;
    if (c > 0) {
      overlays.push(
        <View
          key="contrast-plus"
          pointerEvents="none"
          style={[
            styles.absoluteFillOverlay,
            { backgroundColor: '#000000', opacity: Math.min(0.35, (c / 100) * 0.35) },
          ]}
        />
      );
    } else if (c < 0) {
      overlays.push(
        <View
          key="contrast-minus"
          pointerEvents="none"
          style={[
            styles.absoluteFillOverlay,
            { backgroundColor: '#808080', opacity: Math.min(0.35, (Math.abs(c) / 100) * 0.35) },
          ]}
        />
      );
    }

    // Saturation overlay
    const s = editState.adjustments.saturation;
    if (s < 0) {
      overlays.push(
        <View
          key="sat-minus"
          pointerEvents="none"
          style={[
            styles.absoluteFillOverlay,
            { backgroundColor: '#444444', opacity: Math.min(0.7, (Math.abs(s) / 100) * 0.65) },
          ]}
        />
      );
    } else if (s > 0) {
      overlays.push(
        <View
          key="sat-plus"
          pointerEvents="none"
          style={[
            styles.absoluteFillOverlay,
            { backgroundColor: '#ff9900', opacity: Math.min(0.25, (s / 100) * 0.2) },
          ]}
        />
      );
    }

    // HSL Mixer channel overlays for instant visual feedback
    if (editState.hslMixer) {
      Object.entries(editState.hslMixer).forEach(([channelId, delta]) => {
        if (delta.saturation !== 0 || delta.hue !== 0 || delta.luminance !== 0) {
          const ch = COLOR_CHANNELS.find((chItem) => chItem.id === channelId);
          if (ch) {
            const intensity = Math.min(
              0.3,
              (Math.abs(delta.saturation) / 100) * 0.2 +
              (Math.abs(delta.hue) / 100) * 0.12 +
              (Math.abs(delta.luminance) / 100) * 0.1
            );
            if (intensity > 0.01) {
              overlays.push(
                <View
                  key={`hsl-${channelId}`}
                  pointerEvents="none"
                  style={[
                    styles.absoluteFillOverlay,
                    {
                      backgroundColor: ch.color,
                      opacity: intensity,
                    },
                  ]}
                />
              );
            }
          }
        }
      });
    }

    return overlays;
  };

  // ─── Render ───────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.topBtn}>
          <Text style={styles.topBtnText}>← Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          {fileName || 'Editor Foto'}
        </Text>
        <View style={styles.topActions}>
          <TouchableOpacity onPress={handleUndo} disabled={!canUndo} style={styles.topBtn}>
            <Text style={[styles.topBtnText, !canUndo && styles.disabled]}>↩</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRedo} disabled={!canRedo} style={styles.topBtn}>
            <Text style={[styles.topBtnText, !canRedo && styles.disabled]}>↪</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Preview Area */}
      <View style={styles.previewArea}>
        {sourceUri ? (
          <View style={styles.imageContainer} ref={imageContainerRef} collapsable={false}>
            <Image
              source={{ uri: sourceUri }}
              style={[
                styles.previewImage,
                { transform: getPreviewStyle() },
                !isComparing && getFilterStyle(),
              ]}
              contentFit="contain"
            />
            {/* Visual Tint & Lighting Overlays */}
            {!isComparing && renderOverlayLayers()}
            {/* Active filter badge / Before badge */}
            {isComparing ? (
              <View style={[styles.filterBadge, styles.beforeBadge]}>
                <Text style={styles.beforeBadgeText}>👁️ ASLI (BEFORE)</Text>
              </View>
            ) : (
              editState.filter !== 'none' && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>
                    ✨ {FILTER_LIST.find((f) => f.id === editState.filter)?.label || editState.filter}
                  </Text>
                </View>
              )
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.importPrompt} onPress={handleImportPhoto}>
            <Text style={styles.importIcon}>🖼️</Text>
            <Text style={styles.importText}>Ketuk untuk import foto</Text>
            <Text style={styles.importSub}>JPEG, PNG, WebP</Text>
          </TouchableOpacity>
        )}

        {/* Quick actions overlay */}
        {sourceUri && (
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickBtn} onPress={handleImportPhoto}>
              <Text style={styles.quickBtnText}>📁 Ganti</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={handleRotate}>
              <Text style={styles.quickBtnText}>↻ Putar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={handleFlipH}>
              <Text style={styles.quickBtnText}>↔ Flip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickBtn, isComparing && styles.quickBtnActive]}
              onPressIn={() => setIsComparing(true)}
              onPressOut={() => setIsComparing(false)}
            >
              <Text style={[styles.quickBtnText, isComparing && { color: Colors.primary, fontWeight: '700' }]}>
                👁️ {isComparing ? 'Asli' : 'Bandingkan'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={handleReset}>
              <Text style={[styles.quickBtnText, { color: Colors.error }]}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tool Tabs */}
      <View style={styles.tabBar}>
        {(['adjust', 'filter', 'text', 'export'] as ToolTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'adjust' ? '🎚️' : tab === 'filter' ? '✨' : tab === 'text' ? '🔤' : '📤'}
              {' '}{tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tool Panel */}
      <ScrollView style={styles.toolPanel} showsVerticalScrollIndicator={false}>
        {/* Adjust Tab */}
        {/* Adjust Tab (Ala Lightroom) */}
        {activeTab === 'adjust' && (
          <View style={styles.panelSection}>
            <LightroomSliderRN
              label="Kecerahan (Brightness)"
              icon="☀️"
              value={editState.adjustments.brightness}
              onChange={(val) => handleAdjustmentChange('brightness', val)}
              onCommit={(val) => handleAdjustmentCommit('brightness', val)}
              accentColor="#f1c40f"
            />
            <LightroomSliderRN
              label="Kontras (Contrast)"
              icon="◑"
              value={editState.adjustments.contrast}
              onChange={(val) => handleAdjustmentChange('contrast', val)}
              onCommit={(val) => handleAdjustmentCommit('contrast', val)}
              accentColor="#e67e22"
            />
            <LightroomSliderRN
              label="Saturasi (Saturation)"
              icon="🎨"
              value={editState.adjustments.saturation}
              onChange={(val) => handleAdjustmentChange('saturation', val)}
              onCommit={(val) => handleAdjustmentCommit('saturation', val)}
              accentColor="#9b59b6"
            />

            {/* HSL Color Mixer Section */}
            <View style={styles.hslSection}>
              <View style={styles.hslHeader}>
                <Text style={styles.panelSubheading}>🎨 HSL Color Mixer (8 Warna)</Text>
                <TouchableOpacity
                  onPress={() =>
                    pushState({
                      ...editState,
                      hslMixer: { ...DEFAULT_HSL_MIXER },
                    })
                  }
                  style={styles.hslResetBtn}
                >
                  <Text style={styles.hslResetText}>Reset HSL</Text>
                </TouchableOpacity>
              </View>

              {/* 8 Color Selection Channels */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hslColorRow}
              >
                {COLOR_CHANNELS.map((ch) => {
                  const isSelected = activeHslChannel === ch.id;
                  return (
                    <TouchableOpacity
                      key={ch.id}
                      style={[
                        styles.colorDotWrapper,
                        isSelected && styles.colorDotWrapperActive,
                      ]}
                      onPress={() => setActiveHslChannel(ch.id)}
                    >
                      <View style={[styles.colorDot, { backgroundColor: ch.color }]} />
                      <Text
                        style={[
                          styles.colorDotLabel,
                          isSelected && styles.colorDotLabelActive,
                        ]}
                      >
                        {ch.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Sliders for the active HSL channel */}
              {(() => {
                const channelMeta =
                  COLOR_CHANNELS.find((c) => c.id === activeHslChannel) ||
                  COLOR_CHANNELS[0];
                const channelState =
                  (editState.hslMixer && editState.hslMixer[activeHslChannel]) ||
                  DEFAULT_HSL_MIXER[activeHslChannel];
                return (
                  <View style={styles.hslSlidersBox}>
                    <Text style={styles.hslActiveTitle}>
                      Kanal Aktif: <Text style={{ color: channelMeta.color }}>{channelMeta.label}</Text>
                    </Text>
                    <LightroomSliderRN
                      label="Hue (Corak)"
                      value={channelState.hue}
                      onChange={(val) => updateHslChannel(activeHslChannel, 'hue', val, false)}
                      onCommit={(val) => updateHslChannel(activeHslChannel, 'hue', val, true)}
                      accentColor={channelMeta.color}
                    />
                    <LightroomSliderRN
                      label="Saturation (Kepekatan)"
                      value={channelState.saturation}
                      onChange={(val) => updateHslChannel(activeHslChannel, 'saturation', val, false)}
                      onCommit={(val) => updateHslChannel(activeHslChannel, 'saturation', val, true)}
                      accentColor={channelMeta.color}
                    />
                    <LightroomSliderRN
                      label="Luminance (Pencahayaan)"
                      value={channelState.luminance}
                      onChange={(val) => updateHslChannel(activeHslChannel, 'luminance', val, false)}
                      onCommit={(val) => updateHslChannel(activeHslChannel, 'luminance', val, true)}
                      accentColor={channelMeta.color}
                    />
                  </View>
                );
              })()}
            </View>

            {/* Crop Aspect Ratio Section (P0 MVP) */}
            <View style={styles.cropSection}>
              <View style={styles.cropHeader}>
                <Text style={styles.panelSubheading}>✂️ Crop Rasio Aspek (P0)</Text>
                {editState.crop && (
                  <TouchableOpacity
                    onPress={() => handleSetCropRatio('original')}
                    style={styles.cropResetBtn}
                  >
                    <Text style={styles.cropResetText}>Batal Crop</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cropRow}>
                {[
                  { id: 'original', label: 'Bebas', desc: 'Asli' },
                  { id: '1:1', label: '1:1', desc: 'Square' },
                  { id: '4:5', label: '4:5', desc: 'Portrait' },
                  { id: '16:9', label: '16:9', desc: 'Landscape' },
                  { id: '9:16', label: '9:16', desc: 'Story' },
                ].map((r) => {
                  const isSelected = (!editState.crop && r.id === 'original') || (activeCropRatio === r.id && !!editState.crop);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.cropChip, isSelected && styles.cropChipActive]}
                      onPress={() => handleSetCropRatio(r.id as any)}
                    >
                      <Text style={[styles.cropChipLabel, isSelected && styles.cropChipLabelActive]}>
                        {r.label}
                      </Text>
                      <Text style={[styles.cropChipDesc, isSelected && styles.cropChipDescActive]}>
                        {r.desc}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Flip controls */}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>↔ Flip Horizontal</Text>
              <Switch
                value={editState.flipX}
                onValueChange={handleFlipH}
                trackColor={{ true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>↕ Flip Vertikal</Text>
              <Switch
                value={editState.flipY}
                onValueChange={handleFlipV}
                trackColor={{ true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>
          </View>
        )}

        {/* Filter Tab */}
        {activeTab === 'filter' && (
          <View style={styles.filterGrid}>
            {/* AI Filter Copier - Sesuai Spesifikasi Teknis v3.0 Bagian 1 & 11 (Non-MVP R&D) */}
            <View style={styles.specNoticeCard}>
              <View style={styles.specNoticeHeader}>
                <Text style={styles.specNoticeTitle}>🔬 Riset AI Filter Copier</Text>
                <View style={styles.specNoticeBadge}>
                  <Text style={styles.specNoticeBadgeText}>R&D Fase P2</Text>
                </View>
              </View>
              <Text style={styles.specNoticeBody}>
                Spesifikasi v3.0: AI bukan bagian MVP untuk menjamin kestabilan pemrosesan media lokal. Fitur ini dalam tahap riset laboratorium.
              </Text>
              <TouchableOpacity
                style={styles.specNoticeBtn}
                onPress={handleAIFilterCopier}
                disabled={isAnalyzingAI}
                activeOpacity={0.8}
              >
                {isAnalyzingAI ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.specNoticeBtnText}>✨ Coba Salin Mood Tone (Prototipe Lab)</Text>
                )}
              </TouchableOpacity>
            </View>

            {FILTER_LIST.map((f) => {
              const isSelected = editState.filter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[
                    styles.filterChip,
                    isSelected && styles.filterChipActive,
                  ]}
                  onPress={() => pushState({ ...editState, filter: f.id })}
                >
                  <Text style={styles.filterEmoji}>{f.preview}</Text>
                  <Text style={[
                    styles.filterLabel,
                    isSelected && styles.filterLabelActive,
                  ]}>
                    {f.label} {isSelected ? '✓' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.filterNote}>
              ✨ Filter dan pencahayaan langsung diterapkan secara dinamis pada pratinjau foto.
            </Text>
          </View>
        )}

        {/* Text Tab */}
        {activeTab === 'text' && (
          <View style={styles.panelSection}>
            <Text style={styles.panelInfo}>
              💡 Text overlay tersedia pada versi berikutnya.{'\n'}
              Fitur ini memerlukan react-native-canvas atau Skia.
            </Text>
          </View>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <View style={styles.panelSection}>
            <Text style={styles.panelSubheading}>Nama Proyek</Text>
            <TextInput
              style={styles.textInput}
              value={projectName}
              onChangeText={setProjectName}
              placeholder={fileName || 'Nama proyek...'}
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.panelSubheading}>Format</Text>
            <View style={styles.optionRow}>
              {(['jpeg', 'png'] as const).map((fmt) => (
                <TouchableOpacity
                  key={fmt}
                  style={[styles.optionBtn, exportFormat === fmt && styles.optionBtnActive]}
                  onPress={() => setExportFormat(fmt)}
                >
                  <Text style={[styles.optionBtnText, exportFormat === fmt && styles.optionBtnTextActive]}>
                    {fmt.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.panelSubheading}>Resolusi Ekspor</Text>
            {imageDimensions.width > 0 && (
              <Text style={styles.metaInfoText}>
                Dimensi Asli: {imageDimensions.width} × {imageDimensions.height} px
              </Text>
            )}
            {RESOLUTION_OPTIONS.map((r) => {
              const isSelected = exportResolution === r.preset;
              const target = computeTargetResolution(r.preset);
              return (
                <View key={r.preset}>
                  <TouchableOpacity
                    style={[
                      styles.resolutionBtn,
                      isSelected && styles.resolutionBtnActive,
                    ]}
                    onPress={() => setExportResolution(r.preset)}
                  >
                    <View style={styles.resolutionLeft}>
                      <Text style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                        {isSelected ? '●' : '○'}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.resolutionBtnLabel, isSelected && styles.resolutionBtnLabelActive]}>
                            {r.label}
                          </Text>
                          {r.tag && (
                            <View style={[styles.tagBadge, r.tag === 'Berat' ? styles.tagBadgeWarning : styles.tagBadgeInfo]}>
                              <Text style={styles.tagBadgeText}>{r.tag}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.resolutionBtnNote}>
                          {r.preset === 'original'
                            ? `Resolusi penuh (${imageDimensions.width ? `${imageDimensions.width}×${imageDimensions.height} px` : 'Asli'})`
                            : `Target: ${target.text} • ${r.note}`}
                        </Text>
                      </View>
                    </View>
                    {isSelected && (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>Dipilih</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {isSelected && target.warning !== '' && (
                    <View style={styles.warningBox}>
                      <Text style={styles.warningBoxText}>⚠️ {target.warning}</Text>
                    </View>
                  )}
                </View>
              );
            })}

            <TouchableOpacity
              style={[styles.exportBtn, (!sourceUri || exporting) && styles.exportBtnDisabled]}
              onPress={handleExport}
              disabled={!sourceUri || exporting}
            >
              {exporting ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.exportBtnText}>💾 Simpan ke Galeri</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveProjectBtn, saving && styles.exportBtnDisabled]}
              onPress={handleSaveProject}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <Text style={styles.saveProjectBtnText}>📌 Simpan Proyek</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  topBtn: { padding: Spacing.sm, minWidth: 44 },
  topBtnText: { fontSize: Fonts.sizes.base, color: Colors.primary },
  disabled: { color: Colors.textDisabled },
  topTitle: { flex: 1, fontSize: Fonts.sizes.base, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  topActions: { flexDirection: 'row' },

  // Preview
  previewArea: {
    height: 280,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  previewImage: { width: '100%', height: '100%' },
  imageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  absoluteFillOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  filterBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  filterBadgeText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  importPrompt: { alignItems: 'center', padding: Spacing.xl },
  importIcon: { fontSize: 48, marginBottom: Spacing.md },
  importText: { fontSize: Fonts.sizes.base, color: Colors.textSecondary, marginBottom: 4 },
  importSub: { fontSize: Fonts.sizes.sm, color: Colors.textMuted },
  quickActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: Colors.bgOverlay,
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
  },
  quickBtn: { padding: Spacing.xs },
  quickBtnText: { fontSize: Fonts.sizes.sm, color: Colors.textPrimary },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontWeight: '600' },

  // Tool Panel
  toolPanel: { flex: 1, backgroundColor: Colors.bg },
  panelSection: { padding: Spacing.base, gap: Spacing.md },

  // Slider
  sliderRow: { marginBottom: Spacing.md },
  sliderLabel: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, marginBottom: 4 },
  sliderValue: { fontSize: Fonts.sizes.sm, color: Colors.primary, marginBottom: 6 },
  sliderTrack: { flexDirection: 'row', gap: Spacing.xs },
  sliderStep: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm,
    backgroundColor: Colors.bgCard, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  sliderStepActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sliderStepText: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary },

  // Switch
  switchRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  switchLabel: { fontSize: Fonts.sizes.base, color: Colors.textPrimary },

  // Filters
  filterGrid: { padding: Spacing.base, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  filterChip: {
    width: '30%', alignItems: 'center', padding: Spacing.sm,
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow },
  filterEmoji: { fontSize: 24, marginBottom: 4 },
  filterLabel: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary },
  filterLabelActive: { color: Colors.primary, fontWeight: '600' },
  filterNote: { width: '100%', fontSize: Fonts.sizes.xs, color: Colors.textMuted, marginTop: Spacing.sm, lineHeight: 18 },

  panelInfo: {
    fontSize: Fonts.sizes.sm, color: Colors.textSecondary,
    backgroundColor: Colors.bgCard, padding: Spacing.md,
    borderRadius: Radius.md, lineHeight: 22,
  },
  panelSubheading: { fontSize: Fonts.sizes.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.sm },

  // Export
  textInput: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md,
    color: Colors.textPrimary, fontSize: Fonts.sizes.base,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
  },
  optionRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  optionBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.bgCard, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  optionBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optionBtnText: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary },
  optionBtnTextActive: { color: Colors.white, fontWeight: '600' },
  metaInfoText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  resolutionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  radioCircle: {
    fontSize: 18,
    color: Colors.textMuted,
    marginRight: 4,
  },
  radioCircleActive: {
    color: Colors.primary,
  },
  resolutionBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  resolutionBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(108, 92, 231, 0.12)',
  },
  resolutionBtnLabel: { fontSize: Fonts.sizes.base, color: Colors.textPrimary, fontWeight: '500' },
  resolutionBtnLabelActive: { color: Colors.primary, fontWeight: '700' },
  resolutionBtnNote: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary },
  activePill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  activePillText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.white,
    fontWeight: '600',
  },
  exportBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    padding: Spacing.base, alignItems: 'center', marginTop: Spacing.md,
  },
  exportBtnDisabled: { opacity: 0.5 },
  exportBtnText: { color: Colors.white, fontWeight: '700', fontSize: Fonts.sizes.base },
  saveProjectBtn: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    padding: Spacing.base, alignItems: 'center', marginTop: Spacing.sm,
    borderWidth: 1, borderColor: Colors.primary,
  },
  saveProjectBtnText: { color: Colors.primary, fontWeight: '600', fontSize: Fonts.sizes.base },

  // Before/After & HSL & AI Styles
  quickBtnActive: {
    backgroundColor: 'rgba(108, 92, 231, 0.2)',
    borderRadius: Radius.sm,
  },
  beforeBadge: {
    backgroundColor: 'rgba(231, 76, 60, 0.85)',
    borderColor: '#e74c3c',
  },
  beforeBadgeText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.white,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hslSection: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  hslHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  hslResetBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  hslResetText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  hslColorRow: {
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  colorDotWrapper: {
    alignItems: 'center',
    padding: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 52,
  },
  colorDotWrapperActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(108, 92, 231, 0.15)',
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  colorDotLabel: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  colorDotLabelActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  hslSlidersBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  hslActiveTitle: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    fontWeight: '600',
  },
  // Spec Notice Card (Non-MVP R&D)
  specNoticeCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: Spacing.md,
  },
  specNoticeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  specNoticeTitle: {
    fontSize: Fonts.sizes.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  specNoticeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(241, 196, 15, 0.15)',
    borderWidth: 1,
    borderColor: '#f1c40f',
  },
  specNoticeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#f1c40f',
  },
  specNoticeBody: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginBottom: Spacing.md,
  },
  specNoticeBtn: {
    backgroundColor: 'rgba(108, 92, 231, 0.25)',
    paddingVertical: 10,
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  specNoticeBtnText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textPrimary,
    fontWeight: '700',
  },

  // Crop Controls (P0 MVP)
  cropSection: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  cropHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cropResetBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(231, 76, 60, 0.15)',
    borderWidth: 1,
    borderColor: '#e74c3c',
  },
  cropResetText: {
    fontSize: Fonts.sizes.xs,
    color: '#e74c3c',
    fontWeight: '600',
  },
  cropRow: {
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  cropChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    minWidth: 70,
  },
  cropChipActive: {
    backgroundColor: 'rgba(108, 92, 231, 0.2)',
    borderColor: Colors.primary,
  },
  cropChipLabel: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  cropChipLabelActive: {
    color: Colors.primary,
  },
  cropChipDesc: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  cropChipDescActive: {
    color: Colors.textSecondary,
  },

  // Adaptive Resolution Badges & Warnings (Section 5 Spec)
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.sm,
  },
  tagBadgeInfo: {
    backgroundColor: 'rgba(52, 152, 219, 0.2)',
  },
  tagBadgeWarning: {
    backgroundColor: 'rgba(230, 126, 34, 0.25)',
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  warningBox: {
    backgroundColor: 'rgba(230, 126, 34, 0.15)',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    marginTop: 4,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#e67e22',
  },
  warningBoxText: {
    fontSize: Fonts.sizes.xs,
    color: '#f39c12',
    lineHeight: 16,
  },
});
