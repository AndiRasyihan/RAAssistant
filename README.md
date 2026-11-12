# RA Assistant

Island desktop ("dynamic island") untuk Windows 11 dengan maskot **Rara**. Ringan, semua data lokal, tanpa akun.

Dibangun dengan Electron + JavaScript biasa. Agar lolos **Smart App Control (SAC)**, aplikasi selalu dijalankan
lewat `electron.exe` **bawaan paket npm** (tidak di-repack / tidak di-rename), dan semua fitur khusus Windows memakai
satu proses helper PowerShell (WinRT/COM) — tanpa modul native atau .exe/.dll buatan sendiri.

## Menjalankan

Prasyarat: Node.js (sudah ada di laptop ini).

```powershell
cd "C:\Users\Rasyihan's\Projects\RAAssistant"
npm install          # sekali saja; mengunduh electron & qrcode
npm start            # menjalankan RA Assistant
```

Saat pertama kali dijalankan, RA otomatis membuat:

- Pintasan **Start Menu** → `RA Assistant`
- Pintasan **Startup** (jalan otomatis saat Windows mulai) — bisa dimatikan di *Pengaturan → Umum*

Kedua pintasan menunjuk ke `node_modules\electron\dist\electron.exe "<folder proyek>"`, jadi SAC tetap mengizinkan.
Untuk membuat ulang pintasan secara manual: `npm run install-shortcuts`.

Menjalankan RA lagi saat sudah berjalan akan membuka jendela **Pengaturan**. Pengaturan juga bisa dibuka dari ikon tray
(klik kanan) atau ikon ⚙ di island.

## Cara pakai island

| Gestur | Aksi |
| --- | --- |
| Arahkan kursor ke island | Membuka panel dengan tab |
| Gulir di island | Volume |
| Klik dua kali | Putar / jeda musik |
| Geser horizontal (touchpad) saat terbuka | Pindah tab |
| Klik / seret bilah progres | Lompat posisi lagu |
| Klik baris lirik | Lompat ke baris itu |
| Seret file ke island | Disimpan di Rak; seret keluar ke aplikasi lain |
| Ctrl+Shift+S | Menu tangkap layar / hentikan rekaman |

Tab: **Musik, Agen, Hari ini, Ibadah, Rak, Timer, Pengingat, Minum, Tangkap** (urutan & tampil bisa diatur di
*Pengaturan → Perilaku*).

## Tab Agen AI (Copilot, VS Code, Antigravity)

Menampilkan apa yang sedang dikerjakan agen AI: langkah/tool saat ini, pesan terakhir, status
(Bekerja / Menunggu Anda / Selesai / Gagal), dan lama berjalan. Island menampilkan pil saat agen bekerja atau butuh
input, dan memberi tahu saat agen selesai.

Saat agen **bertanya**, kartu jawaban langsung turun dari notch (tanpa perlu membuka panel): pilihan A/B/C bisa
diklik, ada kotak **Jawaban lain…**, atau **Izinkan / Tolak** untuk permintaan izin. Kartu hilang sendiri setelah
pertanyaan terjawab (di island maupun di aplikasinya). Jika gagal terkirim, kartu muncul lagi dengan pesan kesalahan.

| Sumber | Cara membaca status | Menjawab dari island |
| --- | --- | --- |
| GitHub Copilot app & Copilot CLI | Memantau `%USERPROFILE%\.copilot\session-state\<id>\events.jsonl` | Pilihan `ask_user` & izin: tombol di island menekan tombol yang sama di aplikasi Copilot lewat UI Automation (**eksperimental** — sesi tsb harus sedang tampil di aplikasi Copilot) |
| VS Code (Copilot Chat mode agen) | File sesi chat `workspaceStorage\*\chatSessions\*.jsonl` + ekstensi RA Agent Bridge | **Izinkan / Lewati** tool dan **balas** pesan (perintah resmi `workbench.action.chat.*`) |
| Antigravity IDE | Database `%USERPROFILE%\.gemini\antigravity-ide\conversations\*.db` + ekstensi | **Terima / Tolak** perintah dan **kirim prompt** ke panel agen (`antigravity.*`) |
| Antigravity (aplikasi agen) | Database `%USERPROFILE%\.gemini\antigravity\conversations\*.db` | Hanya status + tombol **Buka** (belum ada API untuk menjawab) |

### Memasang ekstensi editor (RA Agent Bridge)

Cara termudah: *Pengaturan → Agen AI → Pasang / perbarui*. RA membuat file `.vsix` lalu memasangnya ke VS Code dan
Antigravity IDE yang terdeteksi. Setelah itu jalankan **Developer: Reload Window** di editor.

Manual (jika perlu):

```powershell
node -e "console.log(require('./app/main/agents/install.js').buildVsix().file)"
code --install-extension <file.vsix> --force
antigravity-ide --install-extension <file.vsix> --force
```

Ekstensi hanya berbicara ke `127.0.0.1` memakai token acak yang ditulis RA ke `%APPDATA%\RAAssistant\bridge.json`.
Perintah `RA Agent Bridge: Show status` di editor menampilkan status koneksi.

## Fitur lain

- **Musik**: lagu yang diputar dari Spotify/YouTube/pemutar apa pun (Windows media session), kontrol, lirik tersinkron
  dari LRCLIB (offset per lagu & tandai lirik salah), lirik tetap di atas game borderless/fullscreen (klik-tembus).
  Lirik **tidak hanya untuk Spotify**: judul ala YouTube ("Artis - Judul (Official Video)", "- Topic", VEVO, dll.)
  dibersihkan dulu agar cocok. Lirik hanya tampil jika lagunya ada di LRCLIB.
- **OSD**: volume, kecerahan, Caps Lock di island.
- **Notifikasi**: notifikasi Windows tampil ringkas di island (klik membuka aplikasi), kode OTP bisa disalin sekali
  klik (tidak masuk riwayat clipboard).
- **Rapat**: deteksi otomatis saat aplikasi rapat memakai kamera/mik >6 detik (musik dijeda, notifikasi ditahan lalu
  diringkas), tombol bisukan **semua** mikrofon, titik hijau (kamera) / oranye (mik).
- **Kabar sistem**: earbuds Bluetooth tersambung + baterai, unduhan Chrome/Edge/Firefox, internet putus/tersambung
  (dengan lama putus), tawaran melanjutkan musik setelah kunci/tidur ≥5 menit.
- **Ibadah**: jadwal sholat offline kriteria Kemenag (JAKIM untuk Malaysia) — sudah dicocokkan dengan jadwal resmi;
  hitung mundur 10 menit; adzan (suara bawaan CC0, bisa pilih file sendiri) dengan jeda musik; Imsak & berbuka saat
  Ramadan (kalender Umm al-Qura); mode jadwal ibadah mingguan kustom.
- **Kesehatan**: pengingat minum (target & jadwal dari tab Minum), istirahat mata 20–60 menit — Rara memperagakan senam mata.
- **Hari ini**: kalender, libur nasional Indonesia (dihitung offline), agenda + iCal (Google/Outlook/iCloud) dengan
  tombol **Gabung** Meet/Zoom/Teams, hitung mundur 10 menit sebelum acara, daftar tugas, cuaca & peringatan hujan
  (Open-Meteo).
- **Timer**: timer, stopwatch (putaran), mode Fokus Pomodoro (menahan notifikasi), pil yang bisa dilepas & diseret.
- **Tangkap**: area / layar penuh (disimpan ke `Gambar\Screenshots` + disalin), rekam layar MP4 (audio sistem + mik
  opsional) ke `Video\Captures`. Island tidak ikut tertangkap (bisa diubah).
- **Rak & Ponsel**: tahan file sementara; kirim file & teks laptop⇄ponsel lewat Wi‑Fi (pindai QR sekali). Hanya
  berjalan di jaringan **Pribadi**.
- **Riwayat clipboard** (opsional): teks & gambar, tetap ada saat RA ditutup, **terhapus total saat laptop
  dimatikan/restart** (disimpan di `%LOCALAPPDATA%\RAAssistant\Cache\clipboard` bersama waktu boot). OTP dan salinan
  dari pengelola kata sandi tidak disimpan.
- **Tampilan**: pil mengambang atau notch, 5 tema (Grafit, Embun, Laguna, Warna Sampul, Pendar Sampul), warna aksen,
  ukuran 75–130%, pilih monitor, mengecil otomatis di atas jendela maksimal, sembunyi di aplikasi layar penuh,
  Bahasa Indonesia / English tanpa restart.
- **Maskot Rara** (sepasang mata, agar jelas di notch kecil): 17 ekspresi — biasa, senang, mengedip, suka, kaget,
  berpikir (agen bekerja), bingung (agen bertanya), fokus (Pomodoro), bergoyang (musik), mengantuk, tidur (laptop
  diam/larut malam), pusing & kepanasan (CPU sibuk), sedih (internet putus), marah (baterai 10–20%), lemas (<10%),
  puas (baterai penuh). Ikon kecil kamera/mik/charger, aksesori (kacamata/topi/headphone), mata santai atau
  mengikuti kursor. Galeri ekspresi ada di *Pengaturan → Maskot*.

## Ringan & efisien

- Satu proses helper PowerShell untuk semua sensor sistem; ia hanya mengirim pesan saat ada **perubahan**.
- Status agen dibaca secara **event-driven** (`fs.watch`) dengan pembacaan inkremental (hanya bagian file yang baru).
- Jendela Pengaturan dihancurkan saat ditutup; overlay lirik/pil hanya dibuat saat dibutuhkan.
- Animasi island memakai CSS; render ulang hanya bila isi berubah.

## Keterbatasan (karena Smart App Control / Windows)

- Tidak ada `.exe` installer sendiri; RA berjalan lewat `electron.exe` resmi (lihat pintasan).
- Menjawab Copilot app memakai UI Automation (bergantung pada tampilan aplikasi Copilot; bisa berubah saat aplikasi
  diperbarui). Aplikasi agen Antigravity (non-IDE) belum bisa dijawab dari luar.
- Suhu CPU sebenarnya butuh hak admin, jadi reaksi "kepanasan" memakai beban CPU tinggi berkelanjutan.
- Notifikasi dibaca dari database notifikasi lokal Windows (read-only); notifikasi yang dimatikan oleh Windows/Focus
  tidak akan muncul.
- Fitur ponsel butuh jaringan Wi‑Fi bertipe **Pribadi** (Pengaturan → Jaringan & Internet → Wi‑Fi → Properti).
- Libur nasional: tanggal Islam memakai kalender Umm al-Qura (keputusan sidang isbat bisa berbeda satu hari); cuti
  bersama tidak termasuk.

## Data & privasi

- Pengaturan: `%APPDATA%\RAAssistant\settings.json`; data (tugas, agenda, pengingat, rak): `data.json`.
- Cache (lirik, clipboard): `%LOCALAPPDATA%\RAAssistant\Cache`.
- Log galat: `%APPDATA%\RAAssistant\error.log`.
- Koneksi keluar hanya ke LRCLIB (lirik), Open-Meteo (cuaca/geocoding), dan URL iCal Anda.

## Kredit

- Suara adzan bawaan: "Beautiful adhan.ogg" oleh Adam-synagda, Wikimedia Commons, **CC0** (lihat
  `app/assets/adzan/CREDITS.txt`).
- Lirik: [LRCLIB](https://lrclib.net). Cuaca: [Open-Meteo](https://open-meteo.com) (CC BY 4.0).
- Nama, desain, tema, dan maskot RA Assistant adalah karya orisinal proyek ini.
