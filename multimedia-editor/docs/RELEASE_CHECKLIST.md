# RELEASE_CHECKLIST.md — Multimedia Editor Hybrid

**Versi:** 1.0  
**Tanggal:** 2026-10-20  
**Target Rilis:** Beta (Web + Android APK)

---

## Pre-Release Checklist

### A. Build & Quality

- [x] `npm run test` — 7/7 unit tests PASS
- [x] `npx oxlint src/` — 0 warnings, 0 errors
- [x] `npx tsc -b --noEmit` — TypeScript typecheck PASS
- [x] `npm run build` — Production build PASS (317 KB JS, 30 KB CSS)
- [ ] Uji manual fitur foto pada Chrome terbaru
- [ ] Uji manual fitur video pada Chrome terbaru

### B. Keamanan & Privasi

- [x] Tidak ada API key atau secret di frontend
- [x] Tidak ada upload media otomatis ke server
- [x] IndexedDB hanya menyimpan metadata & edit-state (bukan bytes media)
- [x] Tidak ada backend yang dibutuhkan untuk alur lokal
- [ ] Verifikasi network tab: tidak ada request ke server eksternal saat edit/ekspor

### C. Fitur Foto (P0)

- [x] Import foto dari file picker
- [x] Preview canvas
- [x] Crop, rotate, flip
- [x] Brightness, contrast, saturation
- [x] Filter dasar (6 preset)
- [x] Undo/redo/reset
- [x] Tambah/edit/hapus text layer
- [x] Ekspor JPEG dengan quality control
- [x] Ekspor PNG
- [x] Resolusi ekspor adaptif
- [x] Simpan proyek ke IndexedDB
- [x] Ekspor/import paket proyek JSON
- [ ] EXIF orientation handling — **BELUM SELESAI** (Backlog)

### D. Fitur Video (P0 + P1)

- [x] Import video
- [x] Preview play/pause/seek
- [x] Tampilkan metadata durasi & dimensi
- [x] Trim awal/akhir
- [x] Split at playhead
- [x] Susun multi-klip berurutan
- [x] Undo/redo
- [x] Audio enable/disable + volume
- [x] Rotation, brightness/contrast/saturation
- [x] Text overlay
- [x] Ekspor MP4 lokal dengan progress + abort
- [x] Peringatan format tidak didukung
- [x] Simpan proyek ke IndexedDB
- [ ] Audio sync pada VFR video — **RISIKO DIKETAHUI**
- [ ] Uji ekspor pada perangkat nyata

### E. Adaptive Export (P1)

- [x] Capability matrix SD/HD/FHD/2K/QHD/4K
- [x] Upscale warning
- [x] Estimasi ukuran file (perkiraan, diberi label "perkiraan")
- [x] Peringatan memori untuk 4K/QHD
- [ ] Uji 720p end-to-end pada perangkat nyata
- [ ] Uji 1080p end-to-end pada perangkat nyata
- [ ] 4K: BELUM DIKLAIM — tampilkan warning saja

### F. Penyimpanan Lokal (P1)

- [x] IndexedDB project persistence
- [x] Schema validation pada import
- [x] Estimasi kuota storage
- [x] Peringatan cache bisa dihapus oleh browser
- [x] Export/import paket proyek .json
- [x] Home dashboard dengan daftar proyek tersimpan

### G. Android APK

- [x] Capacitor konfigurasi dibuat (`capacitor.config.ts`)
- [x] Android platform ditambahkan
- [x] Permissions di `AndroidManifest.xml`
- [ ] `npx cap sync` berhasil
- [ ] `npx cap open android` + build APK di Android Studio
- [ ] Instalasi APK pada perangkat fisik
- [ ] Uji fitur foto pada APK
- [ ] Uji fitur video pada APK

### H. Dokumentasi

- [x] `README.md` — cara install & jalankan
- [x] `docs/TECHNICAL_SPIKE.md` — perbandingan teknologi
- [x] `docs/TEST_MATRIX.md` — matriks uji & bug
- [x] `docs/RELEASE_CHECKLIST.md` — ini
- [ ] Dokumentasi limitasi storage browser
- [ ] Dokumentasi cara build APK dari clean state

---

## Fitur yang Sengaja Tidak Diimplementasikan (Scope)

| Fitur | Alasan |
|-------|--------|
| Cloud sync | Opsional per spec; hanya setelah local MVP stabil |
| AI enhancement | Bukan bagian MVP per keputusan produk |
| Multi-track video | P2 — setelah pipeline dasar terbukti |
| Transisi klip | P2 |
| HEVC/AV1 ekspor | Dukungan browser belum universal |
| Stabilisasi/denoise | P2 |
| Sinkronisasi antarperangkat | Tidak tersedia di mode local-only |

---

## Cara Menjalankan Proyek dari Kondisi Bersih

```bash
# Clone / masuk ke folder
cd c:\proyek\multimedia-editor

# Install dependencies
npm install

# Jalankan dev server
npm run dev
# Buka http://localhost:5173

# Jalankan unit test
npm run test

# Lint
npx oxlint src/

# Typecheck
npx tsc -b --noEmit

# Build produksi
npm run build

# Android (membutuhkan Android Studio + Java 17+)
npx cap sync
npx cap open android
# Lalu build APK dari Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s)
```

---

## Status Akhir MVP

| Kategori | Status |
|----------|--------|
| Photo Editor (P0) | ✅ Selesai (kecuali EXIF orientation) |
| Video Editor (P0+P1) | ✅ Selesai (belum uji perangkat nyata) |
| Adaptive Export | ✅ Selesai |
| Local Storage (IndexedDB) | ✅ Selesai |
| Web Build | ✅ Lulus |
| Android Config | ✅ Konfigurasi selesai |
| Android APK (uji fisik) | ❌ Belum dilakukan |
| Cloud Sync | ⏭️ Di-skip (opsional) |
| AI Features | ⏭️ Di-skip (bukan MVP) |
