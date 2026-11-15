# RA Assistant

Island desktop ("dynamic island") untuk Windows 11 dengan maskot **Rara**. Ringan, semua data lokal, tanpa akun.

Dibangun dengan Electron + JavaScript biasa. Semua fitur khusus Windows memakai satu proses helper PowerShell
(WinRT/COM) — tanpa modul native. Tersedia sebagai installer `.exe` atau dijalankan dari kode sumber.

## Instal (.exe) — cara termudah

1. Unduh **`RA Assistant Setup 0.2.0.exe`** dari halaman
   [Releases](https://github.com/AndiRasyihan/RAAssistant/releases) (atau buat sendiri, lihat di bawah).
2. Jalankan. Installer **tidak perlu admin**: dipasang untuk akun Anda saja di
   `%LOCALAPPDATA%\Programs\RA Assistant`, plus pintasan Start Menu & Desktop.
3. Installer belum ditandatangani secara digital, jadi Windows SmartScreen bisa menampilkan
   *"Windows protected your PC"* → klik **More info → Run anyway**. Bila **Smart App Control** aktif, aplikasi tanpa
   tanda tangan bisa diblokir; gunakan cara "dari kode sumber" di bawah (versi `electron.exe` bawaan lolos SAC).
4. RA berjalan otomatis setelah dipasang dan setiap Windows dinyalakan (bisa dimatikan di *Pengaturan → Umum*).

**Mencopot**: *Settings → Apps → Installed apps → RA Assistant → Uninstall*. Folder program, semua pintasan (termasuk
autostart) dan entri registry dihapus; installer bertanya apakah pengaturan & data (`%APPDATA%\RAAssistant`,
`%LOCALAPPDATA%\RAAssistant`) juga ikut dihapus.

Membuat installer sendiri: `npm install` lalu `npm run dist` → `dist\RA Assistant Setup <versi>.exe`.

## Menjalankan dari kode sumber (pengembang / Smart App Control aktif)

Prasyarat: Windows 10/11, [Node.js](https://nodejs.org) LTS, dan Git.

```powershell
git clone https://github.com/AndiRasyihan/RAAssistant.git
cd RAAssistant
npm install          # sekali saja; mengunduh electron & qrcode
npm start            # menjalankan RA Assistant
npm test             # 28 unit test (jadwal sholat vs Kemenag, OTP, lirik, waktu layar, dll.)
```

Pada versi kode sumber, RA membuat pintasan **Start Menu** dan **Startup** yang menunjuk ke
`node_modules\electron\dist\electron.exe "<folder proyek>"` (lolos SAC). Buat ulang manual: `npm run install-shortcuts`.
Jika versi `.exe` sudah terpasang, versi terpasang mengambil alih pintasan sehingga hanya satu RA yang berjalan.

Island **tidak bisa ditutup** dengan Alt+F4 / "End task" (agar notch tidak hilang); bila crash, island dibuat ulang
otomatis. Keluar sepenuhnya hanya lewat ikon tray → **Keluar** (atau *Pengaturan → Umum → Keluar*). Menjalankan RA lagi
saat sudah berjalan memunculkan island dan membuka **Pengaturan**. Kejadian seperti ini dicatat di
`%APPDATA%\RAAssistant\events.log`; error di `error.log`.

Hasil pengujian lengkap: [docs/TESTING.md](docs/TESTING.md).
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
- **Kabar sistem**: unduhan Chrome/Edge/Firefox, internet putus/tersambung
  (dengan lama putus), tawaran melanjutkan musik setelah kunci/tidur ≥5 menit.
- **Animasi perangkat & koneksi**: charger dicolok (baterai terisi + persen naik) / dicabut; Wi‑Fi tersambung
  (nama jaringan + kekuatan sinyal) / terputus, kabel LAN; Bluetooth tersambung/terputus dengan gambar sesuai jenis
  (headphone, earbuds TWS, speaker, mouse, keyboard, ponsel, stik game, jam) + persen baterai bila Windows
  menyediakannya; USB / Type‑C dicolok/dicabut (mouse, keyboard, flashdisk/HDD + huruf drive, ponsel, kamera, audio
  USB, tethering); monitor eksternal (HDMI, DisplayPort / USB‑C, Miracast). Per jenis bisa dimatikan dan ada tombol
  **Putar demo** di *Pengaturan → Rapat & Notifikasi → Perangkat & koneksi*. Berbasis event Windows (bukan polling),
  jadi helper tetap ±0,06 % CPU.
- **Ibadah**: jadwal sholat offline kriteria Kemenag (JAKIM untuk Malaysia) — sudah dicocokkan dengan jadwal resmi;
  hitung mundur 10 menit; adzan (suara bawaan CC0, bisa pilih file sendiri) dengan jeda musik; Imsak & berbuka saat
  Ramadan (kalender Umm al-Qura); mode jadwal ibadah mingguan kustom.
- **Kesehatan**: pengingat minum (target & jadwal dari tab Minum), istirahat mata 20–60 menit — Rara memperagakan senam mata.
- **Hari ini**: kalender, libur nasional Indonesia (dihitung offline), agenda + iCal (Google/Outlook/iCloud) dengan
  tombol **Gabung** Meet/Zoom/Teams, hitung mundur 10 menit sebelum acara, daftar tugas, cuaca & peringatan hujan
  (Open-Meteo).
- **Timer**: timer, stopwatch (putaran), mode Fokus Pomodoro (menahan notifikasi), pil yang bisa dilepas & diseret.
- **Tangkap**: area / layar penuh (disimpan ke `Gambar\Screenshots` + disalin), rekam layar MP4 (audio sistem + mik
  opsional) ke `Video\Captures`. Island tidak ikut tertangkap secara bawaan; centang **Ikutkan notch** (tab Tangkap)
  atau *Pengaturan → Tangkap Layar* agar island ikut di tangkapan RA, Snipping Tool, OBS, dll.
- **Dengar (suara → teks)**: transkripsi langsung dari mikrofon atau audio sistem (video/rapat di laptop), Bahasa
  Indonesia / English, tombol **Salin** ke clipboard. Memakai Whisper secara **offline**; mesin (±30 MB) dan model
  (±80 MB) diunduh sekali saat pertama dipakai. Mesin hanya hidup selama mendengarkan (±0,6–1 GB RAM), lalu dilepas;
  berhenti sendiri setelah 2 menit tanpa suara. Jika mik dibisukan di Windows, tab menampilkan peringatan + tombol
  **Aktifkan mik**.
- **Layar (waktu layar)**: lama layar aktif, diam, terkunci, dan tidur/standby per hari, aplikasi yang tampil di
  depan beserta durasinya, grafik 7 hari. Hanya disimpan lokal (14 hari); bisa dimatikan/dihapus di
  *Pengaturan → Perilaku*. Ringan: memakai event jendela aktif yang sudah ada + satu timer 30 detik.
- **Rak & Ponsel**: tahan file sementara; kirim file & teks laptop⇄ponsel lewat Wi‑Fi (pindai QR sekali). Hanya
  berjalan di jaringan **Pribadi**.
- **Riwayat clipboard** (opsional): teks & gambar, tetap ada saat RA ditutup, **terhapus total saat laptop
  dimatikan/restart** (disimpan di `%LOCALAPPDATA%\RAAssistant\Cache\clipboard` bersama waktu boot). OTP dan salinan
  dari pengelola kata sandi tidak disimpan.
- **Tampilan**: pil mengambang atau notch, 5 tema (Grafit, Embun, Laguna, Warna Sampul, Pendar Sampul), warna aksen,
  ukuran 75–130%, pilih monitor, mengecil otomatis di atas jendela maksimal, sembunyi di aplikasi layar penuh,
  Bahasa Indonesia / English tanpa restart. Teks panjang tidak lagi terpotong "…": lirik dibungkus ke baris
  berikutnya, island melebar mengikuti baris lirik, dan label satu baris yang tetap tidak muat berjalan (running text).
- **Notch di browser**: saat Chrome/Edge/Firefox/Brave/Opera dll. aktif, island menyusut jadi notch tipis di tepi
  atas (tanpa pil jam) supaya tidak menutupi tab & bilah alamat. Island hanya terbuka bila kursor **diam tepat di
  notch** (jeda 0,25 detik, bisa diatur), tidak sekadar lewat di dekatnya. Daftar browser, area pemicu (Pas di notch /
  Lebar) dan jedanya diatur di *Pengaturan → Perilaku*.
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

## Keterbatasan

- Installer `.exe` belum ditandatangani secara digital (SmartScreen memperingatkan; Smart App Control bisa memblokir —
  pakai versi kode sumber bila SAC aktif).
- Menjawab Copilot app memakai UI Automation (bergantung pada tampilan aplikasi Copilot; bisa berubah saat aplikasi
  diperbarui). Aplikasi agen Antigravity (non-IDE) belum bisa dijawab dari luar.
- Suhu CPU sebenarnya butuh hak admin, jadi reaksi "kepanasan" memakai beban CPU tinggi berkelanjutan.
- Notifikasi dibaca dari database notifikasi lokal Windows (read-only); notifikasi yang dimatikan oleh Windows/Focus
  tidak akan muncul.
- Fitur ponsel butuh jaringan Wi‑Fi bertipe **Pribadi** (Pengaturan → Jaringan & Internet → Wi‑Fi → Properti).
- Libur nasional: tanggal Islam memakai kalender Umm al-Qura (keputusan sidang isbat bisa berbeda satu hari); cuti
  bersama tidak termasuk.
- Baterai Bluetooth: Windows hanya memberi **satu** angka per perangkat, jadi baterai kiri/kanan/case earbuds tidak
  bisa dipisah; sebagian perangkat tidak melaporkan baterai sama sekali. Port Type‑C tidak bisa dibedakan dari USB-A
  oleh Windows, kecuali monitor lewat USB‑C (tampil sebagai DisplayPort / USB‑C).

## Data & privasi

- Pengaturan: `%APPDATA%\RAAssistant\settings.json`; data (tugas, agenda, pengingat, rak): `data.json`.
- Cache (lirik, clipboard): `%LOCALAPPDATA%\RAAssistant\Cache`.
- Log galat: `%APPDATA%\RAAssistant\error.log`.
- Koneksi keluar hanya ke LRCLIB (lirik), Open-Meteo (cuaca/geocoding), URL iCal Anda, dan — sekali saja saat fitur
  Dengar pertama dipakai — jsDelivr (mesin transformers.js/ONNX) serta Hugging Face (model Whisper). Suara Anda tidak
  pernah dikirim ke internet.

## Kredit

- Suara adzan bawaan: "Beautiful adhan.ogg" oleh Adam-synagda, Wikimedia Commons, **CC0** (lihat
  `app/assets/adzan/CREDITS.txt`).
- Lirik: [LRCLIB](https://lrclib.net). Cuaca: [Open-Meteo](https://open-meteo.com) (CC BY 4.0).
- Transkripsi: [transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0),
  [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT), model [Whisper](https://github.com/openai/whisper) (MIT).
- Nama, desain, tema, dan maskot RA Assistant adalah karya orisinal proyek ini.
