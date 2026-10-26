# Product Requirements Document (PRD) — Multimedia Editor Hybrid (v3.5 Audited)

**Versi Dokumen:** 3.5 (Audited, Reconciled & Grounded)\
**Tanggal Rilis Audit:** 23 Oktober 2026\
**Status Produk:** Production-Ready untuk Core Photo Editor, Client-Side Computer Vision & Local NLU Assistant; Hybrid Remote Generative AI berstatus Architecture Adapter / Backend Pending.\
**Dasar Audit:** Verifikasi source code aktual, pemeriksaan konfigurasi platform, audit keamanan, analisis linter (`oxlint`), verifikasi TypeScript (`tsc -b`), dan eksekusi 79 unit test terpadu (`npm test`).

---

## 1. Ringkasan Eksekutif & Hasil Rekonsiliasi Audit

Audit komprehensif terhadap repositori `c:\proyek\` (termasuk `multimedia-editor` dan `multimedia-editor-rn`) mengungkap status aktual sistem secara objektif:

1. **Core Photo Engine & Local CV (IMPLEMENTED & VERIFIED):**
   - Manipulasi piksel deterministik berbasis HTML5 Canvas 2D `ImageData` berjalan 100% lokal di perangkat pengguna.
   - Engine pencahayaan, kontras mikro, kurva nada (RGB dan komposit), 8-channel HSL color mixer, efek vignette, noise grain, dan transformasi geometri (crop, rotasi, flip) berfungsi stabil dan presisi.
   - Durasi render kanvas berkisar antara 15ms hingga 85ms pada gambar Full HD/4K (bukan "0ms").

2. **AI Filter Copier Engine (IMPLEMENTED & VERIFIED):**
   - Ekstraksi karakter warna referensi menggunakan konversi CIE L\*a\*b\* (D65 Standard) dan pergeseran warna $\Delta E$.
   - Fitur *Anti-Blackout & Key Light Anchoring* terbukti secara empiris mencegah foto target siang menjadi gelap gulita saat meniru foto referensi malam/siluet.
   - Proteksi melanin kulit multi-etnik (Fitzpatrick I–VI) dan penguncian `denoise = 0` berhasil mempertahankan tekstur alami dan pori-pori kulit.
   - Bersifat 100% deterministik (*Mathematical Computer Vision*), bukan model generatif deep learning.

3. **Asset Manager & Local Storage (IMPLEMENTED & VERIFIED):**
   - Skema IndexedDB versi 2 berhasil memisahkan metadata proyek (`projects`) dari aset biner media asli (`media_assets`).
   - Foto sumber disimpan sebagai `Blob` murni dengan UUID `assetId` stabil, mengeliminasi masalah URL blob sementara yang kedaluwarsa saat tab ditutup.
   - Autosave berjalan dengan jeda *debounce* 1200ms. Mekanisme *Crash Recovery* dan deteksi aset hilang (*Relink Missing Asset*) berfungsi sesuai spesifikasi.
   - *Batasan:* Ekspor proyek ke berkas `.json` hanya membawa metadata dan state penyesuaian (<50 KB). Berkas biner foto asli tidak disertakan dalam file JSON; oleh karena itu, saat dibuka pada perangkat lain, pengguna wajib menautkan kembali foto sumber (*relink*).

4. **Conversational AI Copilot (IMPLEMENTED BUT PARTIAL / RULE-BASED NLU):**
   - Antarmuka laci percakapan (`AIChatAssistant.tsx`) dengan tema *dark modern glassmorphism* berfungsi interaktif.
   - Engine pemahaman bahasa alami (`aiOrchestrator.ts`) menggunakan *deterministic regular expression & keyword intent matching* dwibahasa (Indonesia & Inggris).
   - Memahami modifikator magnitudo ("sedikit" $\times 0.5$, "banyak" $\times 1.8$) dan memori percakapan lanjutan ("tambah lagi", "sedikit lagi").
   - *Koreksi Audit:* Sistem ini adalah *rule-based natural language parser*, **BUKAN** model bahasa besar (*Large Language Model* / LLM) neural seperti GPT-4 atau Gemini yang berjalan di peramban.

5. **AI Image Reconstruction & Enhancement (IMPLEMENTED BUT PARTIAL):**
   - *Diagnostik Kualitas Citra:* Menghitung skor blur/fokus objektif ($0-100$) via discrete Laplacian gradient energy ($G = \sqrt{G_x^2 + G_y^2}$), skor noise bayangan, kliping pencahayaan, dynamic range spread, dan kategori resolusi. Ini adalah algoritma matematika komputer visi lokal yang nyata dan terverifikasi.
   - *Mode 1 (Enhance Original):* 100% lokal, menggunakan unsharp mask, shadow lift, dan denoise area datar tanpa halusinasi AI. (IMPLEMENTED & VERIFIED).
   - *Mode 2 (AI Reconstruction):* Saat ini berjalan sebagai **fallback penajaman kontur & blending adaptif lokal**. Repositori belum terhubung ke model generative diffusion / inpainting neural network. (IMPLEMENTED BUT PARTIAL / MOCK GENERATIVE).
   - *Mode 3 (Generate Alternative):* Berjalan sebagai variasi tonal/kontras artistik lokal. (IMPLEMENTED BUT PARTIAL).
   - *Transparansi Etika:* Disclaimer etika transparan telah terpasang di antarmuka pengguna untuk menegaskan bahwa hasil adalah estimasi AI, bukan bukti forensik bentuk asli.

6. **Remote Generative AI Provider (MOCK / ADAPTER READY):**
   - Arsitektur adapter (`aiProviderAdapter.ts`) telah siap mengisolasi provider lokal dan remote proxy (`/api/ai/generate`).
   - Saat ini belum ada backend server aktif di repositori (aplikasi berjalan sebagai SPA Vite client-side). Perintah generatif berat (seperti "hapus background") secara jujur mengembalikan status `pending` dan notifikasi bahwa backend online belum dikonfigurasi.
   - Tidak ada kebocoran API secret key di frontend maupun bundle build.

7. **Komparasi Platform (Capacitor vs React Native):**
   - **Android Capacitor (`multimedia-editor/android`):** Merupakan **Jalur Produksi Utama** (100% fitur web, termasuk AI Filter Copier, Copilot, Diagnostik Citra, dan IndexedDB berjalan di WebView terakselerasi perangkat keras). Berhasil menghasilkan APK mandiri `mediastudio-android.apk` (3.8 MB).
   - **React Native Expo (`multimedia-editor-rn`):** Merupakan **Jalur Eksplorasi / Companion App Terbatas** yang hanya memiliki fungsi pengeditan dasar (`expo-image-manipulator`) dan belum memiliki AI Filter Copier lengkap, Conversational Copilot, maupun Reconstruction Engine.

---

## 2. Matriks Status Fitur Berdasarkan Source Code Aktual

| Nama Fitur | Lokasi Implementasi | Status Aktual | Bukti Implementasi & Pengujian | Keterbatasan / Kekurangan | Risiko Teknis | Kriteria Penerimaan Revisi |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **Canvas 2D Rendering Engine** | `src/core/photoEngine.ts` | **IMPLEMENTED & VERIFIED** | 31 unit test di `test_core_engine.ts` lolos; render real-time di `PhotoEditor.tsx`. | Latensi meningkat pada gambar resolusi raksasa (>24 MP / 8K). | Konsumsi memori kanvas tinggi pada perangkat RAM <3GB. | Render gambar 4K stabil <150ms tanpa memory leak; seluruh slider responsif. |
| **Pencahayaan & Kurva Rolloff** | `src/core/photoEngine.ts` | **IMPLEMENTED & VERIFIED** | Rumus `expFactor = 2 ** (exp/55)`, kompresi shoulder >235 & toe <18 tervalidasi. | Parameter ekstrim dapat meratakan kontras jika tidak diimbangi blacks. | Tidak ada. | Seluruh 7 kontrol pencahayaan aman dari *harsh pixel wrapping/clipping*. |
| **8-Channel HSL Mixer** | `src/core/photoEngine.ts` | **IMPLEMENTED & VERIFIED** | Transformasi hue, saturation, dan luminance per kanal warna. | Interpolasi batas antar-warna memerlukan sampling halus. | Pergeseran hue ekstrem dapat menimbulkan artefak posterisasi. | Kanal kulit (Orange & Red) terisolasi tanpa merusak warna latar biru/hijau. |
| **Ekspor Multi-Resolusi & Format** | `src/core/photoEngine.ts`, `types.ts` | **IMPLEMENTED & VERIFIED** | Dukungan format JPEG, PNG, WebP; resolusi Original, 4K, 2K, 1080p, 720p. | JPEG & WebP bersifat *lossy* terkompresi kualitas tinggi (bukan *lossless* murni). Hanya PNG yang lossless. | Browser lawas mungkin tidak mendukung WebP encoder. | Gambar hasil unduh memuat seluruh penyesuaian visual pada resolusi target. |
| **Web Share Gallery Saver** | `src/core/photoEngine.ts` | **IMPLEMENTED & VERIFIED** | Memanggil `navigator.share({ files })` di mobile dan fallback ke `<a>` di desktop. | Membuka native sharesheet Android (pengguna memilih "Simpan ke Perangkat"), tidak otomatis menulis ke folder DCIM tanpa izin OS. | Browser desktop tanpa dukungan share file akan memakai fallback download biasa. | Tersedia alur simpan ke galeri ponsel tanpa kegagalan unduh blob. |
| **AI Filter Copier (CIE L\*a\*b\*)** | `src/core/aiFilterEngine.ts` | **IMPLEMENTED & VERIFIED** | 11 unit test di `test_qc_ai_filter.ts` lolos (CIE Lab D65, Fitzpatrick skin tone, anti-blackout). | Memerlukan foto referensi dengan pencahayaan yang cukup untuk ekstraksi optimal. | Foto referensi monokrom pekat menghasilkan saturasi datar pada foto target. | Mood warna referensi ditiru tanpa menggelapkan foto target secara berlebihan. |
| **Preservasi Tekstur & Wajah** | `src/core/aiFilterEngine.ts` | **IMPLEMENTED & VERIFIED** | Kunci `denoise = 0`, batas `sharpness <= 10`, isolasi hue kanal Orange/Red $\le 7^\circ$. | Tidak melakukan rekonstruksi bentuk wajah (prinsip non-destruktif). | Tidak ada. | Pori kulit dan serat kain asli tetap utuh; tidak ada efek wajah lilin/plastik. |
| **Asset Manager Store** | `src/core/storage.ts` | **IMPLEMENTED & VERIFIED** | IndexedDB v2 `media_assets` menyimpan raw `Blob` dengan UUID `assetId`. | Kuota browser dibatasi oleh penyimpanan internal perangkat. | Kuota penuh akan memicu error `QuotaExceededError`. | Proyek tetap dapat dibuka setelah reload browser tanpa URL blob rusak. |
| **Autosave & Crash Recovery** | `src/core/storage.ts`, `PhotoEditor.tsx` | **IMPLEMENTED & VERIFIED** | Debounced 1200ms save, reaktif 4 status indikator, banner pemulihan sesi aktif. | Jika pengguna membersihkan cache/data browser, IndexedDB terhapus. | Kehilangan data jika browser ditutup paksa dalam jendela 1200ms penenang. | Indikator `Tersimpan` muncul setelah jeda penyesuaian; banner recovery muncul saat crash. |
| **Conversational AI Copilot** | `src/components/AIChatAssistant.tsx`, `aiOrchestrator.ts` | **IMPLEMENTED BUT PARTIAL** | 26 unit test di `test_ai_orchestrator.ts` lolos; memahami perintah ID/EN, magnitudo, follow-up. | Berbasis aturan/regex deterministik; tidak memahami konteks filosofis/puisi abstrak seperti LLM sejati. | Pengguna mengira berbicara dengan ChatGPT sejati; rentan salah paham pada kalimat ambigu. | Instruksi standar ("terangkan sedikit", "buat hangat", "undo") dieksekusi instan dan aman. |
| **Remote Generative AI Proxy** | `src/core/aiProviderAdapter.ts` | **MOCK / STUB** | Adapter `RemoteGenerativeProvider` menangani status offline dan endpoint `/api/ai/generate`. | Backend server generative AI belum ada di repositori; mengembalikan status pending dan pesan draft. | Perintah generatif berat (remove background) belum menghasilkan piksel baru. | Menolak secara jujur saat backend offline tanpa merusak canvas lokal. |
| **Diagnostik Kualitas Citra** | `src/core/aiReconstructionEngine.ts` | **IMPLEMENTED & VERIFIED** | 11 unit test di `test_ai_reconstruction.ts` lolos; skor blur Laplacian, noise, kliping, resolusi. | Estimasi noise berbasis variasi gradien rendah, bukan deep noise profiling. | Foto artistik bokeh yang sengaja blur latar dapat menurunkan skor ketajaman global. | Skor ketajaman citra buram <45 dan citra tajam >50; daftar isu terdeteksi akurat. |
| **Restorasi: Enhance Original** | `src/core/aiReconstructionEngine.ts` | **IMPLEMENTED & VERIFIED** | Unsharp mask lokal, shadow recovery, local clarity, dan flat-area noise dampening. | Tidak dapat merekonstruksi detail yang benar-benar hilang dari sensor kamera. | Penajaman berlebihan pada noise tinggi dapat mempertegas butiran noise. | Meningkatkan ketajaman tepi dan kontras bayangan tanpa halusinasi AI. |
| **Restorasi: AI Reconstruction** | `src/core/aiReconstructionEngine.ts`, `PhotoEditor.tsx` | **IMPLEMENTED BUT PARTIAL** | Menyesuaikan sharpness, clarity, texture, contrast, shadows dengan slider intensitas dan disclaimer etika. | Menggunakan penguatan kontur tepi lokal; belum terhubung ke model generative diffusion/inpainting. | Hasil bukan rekonsiliasi AI diffusion sejati; hanya penguatan struktural kontur. | Slider intensitas (10–100%) dan tombol komparasi berfungsi; disclaimer etika tampil jelas. |
| **Restorasi: Generate Alternative** | `src/core/aiReconstructionEngine.ts` | **IMPLEMENTED BUT PARTIAL** | Menerapkan variasi penyesuaian kontras dan vibrance kontekstual. | Bersifat variasi parametrik terarah, bukan sintesis gambar generatif baru. | Interpretasi terbatas pada manipulasi tonal gambar yang ada. | Menghasilkan variasi visual dengan penanda interpretasi kontekstual. |
| **Android Capacitor APK** | `android/` | **IMPLEMENTED & VERIFIED** | Build APK `mediastudio-android.apk` (3.8 MB), sinkronisasi via `npx cap sync`. | Kinerja kanvas bergantung pada performa GPU WebView Android. | Perangkat Android lama (<Android 10) mungkin lambat pada gambar >12 MP. | APK dapat diinstal dan menjalankan seluruh fitur editor tanpa crash. |
| **React Native Companion App** | `c:\proyek\multimedia-editor-rn\` | **IMPLEMENTED BUT PARTIAL** | UI editor mobile dengan slider Lightroom di `PhotoEditorScreen.tsx`. | Tidak memiliki AI Filter Copier L\*a\*b\*, Conversational Copilot, dan Rekonstruksi Citra. | Dual-maintenance jika tidak diposisikan jelas sebagai companion sekunder. | Diposisikan resmi sebagai eksperimen/companion, bukan APK rilis utama. |
| **Video Editor MVP** | `src/pages/VideoEditor.tsx` (jika ada) | **NOT IMPLEMENTED** | Belum ada implementasi timeline, WebCodecs encoder, atau scrubber player di web. | Modul video belum dibangun; fokus fase saat ini pada stabilitas foto dan AI. | Tidak ada (belum dimulai). | Dilanjutkan pada Fase 2 setelah arsitektur foto & AI stabil. |

---

## 3. Rekonsiliasi Klaim Teknis PRD v3.4

Berikut adalah daftar ketidaksesuaian dan koreksi resmi dari PRD v3.4 ke v3.5:

| No | Pernyataan pada PRD v3.4 | Fakta Source Code Aktual | Koreksi Resmi pada PRD v3.5 |
| :---: | :--- | :--- | :--- |
| 1 | "Fase 1, 2, 3, 4 Selesai 100%" | Fase 1 & 2 selesai penuh. Fase 3 (Copilot) dan Fase 4 (Reconstruction) selesai pada layer antarmuka dan komputasi lokal, tetapi bagian generatif online berstatus adapter/backend pending. | Ditandai akurat: **Local Computer Vision & Deterministik 100% Selesai**, **Generative Backend Proxy: Ready for Integration / Stub**. |
| 2 | "Jumlah tes: 35, 42, 62, 79 saling bertolak belakang" | Jumlah tes dihitung secara bertahap dalam catatan rilis tanpa tabel rekonsiliasi tunggal. | Disatukan menjadi satu tabel resmi: **79 Unit Test Terpadu** yang benar-benar dieksekusi oleh `npm test`. |
| 3 | "Operasi lokal berjalan dengan 0ms / Zero Latency" | Komputasi kanvas pada CPU/GPU membutuhkan waktu fisik (15ms s/d 85ms untuk Full HD/4K). | Dihapus istilah "0ms"; diganti dengan **"Pemrosesan lokal berkecepatan tinggi (real-time rendering tanpa latensi jaringan internet)"**. |
| 4 | "Ekspor JPEG dan WebP bersifat Lossless" | JPEG adalah format *lossy*. WebP pada `PhotoEditor.tsx` menggunakan kompresi kualitas 92% (*lossy* teroptimasi). Hanya PNG yang *lossless*. | Diganti dengan **"Ekspor Resolusi Penuh Asli (Original Resolution) dengan kualitas visual tinggi (Lossy 92% untuk JPEG/WebP, Lossless murni untuk PNG)"**. |
| 5 | "Web Share API selalu menyimpan langsung ke Galeri Foto" | Web Share API memanggil native sharesheet Android. Pengguna harus memilih aksi simpan perangkat pada menu OS. | Dijelaskan akurat: **"Menggunakan Web Share API yang memunculkan dialog native Android untuk menyimpan/membagikan media ke galeri, dengan fallback anchor download di desktop"**. |
| 6 | "Conversational AI setara ChatGPT" | Menggunakan regular expression dan keyword-based intent parsing lokal di `aiOrchestrator.ts`. | Dijelaskan secara transparan: **"Asisten pengedit foto berbasis Natural Language Understanding (NLU) aturan deterministik lokal, bukan model bahasa besar (LLM) neural"**. |
| 7 | "AI Reconstruction menghasilkan rekonstruksi generatif inpainting" | Mode 2 saat ini mengaplikasikan unsharp mask agresif, peningkatan clarity/texture, dan blending kontur lokal di `PhotoEditor.tsx`. | Dijelaskan transparan: **"Mode 2 saat ini berfungsi sebagai Rekonstruksi Kontur Berbasis Heuristik Lokal sebelum model generative inpainting online dihubungkan"**. |
| 8 | "React Native Expo memiliki paritas fitur dengan Web" | `multimedia-editor-rn` hanya memiliki manipulasi dasar via Expo Image Manipulator dan belum memiliki modul AI. | Ditetapkan resmi: **Android Capacitor (`mediastudio-android.apk`) adalah Jalur Produksi Utama**, sedangkan React Native Expo adalah companion eksplorasi. |

---

## 4. Arsitektur Tiga Mode Operasional (Local, Online Generative, Offline)

Untuk menjamin efisiensi biaya, privasi data, dan keandalan sistem, arsitektur dibagi secara tegas ke dalam tiga mode:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER / PHOTO EDITOR UI                           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                     [Evaluasi Jenis Operasi & Jaringan]
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│       MODE A: LOCAL PROCESSING      │     │    MODE B: ONLINE GENERATIVE AI     │
│  (100% Lokal, Gratis, 0 Cloud Data) │     │   (Model Eksternal / Inpainting)    │
├─────────────────────────────────────┤     ├─────────────────────────────────────┤
│ • Exposure, Brightness, Contrast    │     │ • Generative Inpainting             │
│ • HSL 8-Channel & Color Wheels      │     │ • Object Removal & Insertion        │
│ • CIE Lab AI Filter Copier          │     │ • Background Removal / Replace      │
│ • Unsharp Mask & Bilateral Denoise  │     │ • Text-to-Image Generation          │
│ • Laplacian Blur & Image Diagnosis  │     │                                     │
│ • Enhance Original Restoration      │     │ *Syarat Wajib:*                     │
│ • Crop, Rotate, Flip, Text Layers   │     │ 1. Persetujuan eksplisit pengguna   │
│ • IndexedDB Storage & Autosave      │     │ 2. Backend proxy (Zero client keys) │
│ • Rule-based NLU Intent Parser      │     │ 3. Penanganan timeout & network     │
└─────────────────────────────────────┘     └──────────────────┬──────────────────┘
                                                               │
                                          [Jika Koneksi Internet Terputus]
                                                               │
                                                               ▼
                                            ┌─────────────────────────────────────┐
                                            │        MODE C: OFFLINE MODE         │
                                            ├─────────────────────────────────────┤
                                            │ • Seluruh Mode A tetap 100% aktif   │
                                            │ • Mode B dinonaktifkan (disabled)   │
                                            │ • Tampilkan pesan kesalahan ramah   │
                                            │ • Opsi simpan draf lokal            │
                                            └─────────────────────────────────────┘
```

### A. Local Processing (Client-Side Computer Vision)
- **Komponen:** `photoEngine.ts`, `aiFilterEngine.ts`, `aiReconstructionEngine.ts`, `storage.ts`, `aiOrchestrator.ts`.
- **Karakteristik:** Tidak membutuhkan koneksi internet, tidak memakan kuota data seluler, tidak mengirimkan piksel atau metadata keluar dari perangkat pengguna, dan tidak memiliki biaya API per operasi.
- **Batasan Kemampuan:** Hanya memanipulasi informasi visual yang secara fisik ada di dalam matriks piksel gambar. Tidak dapat menciptakan objek baru dari ketiadaan (*zero hallucination*).

### B. Online Generative AI (Cloud Processing)
- **Komponen:** `aiProviderAdapter.ts` (`RemoteGenerativeProvider`).
- **Prinsip Keamanan Tanpa Kunci (*Zero Secret Leakage*):** Frontend web dan berkas APK Android tidak pernah menyimpan API secret keys penyedia model AI (seperti OpenAI, Replicate, atau Google Cloud). Seluruh permintaan wajib melewati backend proxy terotentikasi.
- **Persetujuan Pengguna (*Explicit Consent*):** Sebelum gambar diunggah ke backend, antarmuka wajib menampilkan dialog konfirmasi yang menjelaskan bahwa gambar akan diproses secara online, estimasi waktu, serta kebijakan retensi data sementara.
- **Status Operasi:** Wajib memiliki state eksplisit: `IDLE`, `UPLOADING`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `CANCELLED`.

### C. Offline Mode (Ketiadaan Jaringan)
- Saat `navigator.onLine === false` atau backend tidak merespons:
  - Seluruh fitur pengeditan lokal, filter copier, kurva nada, ekspor, dan autosave tetap berjalan normal.
  - Tombol operasi generatif online menampilkan status nonaktif (*disabled*) dengan penanda *Offline*.
  - Sistem dilarang berpura-pura menyelesaikan operasi generatif jika jaringan gagal.

---

## 5. Spesifikasi Teknis Mesin Diagnostik & Restorasi Citra

### 5.1 Algoritma Analisis Kualitas Citra (`aiReconstructionEngine.ts`)

1. **Perhitungan Blur / Fokus (Laplacian Gradient Energy):**
   $$\bar{G} = \frac{1}{N} \sum_{x,y} \sqrt{\left(\frac{\partial I}{\partial x}\right)^2 + \left(\frac{\partial I}{\partial y}\right)^2}$$
   $$\text{BlurScore} = \text{clamp}\left(\text{round}\left(\frac{\bar{G}}{28} \times 100\right), 0, 100\right)$$
   - $\text{BlurScore} \ge 50$: Citra tajam dengan kontur terdefinisi baik.
   - $35 \le \text{BlurScore} < 50$: Fokus lembut (*soft focus*), disarankan restorasi lokal.
   - $\text{BlurScore} < 35$: Buram parah / motion blur, memerlukan rekonstruksi struktural.

2. **Deteksi Kliping Pencahayaan & Rentang Dinamis:**
   - Under-exposure Count: Jumlah sampel piksel dengan luminansi $L \le 5$.
   - Over-exposure Count: Jumlah sampel piksel dengan luminansi $L \ge 250$.
   - Dynamic Range Spread: Selisih persentil ke-95 dan persentil ke-5 pada histogram luminansi:
     $$\Delta_{\text{tonal}} = P_{95} - P_{5}$$
     $$\text{DynamicRangeScore} = \text{clamp}\left(\text{round}\left(\frac{\Delta_{\text{tonal}}}{200} \times 100\right), 0, 100\right)$$

3. **Kategorisasi Resolusi:**
   - `low`: Lebar < 800px atau tinggi < 600px atau total piksel < 800.000 piksel (<0.8 MP).
   - `medium`: 0.8 MP s/d 3.0 MP (resolusi Full HD standar).
   - `high`: 3.0 MP s/d 8.0 MP (resolusi 2K/4K).
   - `ultra`: $\ge 8.0$ MP.

### 5.2 Standarisasi Tiga Mode Restorasi

- **Mode 1 — Enhance Original (Lokal, Rp 0, Non-Generatif):**
  - Menerapkan unsharp mask adaptif: $I_{\text{sharp}} = I + k \times (I - I_{\text{blur}})$.
  - Mengangkat bayangan gelap ($+20$) tanpa merusak titik hitam (*black point*).
  - Meredam noise sensor pada area datar tanpa mengaburkan tepi kontras.
  - Menjaga 100% identitas wajah, tekstur alami, dan warna asli.
- **Mode 2 — AI Reconstruction (Generatif Terarah):**
  - Dirancang untuk memulihkan subjek yang buram parah, terdistorsi, atau tertutup sebagian.
  - Memanfaatkan masukan konteks dari pengguna (`reconSubjectHint`).
  - Memiliki slider intensitas rekonstruksi ($10\% - 100\%$).
  - Mempertahankan latar belakang asli menggunakan masking.
  - Wajib menyertakan label transparansi: *Hasil merupakan estimasi visual AI, bukan pemulihan forensik detail asli.*
- **Mode 3 — Generate Alternative (Interpretasi Kontekstual):**
  - Menghasilkan variasi interpretasi alternatif baru dengan subjek yang lebih jelas dan hidup.
  - Menegaskan kepada pengguna bahwa hasil adalah interpretasi variatif, bukan foto asli.

---

## 6. Verifikasi & Pengujian Resmi (79/79 Tests Passing)

Pengujian dieksekusi melalui perintah resmi:
```bash
npm test
```
Yang menjalankan 4 test suite secara sekuensial:

```
> multimedia-editor@0.0.0 test
> npx tsx src/core/test_qc_ai_filter.ts && npx tsx src/core/test_core_engine.ts && npx tsx src/core/test_ai_orchestrator.ts && npx tsx src/core/test_ai_reconstruction.ts
```

### Rekapitulasi Resmi Pengujian:

| Suite Pengujian | File Sumber | Jumlah Tes | PASS | FAIL | Durasi Eksekusi | Area Cakupan |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Suite 1: AI Filter QC & Color Science** | `src/core/test_qc_ai_filter.ts` | 11 | 11 | 0 | ~1.4s | Konversi CIE L\*a\*b\* D65, identitas 0% non-destruktif, graduasi mode adaptif, preservasi tekstur alami, proteksi melanin kulit, anti-blackout. |
| **Suite 2: Core Engine & Asset Store** | `src/core/test_core_engine.ts` | 31 | 31 | 0 | ~1.8s | Presisi rasio aspek & ekspor 4K/1080p, rotasi 90°, HistoryManager 50-state rollback, parameter clamping, schema storage v2, WebP MIME type, Asset Manager, duplikasi proyek, session recovery. |
| **Suite 3: Conversational NLU Orchestrator** | `src/core/test_ai_orchestrator.ts` | 26 | 26 | 0 | ~1.5s | NLU pencahayaan, warna, suhu, saturasi, kontras, ketajaman, preset matching, rotasi, follow-up memory ("tambah lagi"), clamping eksposur, deteksi remote generatif, instruksi rekonstruksi kontekstual. |
| **Suite 4: AI Reconstruction & Diagnostics** | `src/core/test_ai_reconstruction.ts` | 11 | 11 | 0 | ~1.3s | Deteksi blur Laplacian, pola tajam vs buram, kategori resolusi, kliping pencahayaan, rekomendasi mode restorasi, disclaimer etika transparansi. |
| **TOTAL KESELURUHAN** | **4 Test Suites** | **79** | **79** | **0** | **~6.0s** | **Tingkat Kelulusan: 100% (Zero Failures)** |

- **Pemeriksaan Linter (`oxlint`):** 0 warnings, 0 errors pada 21 file kode TypeScript.
- **Kompilasi TypeScript (`tsc -b`):** 0 errors.
- **Production Build (`vite build`):** Sukses terkompilasi dalam 810ms (`dist/` 417 kB JS, 46 kB CSS).
- **Android Capacitor (`npx cap sync`):** Sinkronisasi aset web ke `android/app/src/main/assets/public` sukses dalam 0.45s.

---

## 7. Roadmap Prioritas Terkoreksi (Berdasarkan Kesenjangan Nyata)

### Prioritas P0 — Integritas Foto, Stabilitas Lokal & Penyimpanan (STATUS: 100% SELESAI)
- [x] Canvas 2D Rendering Engine dengan 20+ kontrol penyesuaian fotografis.
- [x] AI Filter Copier Engine berbasis CIE L\*a\*b\* D65 dengan Anti-Blackout & Preservasi Tekstur.
- [x] Asset Manager Store IndexedDB v2 (pemisahan biner `media_assets` dan metadata `projects`).
- [x] Autosave debounced 1200ms, Crash Recovery, dan Duplikasi Proyek.
- [x] Ekspor resolusi penuh (Original, 4K, 2K, 1080p) format JPEG, PNG, dan WebP.
- [x] Tata letak responsif mobile (<768px) dan Web Share Gallery Saver untuk Android.
- [x] Android Capacitor APK build mandiri (`mediastudio-android.apk`).

### Prioritas P1 — Penyempurnaan AI Copilot & Diagnostik Citra Lokal (STATUS: 100% SELESAI)
- [x] Antarmuka laci percakapan mengambang (`AIChatAssistant.tsx`) dengan tema dark glassmorphism.
- [x] Engine NLU bilingual berbasis aturan dengan modifikator magnitudo dan memori follow-up.
- [x] Mesin diagnostik kualitas citra (skor blur Laplacian, noise, kliping, resolusi) di `aiReconstructionEngine.ts`.
- [x] Mode 1: Enhance Original (restorasi 100% lokal, unsharp mask, shadow recovery, zero halusinasi).
- [x] Tampilan sub-tab pada panel AI (`AI Filter Copier` vs `Restorasi & Rekonstruksi`).
- [x] Kotak transparansi etika AI generatif pada antarmuka pengguna.

### Prioritas P2 — Integrasi Backend Online Generative AI (STATUS: TAHAP AKTIF / DESAIN ARSITEKTUR SELESAI)
- [x] Audit arsitektur backend & identifikasi cacat kontrak payload `image` pada `RemoteGenerativeProvider`.
- [x] Perancangan backend proxy terisolasi aman (Node.js port 3001) dengan zero secret leakage ke client/APK.
- [x] Spesifikasi guardrail keamanan: Batas payload 10MB, whitelist format, timeout 30s, rate limiting 10 req/min.
- [x] Spesifikasi kebijakan Zero-Mock (`503 PROVIDER_NOT_CONFIGURED`) dan alur User Consent sebelum pengiriman foto.
- [ ] Implementasi berkas server HTTP (`server/index.ts`) dan proxy Vite (`vite.config.ts`).
- [ ] Penyambungan API Background Removal otomatis (e.g., RMBG / BiRefNet) via provider adapter.
- [ ] Penanganan kuota, progress bar persentase unduh/unggah, dan pembatalan permintaan (*abort controller*).
- [ ] Penyimpanan hasil generatif sebagai layer/versi baru tanpa menimpa foto sumber asli.

### Prioritas P3 — Platform Hardening & Optimasi Perangkat Fisik (STATUS: ONGOING)
- [ ] Pengujian performa canvas pada perangkat Android berspesifikasi rendah (RAM 2GB–3GB).
- [ ] Implementasi WebGL / OffscreenCanvas rendering untuk gambar berdimensi raksasa (>30 MP) guna mencegah kehabisan memori (*Out Of Memory*).
- [ ] Penyempurnaan sinkronisasi berkas `.json` antarperangkat dengan panduan penautan foto (*relink assistant*).

### Prioritas P4 — Video Editor MVP (STATUS: DIJADWALKAN SETELAH P2)
- [ ] Validasi teknis modul WebCodecs dan player preview video lokal di peramban.
- [ ] Timeline pemangkasan (*trimming* in/out) dan penyusunan klip dasar.
- [ ] Ekspor video MP4 lokal menggunakan hardware-accelerated video encoder.

---

## 8. Panduan Rollback & Manajemen Risiko

1. **Risiko Memori Gambar Besar pada Ponsel Low-End:**
   - *Mitigasi:* Jika `naturalWidth * naturalHeight > 16_000_000` (16 MP) pada WebView mobile, engine secara adaptif menurunkan resolusi kanvas pratinjau menjadi resolusi layar pratinjau maksimum (2048px), dan hanya memproses resolusi penuh saat ekspor final dijalankan.
2. **Risiko Ketiadaan Koneksi Internet untuk AI Generatif:**
   - *Mitigasi:* Seluruh fitur lokal tetap dapat digunakan. Antarmuka secara otomatis menonaktifkan tombol generatif dan menampilkan pesan: *"Operasi generatif memerlukan jaringan internet. Fitur pengeditan lokal tetap dapat digunakan sepenuhnya."*
3. **Risiko Ketidakcocokan File JSON Ekspor Lintas Perangkat:**
   - *Mitigasi:* Berkas JSON proyek memvalidasi `schemaVersion: 1`. Jika berkas biner foto tidak ditemukan di IndexedDB perangkat baru, sistem menampilkan kartu panduan `Relink Missing Asset` tanpa memunculkan layar putih kosong/crash.
4. **Prosedur Rollback:**
   - Seluruh perubahan source code dikelola melalui Git version control pada repositori `c:\proyek\multimedia-editor`.
   - Jika rilis baru mengalami regresi, pemulihan dapat dilakukan secara atomik menggunakan commit snapshot sebelumnya tanpa merusak basis data IndexedDB lokal pengguna.
