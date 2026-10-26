# TEST_MATRIX.md — Multimedia Editor Hybrid

**Versi:** 1.1  
**Tanggal:** 2026-10-20  
**Status:** MVP Beta — EXIF orientation fix added (B-03 resolved)

---

## 1. Platform & Browser yang Didukung

### Web (Primary Target)

| Browser | Versi Min | Status | Catatan |
|---------|-----------|--------|---------|
| Google Chrome | 112+ | ✅ Didukung | Semua fitur termasuk MediaRecorder + captureStream |
| Microsoft Edge | 112+ | ✅ Didukung | Berbasis Chromium, fitur identik |
| Mozilla Firefox | 115+ | ⚠️ Parsial | MediaRecorder tersedia, container output: WebM bukan MP4 |
| Safari (macOS) | 16.4+ | ⚠️ Parsial | MediaRecorder terbatas; captureStream tersedia di 15.4+, namun MP4 export tidak dijamin |
| Chrome Android | 112+ | ✅ Didukung | Dioptimalkan via Capacitor WebView |
| Samsung Internet | 21+ | ⚠️ Belum diuji | Menggunakan Chromium baru, estimasi OK |

> **Catatan:** Browser yang tidak mendukung `MediaRecorder` atau `HTMLCanvasElement.captureStream()` tidak dapat menggunakan fitur ekspor video. Aplikasi tetap berjalan tetapi tombol ekspor video menampilkan pesan ketidakdukungan.

### Android (Capacitor WebView)

| Kelas Perangkat | Android Min | Status | Catatan |
|-----------------|-------------|--------|---------|
| Low-end (2 GB RAM) | Android 9 | ⚠️ Terbatas | Ekspor video maks disarankan 720p; 1080p mungkin gagal |
| Mid-range (4-6 GB RAM) | Android 10 | ✅ Didukung | 1080p OK; 1440p belum diuji di perangkat nyata |
| High-end (8+ GB RAM) | Android 11+ | ✅ Didukung | Semua preset hingga 1080p; 4K belum diuji |

> **PENTING:** Hasil Android di atas adalah estimasi berdasarkan Web API support. Pengujian APK pada perangkat fisik BELUM dilakukan.

---

## 2. Matriks Fitur — Foto

| Fitur | Status Implementasi | Uji Manual | Catatan |
|-------|--------------------|-----------:|---------|
| Import dari file picker | ✅ Selesai | ⬜ Perlu uji | JPEG, PNG, WebP, AVIF via input accept="image/*" |
| Preview canvas | ✅ Selesai | ⬜ Perlu uji | Canvas 2D |
| Crop interaktif | ✅ Selesai | ⬜ Perlu uji | Drag area crop |
| Rotate 90/180/270 derajat | ✅ Selesai | ⬜ Perlu uji | — |
| Flip horizontal/vertikal | ✅ Selesai | ⬜ Perlu uji | — |
| Brightness, Contrast, Saturation | ✅ Selesai | ⬜ Perlu uji | Range -100 s/d 100 |
| Filter (Grayscale, Sepia, Warm, Cool, Vintage, Dramatic) | ✅ Selesai | ⬜ Perlu uji | 6 filter |
| Undo/Redo (multi-level) | ✅ Selesai | ⬜ Perlu uji | HistoryManager |
| Reset ke kondisi awal | ✅ Selesai | ⬜ Perlu uji | — |
| Tambah text layer | ✅ Selesai | ⬜ Perlu uji | Posisi, font size, warna, bold, italic |
| Pindahkan/edit/hapus teks | ✅ Selesai | ⬜ Perlu uji | — |
| Ekspor JPEG | ✅ Selesai | ⬜ Perlu uji | Quality 0.0-1.0 |
| Ekspor PNG | ✅ Selesai | ⬜ Perlu uji | Lossless |
| Resolusi ekspor adaptif | ✅ Selesai | ⬜ Perlu uji | Original, SD, HD, FHD, QHD, 4K |
| Simpan proyek ke IndexedDB | ✅ Selesai | ⬜ Perlu uji | — |
| Ekspor paket proyek (.json) | ✅ Selesai | ⬜ Perlu uji | Edit-state saja, tanpa media |
| EXIF orientation handling | ✅ Selesai | ⬜ Perlu uji | Implemented via DataView JPEG parser + canvas correction in `photoEngine.ts` |
| Transparansi PNG | ⚠️ Parsial | — | Canvas 2D mendukung; latar transparan OK |

### Format File Foto yang Diuji

| Format | Status | Catatan |
|--------|--------|---------|
| JPEG | ⬜ Perlu uji manual | — |
| PNG | ⬜ Perlu uji manual | — |
| WebP | ⬜ Perlu uji manual | Tergantung browser |
| AVIF | ⬜ Perlu uji manual | Chrome 85+ |
| HEIC/HEIF | ❌ Tidak didukung | Perlu library tambahan |
| File > 10 MB | ⬜ Perlu uji | Risiko OOM pada canvas |

---

## 3. Matriks Fitur — Video

| Fitur | Status Implementasi | Uji Manual | Catatan |
|-------|--------------------|-----------:|---------|
| Import file video | ✅ Selesai | ⬜ Perlu uji | input accept="video/*" |
| Preview (play/pause/seek) | ✅ Selesai | ⬜ Perlu uji | HTML video element |
| Tampilkan metadata (durasi, dimensi) | ✅ Selesai | ⬜ Perlu uji | Via videoWidth/Height/duration |
| Trim awal/akhir | ✅ Selesai | ⬜ Perlu uji | Berbasis timeline drag |
| Split at playhead | ✅ Selesai | ⬜ Perlu uji | Membuat 2 klip dari 1 |
| Susun multi-klip berurutan | ✅ Selesai | ⬜ Perlu uji | Max tanpa batas UI |
| Undo/Redo video edit | ✅ Selesai | ⬜ Perlu uji | HistoryManager |
| Audio enable/disable | ✅ Selesai | ⬜ Perlu uji | — |
| Volume control | ✅ Selesai | ⬜ Perlu uji | — |
| Rotation video output | ✅ Selesai | ⬜ Perlu uji | Canvas transform |
| Brightness/Contrast/Saturation | ✅ Selesai | ⬜ Perlu uji | CSS filter pada canvas |
| Text overlay video | ✅ Selesai | ⬜ Perlu uji | Canvas drawText |
| Ekspor MP4 lokal | ✅ Selesai | ⬜ Perlu uji | captureStream + MediaRecorder |
| Progress ekspor + abort | ✅ Selesai | ⬜ Perlu uji | AbortController |
| Peringatan format tidak didukung | ✅ Selesai | ⬜ Perlu uji | — |
| Simpan proyek video ke IndexedDB | ✅ Selesai | ⬜ Perlu uji | — |
| Audio sync pada ekspor | ⚠️ Parsial | — | captureStream menyertakan audio track; sync bergantung browser |
| Multi-track video | ❌ Tidak ada | — | P2 - bukan MVP |
| Transisi klip | ❌ Tidak ada | — | P2 |
| Stabilisasi/denoise | ❌ Tidak ada | — | P2 |

### Format Video yang Diuji

| Format | Status | Catatan |
|--------|--------|---------|
| MP4 / H.264 | ⬜ Perlu uji manual | Baseline target |
| WebM / VP8-VP9 | ⬜ Perlu uji manual | Chrome/Firefox |
| MOV | ⬜ Perlu uji manual | Tergantung codec internal |
| AVI | ❌ Kemungkinan tidak didukung | Browser jarang decode AVI |
| HEVC / H.265 | ❌ Tidak didukung di sebagian besar browser | — |
| Portrait video (9:16) | ⬜ Perlu uji manual | — |
| Landscape video (16:9) | ⬜ Perlu uji manual | — |
| Video tanpa audio track | ⬜ Perlu uji manual | — |
| Variable frame rate | ⬜ Perlu uji manual | Risiko audio desync |
| Durasi > 5 menit | ⬜ Perlu uji manual | Risiko memori |
| File > 500 MB | ⬜ Perlu uji manual | Risiko OOM |

---

## 4. Matriks Resolusi Ekspor

| Preset | Dimensi | Bitrate Target | Status API | Catatan |
|--------|---------|---------------|------------|---------|
| Original | Sesuai sumber | 4 Mbps | ✅ | Default |
| SD 480p | 854x480 | 1.5 Mbps | ✅ | — |
| HD 720p | 1280x720 | 3 Mbps | ✅ | — |
| Full HD 1080p | 1920x1080 | 6 Mbps | ⚠️ | Belum diuji pada perangkat nyata |
| Cinema 2K | 2048x1080 | 8 Mbps | ⚠️ | Belum diuji |
| QHD 1440p | 2560x1440 | 12 Mbps | ⚠️ | Kemungkinan gagal di perangkat low-end |
| 4K UHD | 3840x2160 | 24 Mbps | ❌ Tidak diklaim | Belum diuji; kemungkinan gagal di browser |

> **Catatan:** Semua resolusi di atas menggunakan `HTMLCanvasElement.captureStream()` + `MediaRecorder`. Dukungan bitrate aktual bergantung pada implementasi browser dan tidak dapat dijamin persis sama.

---

## 5. Hasil Unit Test

Dijalankan dengan: `node --experimental-strip-types --test src/core/video.test.ts`

| Test | Status | Durasi |
|------|--------|--------|
| clampAdjustment range [-100, 100] | ✅ PASS | 0.61ms |
| clampVolume range [0, 1] | ✅ PASS | 0.37ms |
| isValidRotation (0, 90, 180, 270) | ✅ PASS | 0.11ms |
| RESOLUTION_MAP contains presets | ✅ PASS | 0.07ms |
| HistoryManager undo/redo | ✅ PASS | 0.49ms |
| evaluateResolutionCapabilities | ✅ PASS | 0.23ms |
| validateProjectSchema | ✅ PASS | 1.10ms |

**Total: 7/7 PASS — Durasi: 129ms**

---

## 6. Bug Diketahui & Risiko

| ID | Deskripsi | Prioritas | Status |
|----|-----------|-----------|--------|
| B-01 | Firefox mengekspor WebM bukan MP4 (sesuai spec browser) | Medium | Diketahui |
| B-02 | Safari captureStream support tidak konsisten | High | Diketahui — warning tersedia |
| B-03 | EXIF orientation foto belum dihandle | Medium | Backlog |
| B-04 | Audio desync pada video VFR (variable frame rate) | Medium | Diketahui — keterbatasan MediaRecorder |
| B-05 | Canvas OOM pada foto > 20 megapixel | Medium | Belum diuji |
| B-06 | APK Android belum diuji pada perangkat fisik | High | Perlu pengujian |
| B-07 | 4K export belum diuji — dapat hang browser | High | Dikomunikasikan di UI dengan warning |

---

## 7. Langkah Uji Manual Minimal (Happy Path)

### Foto
1. Buka aplikasi > pilih Foto
2. Import file JPEG (~2 MB)
3. Crop, putar 90 derajat, tambah brightness +30
4. Pilih filter Sepia
5. Tambah text "Test"
6. Undo 2x > konfirmasi reversi
7. Ekspor sebagai JPEG > buka file > verifikasi visual
8. Ekspor sebagai PNG > buka file > verifikasi
9. Simpan proyek > kembali ke Home > buka proyek lagi > verifikasi state

### Video
1. Buka aplikasi > pilih Video
2. Import file MP4 (~20 MB, 30 detik)
3. Play/pause, seek ke 15 detik
4. Trim awal ke 5 detik, trim akhir ke 25 detik
5. Split at playhead > konfirmasi 2 klip di timeline
6. Aktifkan brightness +20 dan text overlay
7. Pilih preset HD 720p
8. Ekspor > tunggu progress > buka file > verifikasi audio + video

---

## 8. Checklist Sebelum Rilis Publik

- [ ] Uji manual foto (JPEG, PNG) pada Chrome 112+
- [ ] Uji manual video (MP4 H.264) pada Chrome 112+
- [ ] Uji pada Firefox 115+ (verifikasi WebM output)
- [ ] Uji APK pada perangkat Android fisik (minimal 1 low-end, 1 mid-range)
- [ ] Verifikasi tidak ada secret di dist bundle
- [ ] Verifikasi tidak ada upload media ke server (network tab)
- [ ] Verifikasi IndexedDB tidak menyimpan bytes media
- [ ] Uji skenario storage penuh
- [ ] Uji batalkan ekspor di tengah proses
