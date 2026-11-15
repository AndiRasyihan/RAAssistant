# RA Assistant – checklist pengujian (QA)

Versi: **0.2.0** · Diuji: 15 Nov 2026 · Windows 11 Home 26300 · laptop pengembang (1920×1080).

Status: ✅ lulus · ⚠️ lulus dengan catatan · ❌ gagal · ⏭️ belum diuji di putaran ini (lulus di putaran sebelumnya).

## Otomatis

| Perintah | Cakupan | Hasil |
| --- | --- | --- |
| `npm test` | 28 unit test: jadwal sholat vs **jadwal resmi Kemenag** (Jakarta & Makassar, 4 musim), urutan waktu & Imsak, kota bawaan, Hijriah; libur nasional 2026 vs SKB 3 Menteri; iCal (all-day, batal, link rapat, RRULE mingguan); OTP (ID/EN) & bukan-OTP; parsing notifikasi; hapus clipboard saat reboot; teks mirip OTP tidak disimpan; parsing LRC; pembersihan judul YouTube & kueri lirik; agregasi waktu layar (tengah malam, kunci/tidur, gabung aplikasi, pangkas 14 hari); parser sesi Copilot (ask_user, izin, baris terpotong, JSON rusak) | ✅ 28/28 |
| `npm run qa:lifecycle` | Island bertahan dari WM_CLOSE (Alt+F4 / "End task"), renderer dimatikan paksa, peluncuran kedua (tetap 1 instance), menutup jendela Pengaturan | ✅ 6/6 (dev & versi terpasang) |
| `RA Assistant.exe --qa-stress` (saat RA berjalan) | 2.700 notifikasi/OSD/status agen, ganti bahasa ×2; mencatat memori & jumlah listener ke `events.log` | ✅ tanpa kebocoran (lihat bawah) |

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
| 8 | Island bisa "macet terbuka" setelah mengetik/menyeret di luar island; File Explorer selebar layar dianggap layar penuh | (perubahan tertunda yang sudah ada, diperiksa & di-commit) |

## Ketahanan & sumber daya (versi terpasang)

| Item | Hasil |
| --- | --- |
| Memori saat diam | ±170 MB private (RA Assistant.exe + helper) ✅ |
| CPU saat diam | main 0,05 %, helper PowerShell 0,06 %, renderer ±1–2 % saat agen Copilot sedang aktif menulis log ⚠️ |
| Stres 2.700 event ×3 putaran | renderer stabil ±164 MB setelah pemanasan pertama, heap main 6–7 MB, listener bus tetap 28, handler IPC tetap 70 ✅ |
| Dengar (Whisper) | Hanya hidup saat mendengarkan (±0,6–1 GB), dilepas saat berhenti ✅ |

## Installer (.exe)

| Item | Hasil |
| --- | --- |
| Build `npm run dist` → `dist\RA Assistant Setup 0.2.0.exe` (±109 MB, x64, NSIS, per-user, tanpa admin) | ✅ |
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

## Cara menjalankan ulang

```powershell
npm test                     # unit test
npm run qa:lifecycle         # RA harus sedang berjalan
& "$env:LOCALAPPDATA\Programs\RA Assistant\RA Assistant.exe" --qa-stress   # lalu lihat %APPDATA%\RAAssistant\events.log
npm run dist                 # buat installer
```
