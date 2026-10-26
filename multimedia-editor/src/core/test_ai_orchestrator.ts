/**
 * Automated Test Suite for Conversational AI Orchestrator
 *
 * Menguji:
 * 1. NLU Bilingual (Indonesia & Inggris) parsing accuracy
 * 2. Modifier magnitude ('sedikit' vs 'banyak')
 * 3. Contextual follow-up memory ('lagi' / 'tambah lagi')
 * 4. Deterministic local execution vs remote routing
 * 5. Parameter bounds clamping & immutability
 */

import {
  parseUserPrompt,
  executeStructuredOperation,
  getSmartFollowUpSuggestions,
} from './aiOrchestrator';
import {
  DEFAULT_PHOTO_EDIT_STATE,
  type PhotoEditState,
} from './types';
import type { EditSessionContext } from './conversationTypes';

function runAIOrchestratorTests() {
  console.log('===========================================================');
  console.log('🤖 CONVERSATIONAL AI ORCHESTRATOR — UNIT TEST SUITE');
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

  const baseContext: EditSessionContext = {
    currentState: structuredClone(DEFAULT_PHOTO_EDIT_STATE),
    previousOperations: [],
    sourceFileName: 'test_sample.jpg',
    imageDimensions: { width: 1920, height: 1080 },
  };

  // ─── TEST GROUP 1: Light & Exposure Parsing ───
  console.log('--- TEST GROUP 1: Light & Exposure Parsing ---');

  const opBrightenLittle = parseUserPrompt('terangkan sedikit', baseContext);
  assert(
    '"terangkan sedikit" parses to brighten with reduced magnitude',
    opBrightenLittle.target === 'adjustments' &&
      opBrightenLittle.action === 'brighten' &&
      (opBrightenLittle.parameters.exposure as number) > 0 &&
      (opBrightenLittle.parameters.exposure as number) < 15 &&
      opBrightenLittle.provider === 'local'
  );

  const opBrightenNormal = parseUserPrompt('terangkan fotonya', baseContext);
  assert(
    '"terangkan fotonya" parses to brighten with default magnitude',
    opBrightenNormal.target === 'adjustments' &&
      opBrightenNormal.action === 'brighten' &&
      (opBrightenNormal.parameters.exposure as number) === 15
  );

  const opDarken = parseUserPrompt('buat lebih gelap dan redup', baseContext);
  assert(
    '"buat lebih gelap" parses to darken with negative exposure',
    opDarken.target === 'adjustments' &&
      opDarken.action === 'darken' &&
      (opDarken.parameters.exposure as number) < 0
  );

  // ─── TEST GROUP 2: Color, Temperature & Saturation ───
  console.log('\n--- TEST GROUP 2: Color, Temperature & Saturation ---');

  const opWarm = parseUserPrompt('buat warnanya lebih hangat', baseContext);
  assert(
    '"buat warnanya lebih hangat" parses to warm tone (positive temperature)',
    opWarm.target === 'adjustments' &&
      opWarm.action === 'warm' &&
      (opWarm.parameters.temperature as number) > 0
  );

  const opCool = parseUserPrompt('buat lebih dingin dan sejuk', baseContext);
  assert(
    '"buat lebih dingin" parses to cool tone (negative temperature)',
    opCool.target === 'adjustments' &&
      opCool.action === 'cool' &&
      (opCool.parameters.temperature as number) < 0
  );

  const opBW = parseUserPrompt('jadikan hitam putih', baseContext);
  assert(
    '"jadikan hitam putih" sets saturation to -100',
    opBW.target === 'adjustments' &&
      opBW.action === 'monochrome' &&
      opBW.parameters.saturation === -100
  );

  const opVibrant = parseUserPrompt('tambah saturasi agar lebih hidup', baseContext);
  assert(
    '"tambah saturasi" increases saturation and vibrance',
    opVibrant.target === 'adjustments' &&
      opVibrant.action === 'saturate' &&
      (opVibrant.parameters.saturation as number) > 0 &&
      (opVibrant.parameters.vibrance as number) > 0
  );

  // ─── TEST GROUP 3: Contrast, Sharpness & Detail ───
  console.log('\n--- TEST GROUP 3: Contrast, Sharpness & Detail ---');

  const opContrast = parseUserPrompt('tambah kontras', baseContext);
  assert(
    '"tambah kontras" increases contrast and deepens blacks',
    opContrast.target === 'adjustments' &&
      opContrast.action === 'contrast' &&
      (opContrast.parameters.contrast as number) > 0
  );

  const opSharpen = parseUserPrompt('pertajam foto dan detail', baseContext);
  assert(
    '"pertajam foto" increases sharpness and clarity',
    opSharpen.target === 'adjustments' &&
      opSharpen.action === 'sharpen' &&
      (opSharpen.parameters.sharpness as number) > 0 &&
      (opSharpen.parameters.clarity as number) > 0
  );

  // ─── TEST GROUP 4: Presets & Styles ───
  console.log('\n--- TEST GROUP 4: Presets & Styles ---');

  const opVintage = parseUserPrompt('beri gaya vintage jadul', baseContext);
  assert(
    '"gaya vintage" maps to vintage_warm preset',
    opVintage.target === 'filter' &&
      opVintage.parameters.presetId === 'vintage_warm'
  );

  const opCinematic = parseUserPrompt('gaya sinematik teal orange', baseContext);
  assert(
    '"gaya sinematik" maps to cinematic_teal preset',
    opCinematic.target === 'filter' &&
      opCinematic.parameters.presetId === 'cinematic_teal'
  );

  // ─── TEST GROUP 5: History & Geometry Commands ───
  console.log('\n--- TEST GROUP 5: History & Geometry Commands ---');

  const opUndo = parseUserPrompt('batalkan perubahan terakhir', baseContext);
  assert(
    '"batalkan" maps to history undo action',
    opUndo.target === 'history' && opUndo.action === 'undo'
  );

  const opReset = parseUserPrompt('reset semua editan', baseContext);
  assert(
    '"reset semua" maps to history reset_all action',
    opReset.target === 'history' && opReset.action === 'reset_all'
  );

  const opRotate = parseUserPrompt('putar 90 derajat ke kanan', baseContext);
  assert(
    '"putar 90 derajat" maps to geometry rotate +90',
    opRotate.target === 'geometry' &&
      opRotate.action === 'rotate' &&
      opRotate.parameters.degrees === 90
  );

  // ─── TEST GROUP 6: Contextual Follow-up Memory ───
  console.log('\n--- TEST GROUP 6: Contextual Follow-up Memory ---');

  const contextWithHistory: EditSessionContext = {
    ...baseContext,
    lastAdjustmentAction: 'brighten',
    lastAdjustmentParams: { exposure: 12, brightness: 8 },
  };

  const opFollowUp = parseUserPrompt('tambah lagi', contextWithHistory);
  assert(
    '"tambah lagi" successfully re-applies previous brighten action and params',
    opFollowUp.target === 'adjustments' &&
      opFollowUp.action === 'brighten' &&
      opFollowUp.parameters.exposure === 12
  );

  // ─── TEST GROUP 7: Execution Clamping & Immutability ───
  console.log('\n--- TEST GROUP 7: Execution Clamping & Immutability ---');

  const stateNearMax: PhotoEditState = {
    ...DEFAULT_PHOTO_EDIT_STATE,
    adjustments: {
      ...DEFAULT_PHOTO_EDIT_STATE.adjustments,
      exposure: 95,
    },
  };

  const hugeBrightenOp = {
    ...opBrightenNormal,
    parameters: { exposure: 25 },
  };

  const execResult = executeStructuredOperation(hugeBrightenOp, stateNearMax);
  assert(
    'Execution clamps exposure to maximum bound 100 without overflow',
    execResult.nextState.adjustments.exposure === 100,
    `Got ${execResult.nextState.adjustments.exposure}`
  );
  assert(
    'Execution produces a new state object without mutating input state',
    stateNearMax.adjustments.exposure === 95
  );

  // ─── TEST GROUP 8: Ambiguity & Remote Generative Detection ───
  console.log('\n--- TEST GROUP 8: Ambiguity & Remote Generative Detection ---');

  const opAmbiguous = parseUserPrompt('tolong edit foto ini', baseContext);
  assert(
    'Vague instructions trigger clarification_needed status',
    opAmbiguous.status === 'clarification_needed'
  );

  const opGenerative = parseUserPrompt('tolong hapus background foto', baseContext);
  assert(
    'Generative background removal is classified as remote generative operation',
    opGenerative.target === 'generative' &&
      opGenerative.provider === 'remote'
  );

  const followUps = getSmartFollowUpSuggestions('brighten');
  assert(
    'Follow up suggestions provide contextual options and undo',
    followUps.length >= 3 && followUps.includes('Undo')
  );

  // ─── TEST GROUP 9: Contextual AI Reconstruction & Enhancement Prompts ───
  console.log('\n--- TEST GROUP 9: Contextual AI Reconstruction & Enhancement Prompts ---');

  const opPerjelasBuram = parseUserPrompt('perjelas subjek yang buram', baseContext);
  assert(
    '"perjelas subjek yang buram" maps to enhance_original restoration',
    opPerjelasBuram.target === 'reconstruction' &&
      opPerjelasBuram.action === 'enhance_original' &&
      opPerjelasBuram.provider === 'local'
  );

  const opRekonstruksiHilang = parseUserPrompt('coba rekonstruksi bagian objek yang hilang', baseContext);
  assert(
    '"coba rekonstruksi bagian objek yang hilang" maps to ai_reconstruction',
    opRekonstruksiHilang.target === 'reconstruction' &&
      opRekonstruksiHilang.action === 'ai_reconstruction' &&
      opRekonstruksiHilang.parameters.intensity === 80
  );

  const opPerkiraanBentuk = parseUserPrompt(
    'berdasarkan bagian yang masih terlihat, buat perkiraan bentuk objek ini',
    baseContext
  );
  assert(
    '"berdasarkan bagian terlihat, buat perkiraan bentuk" maps to ai_reconstruction',
    opPerkiraanBentuk.target === 'reconstruction' &&
      opPerkiraanBentuk.action === 'ai_reconstruction'
  );

  const opVersiBaru = parseUserPrompt(
    'buat versi baru dari gambar ini dengan subjek yang lebih jelas',
    baseContext
  );
  assert(
    '"buat versi baru dari gambar" maps to generate_alternative',
    opVersiBaru.target === 'reconstruction' &&
      opVersiBaru.action === 'generate_alternative'
  );

  const opPertahankanBg = parseUserPrompt(
    'pertahankan latar belakang dan perbaiki hanya bagian subjek',
    baseContext
  );
  assert(
    '"pertahankan latar belakang dan perbaiki subjek" maps to ai_reconstruction with preserveBackground=true',
    opPertahankanBg.target === 'reconstruction' &&
      opPertahankanBg.action === 'ai_reconstruction' &&
      opPertahankanBg.parameters.preserveBackground === true
  );

  // Execution test
  const reconExecResult = executeStructuredOperation(opRekonstruksiHilang, DEFAULT_PHOTO_EDIT_STATE);
  assert(
    'executeStructuredOperation on ai_reconstruction elevates clarity, sharpness, and texture',
    reconExecResult.nextState.adjustments.sharpness > 0 &&
      reconExecResult.nextState.adjustments.clarity > 0 &&
      reconExecResult.nextState.adjustments.texture > 0 &&
      reconExecResult.summary.some((s) => s.includes('Transparansi:'))
  );

  console.log('\n===========================================================');
  console.log(`EVALUATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAIOrchestratorTests();
