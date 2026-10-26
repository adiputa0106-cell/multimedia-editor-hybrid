# Audit Proyek & Rencana Arsitektur — Photo Editor Profesional & AI Filter Copier

## 1. Ringkasan Eksekutif & Struktur Proyek Saat Ini

Aplikasi ini adalah **Photo Editor & AI Color Grading Studio** berbasis Web & Hybrid Android (Capacitor), dengan pemrosesan citra 100% lokal (*client-side*) pada peramban/device tanpa pengiriman citra ke server cloud.

```
c:\proyek\multimedia-editor\
├── src\
│   ├── core\
│   │   ├── types.ts          # Model data terpusat (PhotoEditState, Adjustments, Profiles, Presets)
│   │   ├── photoEngine.ts    # Rendering canvas 2D, transformasi geometri & manipulasi piksel langsung (ImageData)
│   │   ├── aiFilterEngine.ts # Computer Vision client-side: histogram luminansi, korelasi R/B temp, HSL, ekstraksi palet
│   │   ├── history.ts        # Immutable Undo/Redo manager (stack snapshot berkapasitas 50 state)
│   │   └── storage.ts        # Penyimpanan proyek IndexedDB (hanya metadata + edit state, bukan blob besar)
│   ├── pages\
│   │   ├── Home.tsx / .css   # Halaman beranda & tautan download APK Android
│   │   └── PhotoEditor.tsx / .css # Workspace utama editor foto (header, canvas view, sidebar tools)
│   ├── App.tsx & main.tsx    # Router & entrypoint
│   └── index.css             # Design system (dark theme, glassmorphism, slider tokens)
├── public\
│   └── mediastudio-android.apk # File APK Android siap unduh
├── android\                  # Native Capacitor Android project (SDK 34, AGP 8.13, Gradle 9.2.0)
└── dist\                     # Bundle produksi Vite yang siap ditayangkan
```

---

## 2. Audit Fitur yang Sudah Ada vs Kebutuhan Spesifikasi Baru

| Modul / Fitur | Status Saat Ini | Kebutuhan Spesifikasi Baru | Kesenjangan (Gaps) yang Harus Dibangun |
| :--- | :--- | :--- | :--- |
| **Model State Adjustments** | Hanya `brightness`, `contrast`, `saturation` | **Light**: exposure, brightness, contrast, highlights, shadows, whites, blacks.<br>**Color**: temp, tint, sat, vibrance, HSL mix.<br>**Detail**: sharpness, clarity, texture, denoise, dehaze.<br>**Effects**: vignette, grain, fade.<br>**Grading**: shadows/midtones/highlights color wheels + tone curve. | Perlu ekspansi `ImageAdjustments` dan `PhotoEditState` lengkap dengan nilai default 0 dan pembatas nilai aman. |
| **Mesin Render Piksel (`photoEngine.ts`)** | `applyPixelAdjustmentsAndFilters` memproses brightness, contrast, saturation, dan 6 filter dasar | Menerapkan seluruh parameter Light, Color, Detail, Effects, dan Color Grading langsung ke piksel secara real-time | Algoritma pixel-level untuk: unsharp mask (sharpness), local contrast (clarity), film grain generator, vignette math, fade math (matte black lift), dan 3-way color grading. |
| **Sistem Filter & Preset** | 7 filter statis bawaan (`none`, `grayscale`, `sepia`, `warm`, `cool`, `vintage`, `dramatic`) | **15 Preset Profesional**: Dark Blue Cinematic, Teal & Orange, Vintage Film, Korean Clean, Soft Pastel, Moody Green, B&W, Golden Hour, Cyberpunk, Pro Portrait, Matte Film, Warm Editorial, Cool Industrial, Dreamy Glow, Natural Portrait. | Koleksi preset parameter warna yang dapat disesuaikan intensitasnya (0–100%) dan dapat disimpan sebagai preset kustom. |
| **AI Filter Copier Engine** | Analisis rata-rata luminansi, kontras (std dev), suhu R/B, saturasi, ekstraksi 5 warna palet | Analisis komparatif target vs referensi (histogram quantiles, black/white points, tone curve, skin tone protection, dynamic transfer) | Menghitung **selisih tonal (delta)** antara foto target dan foto referensi agar tidak menerapkan nilai absolut yang merusak foto target. |
| **Kontrol UI AI Copier** | Upload referensi, indikator confidence, swatch palet, slider intensitas, hold-to-compare | 14 kontrol lengkap: Upload Target, Upload Referensi, Dual Previews, Tombol Analisis, Tombol Terapkan, Slider 0-100%, Before/After split toggle, Reset Filter, Simpan Preset, Terapkan Ulang, Status & error handling | Menambah tombol upload target langsung dari tab AI, visual preview foto referensi & target side-by-side, split before/after viewer, dan simpan profil AI ke koleksi preset. |
| **Undo / Redo & Reset** | Sudah berjalan untuk state dasar | Harus mengcover seluruh parameter baru, reset parsial (per tab / per grup) vs Reset All | Tambahkan `resetAdjustments()`, `resetFilter()`, `resetAI()` tanpa menghapus crop/rotasi jika pengguna tidak menginginkannya. |
| **Ekspor & Resolusi** | Mendukung original, 1080p, 4K, 2K ke JPEG/PNG | Mempertahankan resolusi penuh foto asli saat ekspor tanpa degradasi | Menjamin pipeline ekspor menggunakan canvas ukuran penuh foto asli dengan seluruh matematika piksel diterapkan. |

---

## 3. Rencana Bertahap (Roadmap Eksekusi)

1. **Tahap 1 (Selesai)**: Audit menyeluruh codebase, dependensi, dan arsitektur pengolahan citra.
2. **Tahap 2**: Lengkapi `ImageAdjustments` di `types.ts` dan perbarui `photoEngine.ts` dengan algoritma pemrosesan piksel lengkap (Light, Color, Detail, Effects, Tone Curve, 3-Way Color Grading).
3. **Tahap 3**: Implementasikan sistem 15 preset warna profesional di `presets.ts` dengan dukungan intensitas variabel 0–100% dan penyimpanan preset kustom.
4. **Tahap 4**: Sempurnakan `aiFilterEngine.ts` dengan analisis transfer histogram komparatif target vs referensi, preservasi warna kulit (*skin-tone masking/protection*), dan estimasi kurva tonal.
5. **Tahap 5**: Perbarui antarmuka pengguna di `PhotoEditor.tsx` & `PhotoEditor.css` untuk menghadirkan kontrol slider terorganisir accordion, split before/after, kontrol AI Copier 14 titik, dan reset scoped.
6. **Tahap 6**: Integrasikan penyimpanan proyek IndexedDB & verifikasi ekspor resolusi tinggi (Lossless / High Quality JPEG/PNG).
7. **Tahap 7**: Pengujian multi-skenario (foto terang, foto gelap, portrait manusia, lanskap alam) dan validasi bebas regresi.
