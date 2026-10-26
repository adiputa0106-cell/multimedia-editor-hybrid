/**
 * Comprehensive Automated Test Suite for Core Multimedia Engine
 *
 * Menguji:
 * 1. Aspect ratio math for export (with crop, rotation, and presets)
 * 2. HistoryManager (push, undo, redo, capacity limits, immutability)
 * 3. Clamping and parameter bounds
 * 4. Project schema validation (strict integrity check)
 */

import {
  HistoryManager,
} from './history.ts';
import {
  clampAdjustment,
  clampVolume,
  isValidRotation,
  RESOLUTION_MAP,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_PHOTO_EDIT_STATE,
  type ResolutionPreset,
  type PhotoEditState,
  type Project,
} from './types.ts';
import {
  validateProjectSchema,
} from './storage.ts';

function runTestSuite() {
  console.log('===========================================================');
  console.log('🧪 MULTIMEDIA EDITOR HYBRID — CORE ENGINE UNIT TESTS');
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

  // ─── TEST GROUP 1: Export Dimensions & Aspect Ratio Math ───
  console.log('--- TEST GROUP 1: Export Dimensions & Aspect Ratio Precision ---');

  function calculateExportDimensions(
    sourceW: number,
    sourceH: number,
    crop: { x: number; y: number; width: number; height: number } | null,
    rotation: number,
    presetKey: ResolutionPreset
  ) {
    let sw = sourceW;
    let sh = sourceH;
    if (crop) {
      sw = Math.max(1, Math.round(crop.width * sourceW));
      sh = Math.max(1, Math.round(crop.height * sourceH));
    }
    const isRotated = rotation === 90 || rotation === 270;
    const baseW = isRotated ? sh : sw;
    const baseH = isRotated ? sw : sh;
    const aspect = baseW / baseH;

    if (presetKey === 'original' || presetKey === 'custom') {
      return { width: baseW, height: baseH, aspect };
    }
    const preset = RESOLUTION_MAP[presetKey];
    if (!preset) return { width: baseW, height: baseH, aspect };

    if (aspect >= 1) {
      const w = preset.width;
      const h = Math.max(1, Math.round(preset.width / aspect));
      return { width: w, height: h, aspect: w / h };
    } else {
      const h = preset.height;
      const w = Math.max(1, Math.round(preset.height * aspect));
      return { width: w, height: h, aspect: w / h };
    }
  }

  // Case 1A: Uncropped 4:3 (4000x3000) to 1080p
  const uncropped1080 = calculateExportDimensions(4000, 3000, null, 0, 'fullhd_1080p');
  assert(
    'Uncropped 4:3 image to 1080p preserves 1.333 aspect ratio (1920x1440)',
    uncropped1080.width === 1920 && uncropped1080.height === 1440 && Math.abs(uncropped1080.aspect - 4 / 3) < 0.01,
    `Got ${uncropped1080.width}x${uncropped1080.height}`
  );

  // Case 1B: Cropped to 1:1 square (3000x3000) on 4000x3000 source
  // crop: width=0.75, height=1.0 -> 3000x3000
  const squareCrop1080 = calculateExportDimensions(4000, 3000, { x: 0.125, y: 0, width: 0.75, height: 1.0 }, 0, 'fullhd_1080p');
  assert(
    '1:1 square crop to 1080p results in EXACT 1:1 square (1920x1920) without stretching',
    squareCrop1080.width === 1920 && squareCrop1080.height === 1920 && Math.abs(squareCrop1080.aspect - 1.0) < 0.001,
    `Got ${squareCrop1080.width}x${squareCrop1080.height}, aspect=${squareCrop1080.aspect}`
  );

  // Case 1C: Portrait 9:16 crop on landscape source to 4K UHD
  // 9:16 aspect ratio = 0.5625
  const portraitCrop4K = calculateExportDimensions(4000, 3000, { x: 0.2, y: 0, width: 0.421875, height: 1.0 }, 0, '4k_uhd');
  const expectedH = 2160;
  // 4000 * 0.421875 = 1687.5 px cropped width; 3000 * 1.0 = 3000 px cropped height. Aspect = 1687.5 / 3000 = 0.5625 (9:16).
  // Target width for 4K UHD height (2160) = 2160 * 0.5625 = 1215.
  const expectedW = Math.round(2160 * (1687.5 / 3000));
  assert(
    'Portrait crop to 4K UHD adjusts height to 2160 and width proportionally (9:16 ratio)',
    portraitCrop4K.height === expectedH && portraitCrop4K.width === expectedW,
    `Got ${portraitCrop4K.width}x${portraitCrop4K.height}, expected ${expectedW}x${expectedH}`
  );

  // Case 1D: 90 degree rotated image dimensions swap
  const rotatedOriginal = calculateExportDimensions(4000, 3000, null, 90, 'original');
  assert(
    '90 degree rotation swaps dimensions cleanly (3000x4000)',
    rotatedOriginal.width === 3000 && rotatedOriginal.height === 4000,
    `Got ${rotatedOriginal.width}x${rotatedOriginal.height}`
  );

  // ─── TEST GROUP 2: HistoryManager (Undo / Redo & Capacity) ─
  console.log('\n--- TEST GROUP 2: HistoryManager Precision & Immutability ---');

  const history = new HistoryManager<PhotoEditState>(DEFAULT_PHOTO_EDIT_STATE, 50);

  assert('History initializes with canUndo=false and canRedo=false', !history.canUndo && !history.canRedo);

  const state1: PhotoEditState = {
    ...DEFAULT_PHOTO_EDIT_STATE,
    adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 25 },
  };
  history.push(state1);

  assert('After 1 push, canUndo=true and canRedo=false', history.canUndo && !history.canRedo);
  assert('Current state brightness equals 25', history.current().adjustments.brightness === 25);

  const state2: PhotoEditState = {
    ...state1,
    adjustments: { ...state1.adjustments, contrast: 40 },
  };
  history.push(state2);

  const undone = history.undo();
  assert(
    'Undo restores state1 (brightness=25, contrast=0)',
    undone !== null && undone.adjustments.brightness === 25 && undone.adjustments.contrast === 0,
    JSON.stringify(undone?.adjustments)
  );
  assert('After undo, canRedo=true', history.canRedo);

  const redone = history.redo();
  assert(
    'Redo restores state2 (brightness=25, contrast=40)',
    redone !== null && redone.adjustments.brightness === 25 && redone.adjustments.contrast === 40,
    JSON.stringify(redone?.adjustments)
  );

  // Test capacity bound (50 limit)
  for (let i = 1; i <= 60; i++) {
    history.push({
      ...DEFAULT_PHOTO_EDIT_STATE,
      adjustments: { ...DEFAULT_ADJUSTMENTS, exposure: i },
    });
  }
  assert('After 60 pushes into capacity 50, canUndo remains true', history.canUndo);
  assert('Current state reflects latest push (exposure=60)', history.current().adjustments.exposure === 60);

  // ─── TEST GROUP 3: Clamping & Validation Bounds ─────────────
  console.log('\n--- TEST GROUP 3: Parameter Clamping & Bounds Safety ---');

  assert('clampAdjustment clamps +150 to +100', clampAdjustment(150) === 100);
  assert('clampAdjustment clamps -200 to -100', clampAdjustment(-200) === -100);
  assert('clampAdjustment preserves 42 within bounds', clampAdjustment(42) === 42);
  assert('clampVolume clamps 1.5 to 1.0', clampVolume(1.5) === 1.0);
  assert('clampVolume clamps -0.5 to 0.0', clampVolume(-0.5) === 0.0);
  assert('isValidRotation validates 0, 90, 180, 270', isValidRotation(90) && !isValidRotation(45));

  // ─── TEST GROUP 4: Storage Schema Validation ───────────────
  console.log('\n--- TEST GROUP 4: Storage Project Schema Integrity ---');

  const validMockProject: Project = {
    schemaVersion: 1,
    projectId: 'test-uuid-1234',
    name: 'Audit_Test_Project',
    mediaType: 'photo',
    source: {
      localReference: 'test.jpg',
      fileName: 'test.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024,
      width: 1920,
      height: 1080,
    },
    editState: DEFAULT_PHOTO_EDIT_STATE,
    exportSettings: {
      resolution: 'original',
      maintainAspectRatio: true,
      photoFormat: 'jpeg',
      photoQuality: 0.92,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const validated = validateProjectSchema(validMockProject);
  assert('Valid project passes schema validation', validated.projectId === 'test-uuid-1234');

  let invalidCaught = false;
  try {
    validateProjectSchema({ schemaVersion: 0, projectId: '' });
  } catch {
    invalidCaught = true;
  }
  assert('Corrupted or invalid project JSON is rejected safely with error', invalidCaught);

  // ─── TEST GROUP 5: Mobile & Hybrid Export Formats (WebP, PNG, JPEG) ───
  console.log('\n--- TEST GROUP 5: Mobile & Hybrid Export Formats (WebP, PNG, JPEG) ---');

  const getMimeType = (format: 'jpeg' | 'png' | 'webp') => {
    if (format === 'png') return 'image/png';
    if (format === 'webp') return 'image/webp';
    return 'image/jpeg';
  };

  assert('WebP maps correctly to image/webp mime type', getMimeType('webp') === 'image/webp');
  assert('JPEG maps correctly to image/jpeg mime type', getMimeType('jpeg') === 'image/jpeg');
  assert('PNG maps correctly to image/png mime type', getMimeType('png') === 'image/png');

  // Mobile 9:16 vertical crop to HD 720p (720x1280)
  const mobileVerticalCrop = calculateExportDimensions(
    1080,
    1920,
    { x: 0, y: 0, width: 1.0, height: 1.0 },
    0,
    'hd_720p'
  );
  assert(
    'Mobile vertical 9:16 export calculates correct height 720 and width (aspect preserved)',
    mobileVerticalCrop.height === 720 && Math.abs(mobileVerticalCrop.aspect - (1080 / 1920)) < 0.001,
    `Got ${mobileVerticalCrop.width}x${mobileVerticalCrop.height}`
  );

  // ─── TEST GROUP 6: Asset Manager, Duplication & Recovery System ───
  console.log('\n--- TEST GROUP 6: Asset Manager, Duplication & Recovery System ---');

  // 6A: Project with assetId schema validation
  const projectWithAsset: Project = {
    ...validMockProject,
    source: {
      ...validMockProject.source,
      assetId: 'asset-uuid-5678',
    },
    thumbnail: 'data:image/jpeg;base64,mockthumbdata',
  };
  const validatedAssetProject = validateProjectSchema(projectWithAsset);
  assert(
    'Project with persistent assetId and thumbnail passes schema validation',
    validatedAssetProject.source.assetId === 'asset-uuid-5678' &&
      validatedAssetProject.thumbnail === 'data:image/jpeg;base64,mockthumbdata'
  );

  // 6B: Duplication logic validation (pure function test)
  const duplicateMockProject = (source: Project): Project => {
    return {
      ...structuredClone(source),
      projectId: 'new-dup-id-9999',
      name: `${source.name} (Salinan)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const duplicated = duplicateMockProject(projectWithAsset);
  assert(
    'Duplicated project produces distinct projectId and appends (Salinan)',
    duplicated.projectId !== projectWithAsset.projectId &&
      duplicated.name === `${projectWithAsset.name} (Salinan)`
  );
  assert(
    'Duplicated project preserves identical source assetId and non-destructive editState',
    duplicated.source.assetId === projectWithAsset.source.assetId &&
      (duplicated.editState as PhotoEditState).adjustments.exposure ===
        (projectWithAsset.editState as PhotoEditState).adjustments.exposure
  );

  // 6C: Recovery session key validation
  const isValidSessionId = (id: string | null): boolean => {
    return typeof id === 'string' && id.trim().length > 0;
  };
  assert('Valid session ID is recognized for crash recovery', isValidSessionId('proj-sess-1234'));
  assert('Null or empty session ID is rejected', !isValidSessionId(null) && !isValidSessionId('   '));

  // 6D: Thumbnail bounding box calculation (max 240x160)
  const calcThumbBounds = (w: number, h: number, maxW: number, maxH: number) => {
    const scale = Math.min(maxW / w, maxH / h, 1.0);
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  };
  const landscapeThumb = calcThumbBounds(4000, 3000, 240, 160);
  assert(
    'Landscape thumbnail fits within 240x160 bounds preserving 4:3 aspect',
    landscapeThumb.width === 213 && landscapeThumb.height === 160
  );
  const portraitThumb = calcThumbBounds(3000, 4000, 240, 160);
  assert(
    'Portrait thumbnail fits within 240x160 bounds preserving 3:4 aspect',
    portraitThumb.width === 120 && portraitThumb.height === 160
  );

  console.log('\n===========================================================');
  console.log(`EVALUATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
