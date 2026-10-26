# CHANGELOG — MULTIMEDIA EDITOR HYBRID

Format changelog ini mengacu pada prinsip [Keep a Changelog](https://keepachangelog.com/id/1.0.0/) dan [Semantic Versioning](https://semver.org/).

Seluruh entri historis disusun berdasarkan bukti verifikasi source code, metadata sistem berkas, log transkrip IDE, dan hasil pengujian aktual di repositori.

---

## [3.6.0-p2] - 2026-10-23 (Milestone P2: Generative AI Backend & Background Removal)

### Ditambahkan (Added)
- **Backend Mandiri Node.js + TypeScript (`server/`):**
  - Berjalan pada port `3001` via `npx tsx server/index.ts` tanpa dependensi framework besar.
  - Endpoint kesehatan terpisah: `GET /api/ai/health`.
  - Endpoint eksekusi generatif terpisah: `POST /api/ai/generate`.
- **Protokol Keamanan & Guardrails:**
  - Validasi *magic bytes* biner gambar (`PNG`, `JPEG`, `WebP`) untuk mencegah pemalsuan ekstensi atau MIME type.
  - *Sliding-window rate limiter* (10 request/menit per IP) dengan header `X-RateLimit-*`.
  - *Concurrency limiter* maksimal 2 request simultan.
  - Streaming payload cut-off maksimal 10 MB (`413 Payload Too Large`).
  - *Safe Logger* otomatis yang me-redact API key, authorization token, base64 payload, dan buffer biner.
  - Timeout eksekusi 30 detik dengan penanganan pembatalan (*AbortController*).
- **Adapter Provider & Zero-Mock Policy:**
  - Adapter resmi model **briaai/RMBG-1.4** melalui router resmi modern Hugging Face (`https://router.huggingface.co/hf-inference/models/briaai/RMBG-1.4`).
  - Kebijakan Zero-Mock: Jika `AI_PROVIDER_API_KEY` belum diatur di `.env`, backend mengembalikan `HTTP 503 PROVIDER_NOT_CONFIGURED` tanpa pernah membuat gambar palsu.
- **Antarmuka Pengguna & Non-Destructive Versioning:**
  - Sub-tab ke-3 pada panel AI: `[ ✂️ Hapus Background ]`.
  - Status badge ketersediaan backend dan konfigurasi provider.
  - Dialog persetujuan pemrosesan online (*User Consent Card*).
  - Tombol pembatalan proses (*Abort Request*).
  - Tampilan pratinjau transparan dengan tombol komparasi (*Hold to Compare*).
  - Visual Progress Bar terukur dengan persentase dan label tahapan proses.
  - Penyimpanan hasil sebagai entitas versi baru (`${name}_nobg.png`) pada IndexedDB `media_assets` dengan ID unik tanpa menimpa foto sumber asli.
- **Pengujian:**
  - Test Suite 5: `src/core/test_backend_generative.ts` (44 unit test lulus, total kumulatif 123 unit tests terpadu).

### Diubah (Changed)
- `vite.config.ts`: Ditambahkan reverse proxy `/api` yang meneruskan request ke `http://localhost:3001`.
- `package.json`: Ditambahkan skrip `"server": "npx tsx server/index.ts"` dan integrasi Suite 5 ke skrip `"test"`.
- `src/core/aiProviderAdapter.ts`: Menyesuaikan kontrak payload untuk menyertakan base64 image data URL dari kanvas lokal dan callback pelaporan progres bertahap (`onProgress`).

### Keamanan (Security)
- Isolasi ketat `.gitignore` pada `multimedia-editor/` dan root untuk mengabaikan `.env*` dan `server/.env*`.
- Disediakan berkas template `multimedia-editor/.env.example` tanpa secret key.

### Belum Selesai (Pending)
- Pengujian inferensi live menggunakan API token Hugging Face riil (menunggu konfirmasi pengguna).

---

## [3.5.0] - 2026-10-23 (Conversational NLU Copilot & Local Image Quality Diagnostics)

### Ditambahkan (Added)
- **Conversational AI Copilot:**
  - Antarmuka laci mengambang bertema *dark glassmorphism* (`AIChatAssistant.tsx`).
  - Engine pemahaman bahasa alami (*Natural Language Understanding* / NLU) dwibahasa berbasis aturan deterministik (`aiOrchestrator.ts`).
  - Pemahaman modifikator magnitudo ("sedikit" $\times 0.5$, "banyak" $\times 1.8$).
  - Memori percakapan kontekstual untuk instruksi lanjutan ("tambah lagi", "sedikit lagi").
- **Diagnostik Kualitas Citra Objektif:**
  - Deteksi skor ketajaman/blur objektif berbasis Discrete Laplacian Gradient Energy ($G = \sqrt{G_x^2 + G_y^2}$).
  - Estimasi noise area bayangan.
  - Deteksi kliping eksposur (*highlight & shadow clipping*).
  - Kategorisasi resolusi citra (low, medium, high, ultra).
- **Mode Restorasi Citra Multi-Level:**
  - Mode 1 (*Enhance Original*): 100% lokal menggunakan unsharp mask, shadow lift, dan reduksi noise area datar tanpa halusinasi AI.
  - Mode 2 (*AI Reconstruction*): Heuristik penguatan kontur lokal dengan slider intensitas dan kotak transparansi etika.
  - Mode 3 (*Generate Alternative*): Variasi penyesuaian tonal kontekstual.
- **Pengujian:**
  - Test Suite 3: `src/core/test_ai_orchestrator.ts` (26 unit test lulus).
  - Test Suite 4: `src/core/test_ai_reconstruction.ts` (11 unit test lulus).
  - Rekonsiliasi dokumen PRD v3.4 ke **PRD v3.5 AUDITED** (79 unit test terpadu lulus).

### Diubah (Changed)
- Rekonsiliasi klaim performa pada dokumentasi teknis: menghapus klaim "0ms" menjadi "15–85ms render kanvas lokal", dan meluruskan klaim format kompresi lossy JPEG/WebP vs lossless PNG.

---

## [3.0.0] - 2026-10-22 (Mobile UX Hardening & Storage Resilience v2)

### Ditambahkan (Added)
- **Asset Manager Store (IndexedDB v2):**
  - Pemisahan tabel metadata proyek (`projects`) dari aset biner foto mentah (`media_assets`).
  - Penyimpanan foto sumber sebagai `Blob` murni dengan UUID `assetId` persisten untuk mencegah masalah URL blob sementara yang kedaluwarsa saat browser dimuat ulang.
  - Fitur duplikasi proyek atomik dengan penamaan otomatis `(Salinan)`.
  - Banner pemulihan sesi aktif (*Crash Session Recovery*).
  - Mekanisme penautan ulang aset yang hilang (*Relink Missing Asset*).
- **Pengalaman Pengguna Mobile & Ekspor:**
  - Tata letak responsif penuh untuk layar ponsel (<768px).
  - Penanganan rasio aspek kanvas mobile agar tidak terpotong.
  - Integrasi Web Share API (`navigator.share({ files })`) untuk memunculkan sharesheet native Android (Simpan ke Galeri) dengan fallback anchor download di desktop.
- **Pengujian:**
  - Test Suite 2: `src/core/test_core_engine.ts` (31 unit test lulus).

### Diperbaiki (Fixed)
- Memperbaiki bug hilangnya gambar foto saat halaman web di-refresh akibat URL blob yang tidak persisten.
- Memperbaiki kegagalan autosave dengan memasang penenang *debounce* 1200ms.

---

## [2.0.0] - 2026-10-21 (AI Color Grading Studio & CIE L\*a\*b\* Filter Copier)

### Ditambahkan (Added)
- **Model Penyesuaian Foto Standar Pro:**
  - Penambahan kontrol lengkap: Light (exposure, highlights, shadows, whites, blacks), Color (temp, tint, vibrance, 8-channel HSL mixer), Detail (sharpness, clarity, texture, denoise, dehaze), Effects (vignette, grain, fade), dan Tone Curve (RGB).
- **Koleksi 15 Preset Profesional (`presets.ts`):**
  - Dark Blue Cinematic, Teal & Orange, Vintage Film, Korean Clean, Soft Pastel, Moody Green, B&W, Golden Hour, Cyberpunk, Pro Portrait, Matte Film, Warm Editorial, Cool Industrial, Dreamy Glow, Natural Portrait.
- **AI Filter Copier Engine (`aiFilterEngine.ts`):**
  - Ekstraksi karakter warna referensi menggunakan ruang warna perseptual CIE L\*a\*b\* (D65 Standard Observer).
  - Kalkulasi pergeseran warna $\Delta E$.
  - Fitur *Anti-Blackout & Key Light Anchoring* untuk mencegah foto target menjadi gelap gulita saat meniru referensi bernuansa malam/siluet.
  - Fitur proteksi melanin kulit multi-etnik (Fitzpatrick I–VI) dan penguncian `denoise = 0` guna mempertahankan tekstur pori-pori kulit alami.
- **Pengujian:**
  - Test Suite 1: `src/core/test_qc_ai_filter.ts` (11 unit test lulus).

---

## [1.0.0-beta.1] - 2026-10-20 (Baseline Multimedia Editor MVP)

### Ditambahkan (Added)
- Inisialisasi proyek web berbasis React 19, TypeScript, Vite, dan Capacitor Android.
- Manipulasi kanvas 2D dasar (`ImageData`), transformasi geometri (crop, rotasi 90 derajat, flip horizontal/vertikal).
- Kontrol dasar: brightness, contrast, saturation, dan 6 filter warna dasar.
- Immutable HistoryManager (stack undo/redo hingga 50 state).
- Penyimpanan proyek lokal berbasis IndexedDB v1.
- Technical spike modul video ekspor menggunakan `HTMLCanvasElement.captureStream()` dan `MediaRecorder`.
- Konfigurasi Android Capacitor (`capacitor.config.ts`, `AndroidManifest.xml`).
- Unit test baseline: `src/core/video.test.ts` (7 unit test lulus).
- Eksplorasi companion app React Native Expo (`multimedia-editor-rn/`).

---

## Ringkasan Metrik Pengujian Historis

| Versi | Tanggal | Jumlah Test | Status | Keterangan |
|---|---|---|---|---|
| **1.0.0-beta.1** | 2026-10-20 | 7 tests | PASS (100%) | Baseline MVP Video Spike |
| **2.0.0** | 2026-10-21 | 11 tests | PASS (100%) | Suite 1: CIE Lab Color Science |
| **3.0.0** | 2026-10-22 | 42 tests | PASS (100%) | Suite 1 (11) + Suite 2 (31) |
| **3.5.0** | 2026-10-23 | 79 tests | PASS (100%) | Suite 1 (11) + Suite 2 (31) + Suite 3 (26) + Suite 4 (11) |
| **3.6.0-p2** | 2026-10-23 | **110 tests** | **PASS (100%)** | **5 Suites Terpadu (+31 Backend Security Tests)** |
