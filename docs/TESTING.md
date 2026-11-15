# RA Assistant – checklist pengujian (QA)

Versi: **0.2.2** · Diuji: 16 Nov 2026 · Windows 11 Home 26300 · laptop pengembang (1920×1080).

Status: ✅ lulus · ⚠️ lulus dengan catatan · ❌ gagal · ⏭️ belum diuji di putaran ini (lulus di putaran sebelumnya).

## Otomatis

| Perintah | Cakupan | Hasil |
| --- | --- | --- |
| `npm test` | 33 unit test: jadwal sholat vs **jadwal resmi Kemenag** (Jakarta & Makassar, 4 musim), urutan waktu & Imsak, kota bawaan, Hijriah; libur nasional 2026 vs SKB 3 Menteri; iCal (all-day, batal, link rapat, RRULE mingguan); OTP (ID/EN) & bukan-OTP; parsing notifikasi; hapus clipboard saat reboot; teks mirip OTP tidak disimpan; parsing LRC; pembersihan judul YouTube & kueri lirik; agregasi waktu layar (tengah malam, kunci/tidur, gabung aplikasi, pangkas 14 hari); parser sesi Copilot (ask_user, izin, baris terpotong, JSON rusak); jenis perangkat Bluetooth dari class-of-device/kategori/nama (headphone, TWS, speaker, mouse, keyboard, stik game, ponsel, BLE); jenis PnP & pengabaian HID Bluetooth/disk internal; diff + ringkas satu notifikasi per colokan (huruf drive, kabel charge-only); jenis koneksi monitor (HDMI, DP/USB‑C, internal); parsing `netsh wlan` (tersambung, terputus, fallback nama profil) | ✅ 33/33 |
| `npm run qa:lifecycle` | Island bertahan dari WM_CLOSE (Alt+F4 / "End task"), renderer dimatikan paksa, peluncuran kedua (tetap 1 instance), menutup jendela Pengaturan | ✅ 6/6 (dev & versi terpasang) |
| `RA Assistant.exe --qa-stress` (saat RA berjalan) | 2.700 notifikasi/OSD/status agen, ganti bahasa ×2; mencatat memori & jumlah listener ke `events.log` | ✅ tanpa kebocoran (lihat bawah) |
| `RA Assistant.exe --qa-devices` | Memutar 11 animasi perangkat dan menyimpan bingkainya ke `%TEMP%\ra_dv` (bisa saat layar terkunci) | ✅ 11/11 (dev & terpasang) |
| `RA Assistant.exe --qa-tabs` | Membuka semua tab island satu per satu, bingkai ke `%TEMP%\ra_tabs` | ✅ 10/10 tab tampil dengan data |
| `RA Assistant.exe --qa-settings=<bagian>[:end]` | Membuka bagian Pengaturan & menyimpan tangkapan ke `%TEMP%\ra_settings.png` | ✅ |

## Bug yang ditemukan & diperbaiki di putaran ini

| # | Bug | Perbaikan |
| --- | --- | --- |
| 1 | **Notch hilang** padahal proses RA masih jalan: jendela island bisa ditutup (Alt+F4 saat mengetik di island, "End task", WM_CLOSE) dan tidak pernah dibuat ulang; setelahnya error "Object has been destroyed" tiap 120 ms | Island menolak ditutup; dibuat ulang otomatis bila tertutup/crash/hang; watchdog 15 dtk; membuka RA lagi memunculkan island; semua kejadian dicatat di `events.log` |
| 2 | Setelah ganti bahasa, semua tombol tab terpasang dua kali (mis. **+1 gelas menambah 2**) | Island dimuat ulang bersih saat bahasa berganti |
| 3 | Waktu **Terbit 2–3 menit terlambat** & Dhuha 1 menit lebih awal dibanding Kemenag | Ihtiyath disetel ulang; semua waktu kini ≤1 menit dari Kemenag, Maghrib tidak pernah lebih awal |
| 4 | Waktu layar: setelah bangun dari sleep, waktu di layar kunci dihitung "aktif"; "mulai" bisa tercatat saat layar terkunci | Status terkunci diingat melewati sleep; jam mulai hanya dari pemakaian nyata |
| 5 | Autostart **ON** di pengaturan tetapi pintasan Startup hilang → RA tidak ikut menyala saat Windows mulai | Versi terpasang menyinkronkan pintasan Startup dengan pengaturan setiap kali dibuka |
| 6 | Animasi (running text, mata maskot, equalizer) tetap berjalan saat island tersembunyi/mengecil → CPU terbuang | Animasi dijeda saat tidak terlihat |
| 7 | Island ikut memperbarui UI setiap kali log agen berubah walau isinya sama | Pembaruan agen hanya dikirim bila ada yang berubah |
| 9 | Animasi terus-menerus (pendar tema, spinner, titik berpikir, kedip mata) digambar ulang 60×/detik tanpa GPU → renderer ±1,9 % CPU | Animasi latar kini bertahap 6–12 fps; renderer turun ke ±0,8 % |
| 8 | Island bisa "macet terbuka" setelah mengetik/menyeret di luar island; File Explorer selebar layar dianggap layar penuh | (perubahan tertunda yang sudah ada, diperiksa & di-commit) |

### Putaran 0.2.1–0.2.2

| # | Bug | Perbaikan |
| --- | --- | --- |
| 10 | Island muncul di **taskbar** setiap kali mengetik di island (Electron `setFocusable(true)` memanggil `SetSkipTaskbar(false)`), lalu "Close window" dari taskbar menargetkannya | `skipTaskbar` dipasang ulang setelah setiap perubahan fokus |
| 11 | Tombol "Keluar" di Pengaturan langsung menutup RA tanpa konfirmasi | Konfirmasi Keluar/Batal (default Batal); sumber keluar dicatat; `app.quit()` dari jalur lain ditolak (logoff/shutdown tetap boleh) |
| 12 | `Get-PnpDeviceProperty` dengan array InstanceId mengembalikan ID yang tertukar → status Bluetooth bisa salah perangkat | Dipanggil lewat pipeline (pemetaan benar) |
| 13 | Notifikasi pendek yang antre saat panel terbuka tampil basi beberapa menit kemudian | Notifikasi perangkat kedaluwarsa setelah 12 dtk & tidak ditahan saat Fokus/Rapat |
| 14 | Saat Wi‑Fi putus, notifikasi "Internet terputus" bertumpuk dengan animasi Wi‑Fi | Notifikasi internet ditunda 4,5 dtk & dilewati bila animasi Wi‑Fi baru saja tampil |

## Ketahanan & sumber daya (versi terpasang)

| Item | Hasil |
| --- | --- |
| Memori saat diam | ±170 MB private (RA Assistant.exe + helper) ✅ |
| CPU saat diam | main 0,02–0,05 %, helper PowerShell 0,06–0,08 %, renderer ±0,6–0,8 % (sebelumnya ±1,9 %) dengan tema Pendar Sampul + agen Copilot aktif; tetap sama setelah fitur animasi perangkat (event-driven, scan hanya saat ada perubahan) ✅ |
| Stres 2.700 event ×3 putaran + 3× demo perangkat | renderer stabil ±180 MB setelah pemanasan, heap main 7 MB, listener bus tetap 32, handler IPC tetap 71 ✅ |
| Dengar (Whisper) | Hanya hidup saat mendengarkan (±0,6–1 GB), dilepas saat berhenti ✅ |

## Installer (.exe)

| Item | Hasil |
| --- | --- |
| Build `npm run dist` → `dist\RA Assistant Setup 0.2.2.exe` (±109 MB, x64, NSIS, per-user, tanpa admin) | ✅ |
| Pasang (biasa & `/S`), pintasan Start Menu + Desktop → `RA Assistant.exe` | ✅ |
| Pintasan lama versi dev (`electron.exe <folder>`) diarahkan ulang; hanya satu RA yang jalan | ✅ |
| Aplikasi terpasang: island, Pengaturan, tab Ibadah (cocok Kemenag hari itu), Minum, ganti bahasa, helper PowerShell dari `app.asar.unpacked`, transkripsi Dengar, pembuatan `.vsix` ekstensi editor | ✅ |
| Pasang ulang di atas versi lama (upgrade) | ✅ |
| Copot saat RA sedang jalan: proses dihentikan, folder program, 3 pintasan & entri registry hilang; data pengguna dihapus hanya bila dijawab "Ya" | ✅ |
| Tanda tangan digital | ⚠️ tidak ada (SmartScreen akan memperingatkan) |

## Fitur (manual)

| Fitur | Status | Catatan |
| --- | --- | --- |
| Island tampil, hover membuka, notch di browser hanya terbuka bila kursor diam di notch | ✅ | |
| Musik: SMTC, kontrol, lirik (Spotify & YouTube di browser), thumbnail video | ✅ | Lirik bergantung pada ketersediaan di LRCLIB |
| Ibadah: jadwal offline, hitung mundur | ✅ | Adzan & jeda musik ⏭️ |
| Minum: +1/−1 tepat satu gelas | ✅ | |
| Agen: status Copilot, kartu pertanyaan, jawab dari notch | ⏭️ | Diuji di putaran sebelumnya |
| Tangkap: screenshot, ikutkan notch | ⏭️ | |
| Dengar (mik/audio sistem), Salin | ✅ | Mik laptop sempat dibisukan di Windows |
| Waktu layar | ✅ | via unit test + tab Layar |
| Rak & Ponsel | ⏭️ | Ponsel hanya di jaringan Wi‑Fi **Pribadi** |
| Hari ini, cuaca, iCal | ⏭️ / ✅ (parser) | |
| Animasi charger dicolok/dicabut | ✅ | Diuji fisik di versi terpasang (`device charger off/on 98%`) |
| Animasi Wi‑Fi putus/tersambung (nama + sinyal) | ✅ | `netsh wlan disconnect/connect` di versi terpasang; tanpa notifikasi internet ganda |
| Animasi Bluetooth (headphone + baterai) | ✅ | Diuji fisik: headphone diputus & disambung lagi |
| Animasi USB dicolok/dicabut | ✅ | Diuji fisik dengan keyboard USB; flashdisk/ponsel/kamera via unit test |
| Animasi monitor eksternal (HDMI / USB‑C) | ⚠️ | Belum ada monitor untuk uji fisik; logika lewat unit test, kueri WMI monitor diperiksa |
| Event perangkat (WM_DEVICECHANGE) memicu scan | ✅ | Diuji dengan memasang/melepas image ISO |
| Island tidak muncul di taskbar setelah mengetik di island | ✅ | Penyebab dikonfirmasi di kode sumber Electron 45 |

## Cara menjalankan ulang

```powershell
npm test                     # unit test
npm run qa:lifecycle         # RA harus sedang berjalan
& "$env:LOCALAPPDATA\Programs\RA Assistant\RA Assistant.exe" --qa-stress   # lalu lihat %APPDATA%\RAAssistant\events.log
& "$env:LOCALAPPDATA\Programs\RA Assistant\RA Assistant.exe" --qa-devices  # bingkai animasi di %TEMP%\ra_dv
& "$env:LOCALAPPDATA\Programs\RA Assistant\RA Assistant.exe" --qa-tabs     # bingkai semua tab di %TEMP%\ra_tabs
npm run dist                 # buat installer
```
