# Multimedia Editor — React Native (Expo)

App multimedia editor lokal berbasis React Native + Expo.  
Tidak memerlukan backend. Semua editing dilakukan di perangkat.

---

## Prasyarat

- Node.js 18+
- Expo Go app di HP Android ([Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent))
- **Bukan** React Native CLI — project ini menggunakan Expo Managed Workflow

---

## Cara Menjalankan

```bash
cd c:\proyek\multimedia-editor-rn
npm install
npx expo start
```

Scan QR code dengan **Expo Go** di HP Android.

---

## Struktur Folder

```
multimedia-editor-rn/
├── App.tsx                   # Root — screen navigator sederhana
├── app.json                  # Expo config (permissions, splash, icon)
├── src/
│   ├── core/
│   │   ├── types.ts          # Project model, edit-state, HistoryManager
│   │   └── storage.ts        # AsyncStorage project persistence
│   ├── design/
│   │   └── tokens.ts         # Warna, tipografi, spacing
│   └── screens/
│       ├── HomeScreen.tsx    # Dashboard + recent projects
│       ├── PhotoEditorScreen.tsx  # Photo editor lengkap
│       └── VideoEditorScreen.tsx  # Video editor + trim + clip list
```

---

## Fitur

### Photo Editor
- ✅ Import foto dari galeri (expo-image-picker)
- ✅ Preview dengan transformasi (rotate, flip)
- ✅ Adjustment: brightness, contrast, saturation
- ✅ 6 filter dasar
- ✅ Ekspor ke galeri (expo-image-manipulator + expo-media-library)
- ✅ Simpan & buka kembali proyek (AsyncStorage)
- ✅ Undo/redo multi-level

### Video Editor
- ✅ Import video dari galeri
- ✅ Preview play/pause & seeking (expo-video)
- ✅ Trim awal/akhir
- ✅ Split at playhead
- ✅ Manajemen daftar klip
- ✅ Volume dan audio enable/disable
- ✅ Adjustment preview
- ✅ Simpan proyek
- ⚠️ **Ekspor video dengan encoding** memerlukan library tambahan:
  - `ffmpeg-kit-react-native` — full encoding tapi ukuran binary besar (~40 MB)
  - `react-native-video-trim` — trim sederhana

### Penyimpanan
- AsyncStorage menyimpan edit-state dan metadata saja
- **Tidak menyimpan bytes foto/video**
- Data hilang jika aplikasi dihapus

---

## Keterbatasan yang Diketahui

| Item | Status |
|------|--------|
| Video encoding/export dengan trim | ❌ Perlu library tambahan |
| Text overlay on canvas | ❌ Perlu Skia |
| EXIF orientation (RN) | ⚠️ expo-image-manipulator menangani ini otomatis |
| 4K video | ⚠️ Tergantung perangkat |
| iOS | ⚠️ Perlu Mac untuk build |

---

## Build APK (Production)

```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Konfigurasi build
eas build:configure

# Build APK
eas build --platform android --profile preview
```

Atau menggunakan Expo Go untuk development/testing tanpa build APK.

---

## Cara Uji di Android dengan Expo Go

1. Install Expo Go dari Play Store
2. Jalankan `npx expo start` di komputer
3. Pastikan HP dan komputer di jaringan WiFi yang sama
4. Scan QR code di terminal/browser dengan Expo Go
