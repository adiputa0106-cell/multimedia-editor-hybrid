# Dokumen Validasi Teknis (Technical Spike): Video Engine Lokal

Dokumen ini memetakan arsitektur, hasil pengujian, kapabilitas, dan batasan implementasi **Tahap 5B (Engine Ekspor Video Lokal)** pada Multimedia Editor Hybrid.

---

## 1. Arsitektur Pipeline Ekspor Video (Tahap 5B)

Untuk menjalankan rendering dan ekspor video 100% lokal di browser tanpa server atau ketergantungan biner eksternal berukuran puluhan megabyte:

```
[HTMLVideoElement (Source Decoding)]
          │
          ├── Frame Gambar ──► [Canvas 2D Engine] ──► canvas.captureStream(30fps)
          │                      (Transform/Filter)                    │
          └── Audio Track  ────────────────────────────────────────────┼──► [MediaRecorder] ──► [Blob Output]
                                                                        │    (MP4 / WebM)
                                                                        ▼
                                                             [Browser Local Download]
```

### Komponen Utama:
1. **[`videoEngine.ts`](file:///c:/proyek/multimedia-editor/src/core/videoEngine.ts)**:
   - `getSupportedVideoFormats()`: Deteksi dinamis codec yang didukung oleh `MediaRecorder.isTypeSupported()`.
   - `renderVideoFrameToCanvas()`: Melakukan transformasi rotasi (0°, 90°, 180°, 270°), flip (X/Y), penyesuaian warna (brightness, contrast, saturation), dan text overlay.
   - `exportVideoClips()`: Orchestrator ekspor frame-by-frame, loop pemotongan klip berurutan (sequencing), penggabungan stream video + audio, dan progress monitoring (0–100%).
   - `AbortController`: Pengguna dapat membatalkan ekspor kapan saja tanpa memory leak.

---

## 2. Matriks Kompatibilitas Codec & Platform Browser

| Platform / Browser | Format Utama yang Didukung | Format Cadangan | Audio Sinkronisasi | Catatan |
|---|---|---|---|---|
| **Google Chrome / Chromium** | `video/mp4;codecs=avc1` (H.264) | `video/webm;codecs=vp9,opus` | Ya | MP4 native playback didukung penuh |
| **Microsoft Edge** | `video/mp4;codecs=avc1` | `video/webm` | Ya | Performa akselerasi GPU aktif |
| **Mozilla Firefox** | `video/webm;codecs=vp9,opus` | `video/webm;codecs=vp8` | Ya | WebM sebagai format utama |
| **Apple Safari (WebKit)** | `video/mp4` | `video/mp4;codecs=avc1` | Ya | Memerlukan user gesture untuk inisiasi media stream |
| **Android WebView / Chrome** | `video/mp4`, `video/webm` | `video/webm` | Ya | Teruji pada Chrome Mobile modern |

---

## 3. Fitur yang Berhasil Dibuktikan & Diuji

- ✅ **Trim Awal & Akhir**: Slider range interaktif menentukan batas `sourceIn` dan `sourceOut` dalam milidetik.
- ✅ **Split Klip di Playhead**: Membagi video menjadi klip-klip berurutan pada posisi playhead waktu putar.
- ✅ **Susun Klip Berurutan (Sequencing)**: Engine me-render Klip 1, lalu berpindah ke Klip 2, dst., dan menggabungkannya ke dalam satu berkas video output.
- ✅ **Audio Control**: Opsi Mute/Unmute dan slider Volume (0–100%) dipertahankan saat ekspor.
- ✅ **Transformasi & Penyesuaian Real-time**: Rotasi 90°, Flip horizontal, Flip vertikal, dan slider Brightness/Contrast/Saturation.
- ✅ **Progress & Pembatalan**: Modal progress bar persentase (0–100%) dengan tombol "Batal".
- ✅ **Undo / Redo Multi-Level**: [`HistoryManager`](file:///c:/proyek/multimedia-editor/src/core/history.ts) terintegrasi pada state video.

---

## 4. Keterbatasan & Rencana Tahap Berikutnya

- **Ekspor 4K & QHD**: Pada browser dengan keterbatasan GPU memory, ekspor canvas di atas 1080p memerlukan penanganan frame rate adaptif (Tahap 6).
- **Multi-track timeline audio bertumpuk**: Belum termasuk dalam scope MVP (sesuai arahan Prompt 5, jalur dasar harus stabil terlebih dahulu).
