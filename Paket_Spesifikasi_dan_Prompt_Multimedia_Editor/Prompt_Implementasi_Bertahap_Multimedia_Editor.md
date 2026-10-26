ie# Prompt Implementasi Bertahap --- Multimedia Editor Hybrid

Gunakan prompt di bawah **satu tahap per satu tahap** di IDE AI pilihan.
Jangan meminta AI membangun semua fitur sekaligus. Setelah tiap tahap,
jalankan aplikasi, tes, periksa file yang dibuat, dan baru lanjut ke
tahap berikutnya.

## Prompt 0 --- Peran, aturan, dan tujuan

``` text
Bertindak sebagai senior software engineer yang membangun aplikasi Multimedia Editor Hybrid untuk Web responsif dan Android APK.

Keputusan produk:
- Pemrosesan media lokal di perangkat sebagai default.
- Kualitas ekspor adaptif sesuai kemampuan platform yang telah diuji.
- AI bukan bagian MVP.
- Database hanya metadata dan edit-state, bukan bytes foto/video atau base64.
- Cloud storage bersifat opsional untuk sync; jika dibuat, file memiliki TTL/lifecycle yang transparan.
- Target akhir: web responsif + APK Android yang benar-benar bisa dibangun dan diuji.

Aturan kerja:
1. Jangan mengklaim fitur selesai sebelum diimplementasikan dan diuji.
2. Jangan membuat mock button untuk fitur yang terlihat aktif tetapi tidak berfungsi.
3. Jangan mengasumsikan library web kompatibel dengan React Native.
4. Sebelum memilih library video, buat proof of concept dan jelaskan kompatibilitas, lisensi, batasan, ukuran bundle, dan biaya.
5. Jangan memasukkan rahasia ke frontend/APK.
6. Jangan menyimpan media biner di database.
7. Jangan menambahkan backend jika fitur lokal tidak memerlukannya.
8. Bekerja bertahap. Di awal, inspeksi repository dan jelaskan kondisi saat ini. Jangan menimpa file yang ada tanpa memeriksa dampaknya.
9. Buat tes, dokumentasi cara menjalankan, dan daftar keterbatasan.
10. Jika keputusan teknis belum pasti, berikan pilihan dan jalankan eksperimen kecil sebelum menetapkan arsitektur.
Mulai dengan inspeksi repository dan rencana tahap pertama. Jangan implementasikan semua tahap sekaligus.
```

## Prompt 1 --- Inspeksi repository dan validasi teknis

``` text
Lakukan inspeksi repository saat ini. Identifikasi framework, package manager, struktur folder, versi runtime, status git, dan aplikasi yang sudah ada. Jangan menghapus atau menimpa pekerjaan yang ada.

Buat dokumen docs/TECHNICAL_SPIKE.md yang membandingkan opsi untuk:
- Editing foto di web.
- Preview video di web.
- Ekspor video lokal di web.
- Editing/ekspor video di Android.
- Build APK Android.
- Penyimpanan lokal.
- Kemampuan target 720p, 1080p, 1440p, dan 4K.

Periksa dokumentasi resmi versi library yang akan digunakan dan catat dukungan platform, codec, lisensi, kebutuhan native module, ukuran bundle, serta batasan. Jangan mengklaim semua browser/perangkat mendukung API yang sama.

Buat proof of concept sekecil mungkin:
1. Pilih satu foto dan tampilkan.
2. Pilih satu video dan putar/seek jika format didukung.
3. Buktikan satu jalur ekspor video lokal pada web dan Android secara terpisah, jika feasible.
4. Ukur waktu, memori yang dapat diamati, kualitas output, audio sync, dan hasil file.
5. Catat fitur yang belum dapat dibuktikan.

Jangan membangun timeline profesional sebelum hasil spike menunjukkan jalur decode/encode yang layak. Jalankan tes dan laporkan hasil nyata, command yang dijalankan, serta kendala.
```

## Prompt 2 --- Fondasi proyek dan sistem desain

``` text
Berdasarkan hasil technical spike, buat fondasi proyek untuk web React + TypeScript + Vite dan Android React Native + TypeScript (Expo jika cocok dengan kebutuhan native). Jika repository sudah memakai stack berbeda, jelaskan alasan sebelum migrasi.

Buat:
- Struktur folder yang jelas untuk apps/web, apps/mobile, packages/project-core, serta adapter media per platform.
- Sistem desain responsif: warna, typography, spacing, tombol, slider, dialog, toast, loading, error state.
- Halaman awal dengan pilihan Foto dan Video.
- Halaman proyek/editor yang masih menampilkan status fitur secara jujur.
- Navigasi keyboard yang wajar di web dan kontrol sentuh di mobile.
- README cara install, menjalankan web, menjalankan Android, dan menjalankan tes.
- .env.example hanya untuk variabel non-secret yang diperlukan.

Jangan membuat tombol palsu yang seolah sudah berfungsi. Jika suatu fitur belum ada, tampilkan sebagai belum tersedia atau jangan tampilkan. Jalankan lint, typecheck, dan tes dasar.
```

## Prompt 3 --- Project core dan edit-state bersama

``` text
Implementasikan packages/project-core yang platform-agnostic.

Buat TypeScript types dan schema validation untuk:
- Project metadata.
- Media type photo/video.
- Source metadata: dimensi, orientasi, durasi dan FPS jika diketahui.
- Photo edit state: crop, rotation, flip, brightness, contrast, saturation, filter, text layers.
- Video edit state: daftar klip, source in/out, posisi timeline, playback rate, audio state, text/overlay sederhana.
- Export settings: container, resolution preset, aspect ratio, frame rate, quality.
- schemaVersion untuk migrasi.

Simpan operasi editing sebagai data; jangan menyimpan file media dalam base64. Jangan menganggap file path lokal Android bisa dipakai di browser atau perangkat lain.

Tambahkan validasi rentang nilai, tes unit, contoh proyek, dan dokumentasi migrasi schema. Buat adapter interface untuk photo engine, video preview, video export, dan local storage tanpa mengunci library sebelum technical spike selesai. Jalankan seluruh tes.
```

## Prompt 4 --- Photo Editor MVP

``` text
Implementasikan Photo Editor yang benar-benar berfungsi pada web terlebih dahulu, lalu Android melalui adapter yang sesuai.

Fitur:
- Import foto dari file picker/galeri.
- Preview.
- Crop, rotate, flip.
- Brightness, contrast, saturation.
- Filter dasar.
- Undo, redo, reset.
- Tambah, pindah, edit, dan hapus teks sederhana jika layak pada tahap ini.
- Ekspor JPEG/PNG dengan kualitas yang didukung.
- Simpan edit-state lokal.
- Jangan menimpa foto asli tanpa tindakan eksplisit.

Persyaratan:
- UI responsif; di desktop gunakan panel alat, di mobile gunakan toolbar/panel sentuh.
- Validasi format dan ukuran file.
- Tampilkan pesan error yang bisa dipahami.
- Jangan upload foto ke server.
- Hindari memuat salinan bitmap besar yang tidak diperlukan.
- Tambahkan tes untuk transformasi, undo/redo, ekspor, dan error.
- Dokumentasikan batas format dan ukuran yang telah diuji.

Sebelum menyatakan selesai, jalankan aplikasi dan tunjukkan langkah uji yang berhasil. Jangan membuat kontrol yang hanya mengubah UI tetapi tidak memengaruhi hasil ekspor.
```

## Prompt 5 --- Video proof of concept dan MVP

``` text
Implementasikan video berdasarkan engine yang terbukti layak pada technical spike. Jangan memilih library baru hanya karena populer tanpa mengecek dukungan platform, lisensi, codec, audio, dan kebutuhan native build.

Tahap A:
- Import file video.
- Preview, play/pause, seek.
- Tampilkan metadata yang benar-benar tersedia.
- Tangani format tidak didukung dengan pesan yang jelas.

Tahap B, setelah Tahap A lulus:
- Trim awal/akhir.
- Split dan susun klip berurutan bila engine mendukung.
- Pertahankan audio asli jika pipeline mendukung.
- Undo/redo.
- Ekspor lokal MP4 dengan progress dan error handling.

Pisahkan UI dan edit-state dari engine dekode/encode. Implementasi web dan Android boleh memakai engine berbeda, tetapi harus menghasilkan edit-state yang konsisten.

Tes:
- MP4/H.264 sebagai baseline, lalu format tambahan bila diperlukan.
- Video portrait dan landscape.
- Video dengan dan tanpa audio.
- Durasi, seek, trim, audio sync, file besar, dan format tidak didukung.
- Uji browser target dan perangkat Android nyata.
- Catat waktu ekspor, ukuran file, kualitas, crash, dan batasan.

Jangan mengklaim semua video didukung. Jangan melanjutkan ke timeline multi-track atau transisi kompleks sebelum jalur dasar stabil.
```

## Prompt 6 --- Ekspor adaptif SD/HD/Full HD/2K/4K

``` text
Implementasikan sistem export capability yang menampilkan opsi berdasarkan dukungan nyata pada platform saat ini.

Preset:
- SD 480p.
- HD 720p.
- Full HD 1080p.
- QHD 1440p (sering disebut 2K pada aplikasi konsumen).
- Cinema 2K 2048x1080 sebagai opsi terpisah bila diperlukan.
- 4K UHD 3840x2160.
- FPS dan quality/bitrate hanya jika engine mendukungnya.

Ketentuan:
1. Buat capability matrix yang terdokumentasi per platform dan engine.
2. Opsi yang belum diuji atau tidak didukung harus disembunyikan atau dinonaktifkan dengan alasan jelas.
3. Uji 720p, 1080p, 1440p, dan 4K secara terpisah; jangan menyimpulkan dukungan 4K dari keberhasilan 1080p.
4. Pertahankan rasio aspek atau lakukan crop sesuai pilihan pengguna.
5. Tampilkan peringatan tentang waktu ekspor, memori, dan ukuran file ketika relevan.
6. Jika sumber lebih rendah dari output, jelaskan bahwa upscaling tidak otomatis menciptakan detail asli.
7. Jangan menjanjikan 60 FPS atau codec tertentu secara universal.
8. Jangan menampilkan angka estimasi ukuran sebagai angka pasti.
9. Tambahkan tes output dimensions, rasio aspek, codec/container yang dihasilkan, dan error pada perangkat yang tidak mendukung.

Perbarui dokumentasi berdasarkan hasil tes nyata, bukan asumsi.
```

## Prompt 7 --- Penyimpanan lokal dan paket proyek

``` text
Implementasikan local storage tanpa backend.

Web:
- Gunakan IndexedDB untuk edit-state, metadata, dan cache kecil yang sesuai.
- Jangan menganggap browser storage cocok sebagai arsip permanen untuk semua video.
- Ekspor hasil menggunakan metode yang kompatibel dengan browser target.
- Jika File System Access API digunakan, sediakan fallback download.

Android:
- Gunakan penyimpanan aplikasi untuk file kerja sementara.
- Ekspor hasil ke lokasi yang dipilih pengguna menggunakan API yang sesuai.
- Hindari menghapus hasil ekspor pengguna ketika cache dibersihkan.

Tambahkan:
- Auto-save edit-state jika aman.
- Status penyimpanan: tersimpan lokal, perubahan belum tersimpan, atau gagal.
- Peringatan bahwa cache/data aplikasi/browser bisa dihapus sistem/pengguna.
- Impor/ekspor edit-state.
- Jika membuat paket proyek yang menyertakan media, minta tindakan eksplisit, jelaskan ukuran, dan jangan memasukkan path lokal sebagai path universal.

Tidak ada upload otomatis. Tes pemulihan proyek, data rusak, kuota penuh, dan error penyimpanan.
```

## Prompt 8 --- Cloud storage sementara (opsional, jangan dibuat sebelum sync dibutuhkan)

``` text
Tambahkan cloud sync hanya jika diminta dan setelah local MVP stabil. Jangan mengubah local-only menjadi upload otomatis.

Rancang:
- API Node.js + TypeScript.
- PostgreSQL untuk metadata proyek saja.
- Object storage dengan signed URL dan lifecycle/TTL.
- TTL yang dapat dikonfigurasi; default tidak boleh dianggap final sebelum keputusan produk.
- Upload/download hanya setelah tindakan pengguna dan penjelasan yang jelas.
- Otorisasi setiap proyek, validasi ukuran/format, rate limit, signed URL berumur pendek.
- Cleanup job untuk file kedaluwarsa dan metadata yatim, retry untuk penghapusan gagal.
- Status sync dan penanganan jaringan gagal.

Database tidak boleh menyimpan bytes media atau base64. Jangan menaruh kredensial storage di web/APK. Dokumentasikan retensi dan keterbatasan penghapusan dari backup provider. Tambahkan tes akses pengguna, URL kedaluwarsa, upload gagal, retry, penghapusan, dan TTL.
```

## Prompt 9 --- Pengujian, build APK, dan rilis

``` text
Lakukan hardening untuk rilis beta.

Web:
- Jalankan lint, typecheck, unit test, dan build produksi.
- Uji browser yang dinyatakan didukung.
- Uji import/edit/export foto dan video.

Android:
- Jalankan pemeriksaan native dependency dan build APK sesuai konfigurasi proyek.
- Pastikan hasil build benar-benar file APK yang dapat diinstal jika itu format target.
- Uji pada perangkat nyata; jangan hanya mengandalkan emulator.
- Uji izin file, rotasi layar, background/resume, storage rendah, file besar, pembatalan ekspor, dan crash.
- Periksa ukuran APK, startup, memori, waktu ekspor, audio sync, dan output dimensions.

Keamanan/privasi:
- Pastikan tidak ada secret di bundle.
- Pastikan tidak ada upload media otomatis.
- Pastikan database tidak menyimpan media biner.
- Pastikan fitur cloud jika ada menerapkan TTL dan otorisasi.

Buat docs/TEST_MATRIX.md berisi perangkat, OS, browser, file uji, fitur, hasil, waktu, bug, dan status. Buat release checklist dan dokumentasikan keterbatasan yang belum selesai. Jangan menulis “semua fitur berhasil” tanpa hasil tes.
```

## Prompt 10 --- Audit akhir dan daftar keterbatasan

``` text
Audit repository dan bandingkan implementasi dengan PRD dan seluruh kriteria penerimaan.

Buat laporan:
- Fitur yang benar-benar selesai dan bukti tesnya.
- Fitur parsial, mock, atau belum tersedia.
- Platform/browser/perangkat yang diuji.
- Resolusi, FPS, codec, format foto/video yang sudah diuji.
- Bug dan risiko tersisa.
- Performa dan batas ukuran file yang ditemukan.
- Apakah APK dapat dibangun dan diinstal.
- Apakah cloud sync aktif atau belum dibuat.
- Apakah AI memang belum diimplementasikan.

Jangan mengubah status fitur menjadi selesai tanpa bukti. Perbaiki bug prioritas tinggi, jalankan kembali tes terkait, dan tulis langkah menjalankan proyek dari kondisi bersih.
```

## Cara menggunakan prompt

1.  Buka repository di IDE AI.
2.  Tempel Prompt 0, lalu Prompt 1.
3.  Periksa laporan technical spike dan hasil uji.
4.  Lanjutkan satu prompt per tahap; jangan tempel semuanya sekaligus.
5.  Setelah tiap tahap, jalankan aplikasi dan periksa file serta tes.
6.  Jika video encoding atau 4K belum terbukti, tunda fitur tersebut
    daripada membuat tombol palsu.
7.  Simpan perubahan menggunakan version control agar mudah kembali jika
    implementasi AI merusak tahap sebelumnya.
