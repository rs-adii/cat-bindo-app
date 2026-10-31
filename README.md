# EvalSMK — Sesuai Use Case, ERD, Flowchart, dan Mockup

EvalSMK (sebelumnya bernama SIEP SMK) adalah penulisan ulang total dari prototipe sebelumnya, dibangun
mengikuti tiga diagram perancangan: **Use Case Diagram**, **ERD**, dan **Flowchart**
mesin tes adaptif. Tampilannya mengikuti **16 mockup halaman di Bab III**
(`desain_bab3.docx`) dengan nama aplikasi **EvalSMK**.

## Tampilan (sesuai mockup Bab III)

| Peran | Halaman |
|---|---|
| Semua | Login dengan tab peran (Admin / Guru / Siswa) |
| Admin | Dashboard, Kelola Pengguna, Kelas & Mapel, Pengaturan |
| Guru | Dashboard, Bank Soal (+ impor Excel/CSV), Jadwal Evaluasi, Kuesioner, Hasil Siswa, Rekap Feedback |
| Siswa | Beranda, Evaluasi Saya (Tes Tersedia), Layar Tes, Hasil Evaluasi, Kuesioner Feedback |

- Warna, tipografi (Plus Jakarta Sans, disertakan di `public/fonts/`, lisensi OFL),
  sidebar, kartu, pil tingkat (Mudah hijau / Sedang kuning / Sulit merah), batang,
  dan donat skor diambil dari mockup.
- Tata letak menyesuaikan layar HP: sidebar menjadi menu geser, tabel menjadi
  kartu per baris.
- Layar tes menampilkan sisa waktu dari server (merah pada 1 menit terakhir),
  **Tingkat soal saat ini**, dan **Riwayat jawaban** (benar/salah per soal).
  Tombol A–D dan Enter di papan ketik bisa dipakai.
- Login memeriksa tab peran: akun siswa yang masuk lewat tab Guru ditolak dengan
  pesan yang jelas.
- Jadwal tes bertanggal di masa depan tampil "Belum dibuka" bagi siswa; status
  tes di sisi guru (Terjadwal / Berjalan / Selesai) dihitung dari tanggal WIB.

## Menjalankan

Butuh Node.js 18+.

```bash
cd evalsmk
npm install
npm start
```

Buka `http://localhost:3000`. Database SQLite (`data/evalsmk.db`) dan data awal
dibuat otomatis saat pertama kali dijalankan.

Sudah punya `data/siep.db` dari versi SIEP SMK? Salin ke folder `data/` proyek
ini sebelum `npm start`; berkas itu otomatis dipindahkan menjadi
`data/evalsmk.db` dan datanya dipakai seperti biasa.

**Akun demo** (dibuat otomatis oleh `lib/seed.js`):

| Peran | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Guru | `guru1` | `guru123` |
| Siswa | `siswa1`, `siswa2` | `siswa123` |

Satu tes contoh ("Tes Bahasa Indonesia — Bab Teks Eksposisi", 10 soal) sudah
dijadwalkan untuk kelas XI Bahasa 1 dan siap dikerjakan siswa1/siswa2, lengkap
dengan kuesioner feedback 5 pernyataan.

## Pemetaan ke diagram

**Use Case** → setiap aktor dan aksi di diagram punya rute API dan layar
tersendiri:

| Aktor | Aksi | Rute API | Layar |
|---|---|---|---|
| Admin | Login | `POST /api/auth/login` | Login |
| Admin | Kelola Data Pengguna | `/api/admin/users` (CRUD) | Tab "Kelola Data Pengguna" |
| Admin | Kelola Kelas & Mapel | `/api/admin/kelas`, `/api/admin/mapel` | Tab "Kelola Kelas & Mapel" |
| Guru | Kelola Bank Soal | `/api/guru/soal` (CRUD, hanya soal milik sendiri), `/api/guru/soal/impor` | Tab "Bank Soal" (termasuk impor Excel/CSV) |
| Guru | Atur Jadwal Tes | `/api/guru/tes` (CRUD) | Tab "Jadwal Tes" |
| Guru | Kelola Kuesioner | `/api/guru/kuesioner` | Tab "Kuesioner" |
| Guru | Lihat Hasil & Rekap Feedback | `/api/guru/hasil`, `/api/guru/feedback-summary/:tesId` | Tab "Hasil & Feedback" |
| Siswa | Kerjakan Tes CAT | `/api/siswa/tes/:id/mulai`, `/api/siswa/sesi/:id/jawab`, `/api/siswa/sesi/:id/selesai` | "Tes Tersedia" → alur tes |
| Siswa | Isi Kuesioner Feedback | `/api/siswa/kuesioner/*` | Setelah hasil tes |
| Siswa | Lihat Hasil Tes | `/api/siswa/hasil` | Tab "Riwayat Hasil" |

**ERD** → `data/schema.sqlite.sql` (lokal) dan `data/schema.postgres.sql`
(Supabase, untuk deploy nanti) berisi sepuluh tabel persis sesuai diagram:
`mapel`, `kelas`, `users`, `soal`, `tes`, `kuesioner`, `pertanyaan_kuesioner`,
`sesi_tes`, `jawaban`, `respon_kuesioner`. Empat penyesuaian praktis dari ERD
asli (ditulis sebagai komentar di kepala file skema):

1. `tes.kelas_id` ditambahkan agar relasi "diujikan" (Kelas–TES) bisa
   diimplementasikan — `NULL` berarti tes terbuka untuk semua kelas.
2. `jawaban.level_saat_itu` dan `jawaban.urutan` ditambahkan supaya mesin CAT
   bisa melacak soal "belum pernah muncul" dan progres per sesi.
3. `sesi_tes.mulai` / `sesi_tes.selesai` ditambahkan untuk kebutuhan dasbor guru.
4. `respon_kuesioner.sesi_id` ditambahkan agar feedback terikat ke sesi tes
   tertentu, bukan cuma ke siswa secara umum.

**Flowchart** → `lib/catEngineLevel.js` mengikuti alurnya persis:
tiga tingkat kesulitan (**mudah, sedang, sulit**; tersimpan sebagai 1, 2, 3),
mulai di **level sedang** → jawaban benar → level naik (maks sulit) / salah →
level turun (min mudah) → ambil soal sesuai level yang **belum pernah muncul** →
ulangi sampai `jumlah_soal` pada tabel `tes` tercapai atau waktu habis → hitung
**nilai berbobot** dan level akhir → simpan ke `sesi_tes` → siswa isi
kuesioner → simpan ke `respon_kuesioner` → guru lihat hasil & rekap.

Catatan: ini **bukan** model Rasch/IRT — sesuai proposal (bagian 2.3–2.4),
pendekatannya sengaja disederhanakan menjadi level naik/turun tanpa perhitungan
statistik yang rumit.

## Tiga level dan nilai berbobot

Sesuai proposal, soal dikelompokkan ke **tiga tingkat kesulitan**: mudah (1),
sedang (2), sulit (3). Tes dimulai dari soal sedang.

**Nilai akhir berbobot level soal** (soal sulit bernilai lebih tinggi):

```
nilai = (jumlah bobot soal yang dijawab benar) / (jumlah bobot semua soal) x 100
bobot: mudah = 1, sedang = 2, sulit = 3 (bobot memakai level SOAL yang dijawab)
```

Contoh: benar pada soal sulit (3) dan salah pada soal mudah (1) = 3/4 = 75;
kebalikannya = 1/4 = 25. Saat waktu habis, soal yang belum sempat dijawab
dihitung salah dengan bobot level siswa saat itu. Bobot ada di
`lib/catEngineLevel.js` (`BOBOT_LEVEL`). Admin bisa mematikan bobot lewat
Pengaturan ("Bobot skor per level"); semua soal lalu bernilai sama.

## Materi soal

Setiap soal punya kolom **materi** (opsional, mis. Ejaan, Majas, Membaca) yang
diisi guru di formulir soal atau di kolom `materi` pada file impor. Materi
tampil di tabel Bank Soal, dan formulir menyarankan materi yang sudah pernah
dipakai. Materi belum memengaruhi pemilihan soal tes.

## Pengaturan (admin)

Halaman Pengaturan menyimpan pengaturan ke tabel `pengaturan` (kunci–nilai).
Kotak centang dan angka tersimpan otomatis saat diubah. Nilai bawaan ada di
`lib/pengaturan.js` dan dipakai selama pengaturan belum pernah disimpan.

| Pengaturan | Bawaan | Pengaruh |
|---|---|---|
| Nama sekolah, tahun ajaran | kosong, tahun ajaran berjalan | Profil sekolah |
| Jumlah soal bawaan, durasi bawaan | 15 soal, 30 menit | Isian awal formulir Jadwal Evaluasi guru |
| Jangan ulang soal | aktif | Soal yang pernah diterima siswa di tes lain diberikan paling akhir (di dalam satu tes, soal **tidak pernah** diulang) |
| Bobot skor per level | aktif | Nilai berbobot 1/2/3; mati = semua soal bernilai sama |
| Acak urutan pilihan jawaban | aktif | Opsi A–D diacak per siswa per soal (`lib/acakOpsi.js`) |
| Kuesioner anonim | aktif | Mati = guru melihat nama dan kelas pada komentar |
| Tampilkan nilai langsung | aktif | Mati = siswa hanya melihat level dan alur tingkat, tanpa nilai dan benar/salah |

Urutan opsi yang diacak dihitung dari (ID sesi, ID soal), jadi server tidak
perlu menyimpannya. Siswa memilih huruf *tampilan*; server menerjemahkannya ke
huruf asli sebelum menyimpan, sehingga data jawaban dan kunci tetap konsisten.

## Status akun dan kata sandi

- Admin bisa **menonaktifkan** akun (Kelola Pengguna → Nonaktifkan). Akun
  nonaktif tidak bisa masuk, dan token login yang masih tersimpan di peramban
  langsung ditolak pada permintaan berikutnya. Data soal dan hasil tesnya tetap ada.
- Akun yang sudah punya soal, hasil tes, atau feedback tidak bisa dihapus
  (409); nonaktifkan saja.
- Admin tidak bisa menonaktifkan, menghapus, atau mengubah peran akunnya sendiri.
- Semua pengguna bisa **mengubah kata sandi** sendiri lewat menu nama di
  pojok kanan atas (admin juga lewat tombol di Pengaturan).
- Login menerima tab peran yang dipilih; akun siswa yang masuk lewat tab Guru
  ditolak dengan pesan yang menyebut peran yang benar.

## Kuesioner anonim

Guru hanya melihat **rekap rata-rata per pernyataan** dan **komentar tanpa
nama, kelas, atau ID sesi**, dengan urutan komentar diacak supaya tidak bisa
dicocokkan dengan urutan siswa yang selesai tes. Layar kuesioner siswa
menyatakan hal ini. Catatan teknis: basis data tetap menyimpan `siswa_id` pada
`respon_kuesioner` (sesuai ERD) sehingga siswa yang punya akses langsung ke
basis data (mis. admin Supabase) tetap bisa menelusurinya; anonimitas berlaku
pada antarmuka guru.

Server menolak pengisian kuesioner kedua oleh siswa yang sama (409) dan pengisian
sebelum siswa menyelesaikan tesnya (403). Guru bisa mengubah judul kapan saja;
pertanyaan hanya bisa diubah selama belum ada siswa yang mengisi, supaya rekap
rata-rata tidak mencampur jawaban dari pertanyaan yang berbeda.

## Arsitektur

```
public/ (HTML+CSS+JS polos, SPA, router hash #/peran/halaman)
   ├─ ui.js         → pembangun elemen aman (teks lewat text node, anti-XSS), API, modal, toast
   ├─ shell.js      → login, sidebar, router, menu pengguna
   ├─ hal-admin.js / hal-guru.js / hal-siswa.js → halaman per peran
   └─ app.js        → titik masuk
   │  fetch() dengan header Authorization: Bearer <token>
   ▼
server.js (Express)
   │
   ├─ lib/auth.js           → hashing password (bcryptjs), token login JWT
   ├─ lib/catEngineLevel.js → mesin tes adaptif berbasis level
   ├─ lib/pengaturan.js     → daftar pengaturan, nilai bawaan, validasi
   ├─ lib/acakOpsi.js       → pengacakan opsi & pemilihan soal yang tetap per sesi
   ├─ lib/tanggal.js        → tanggal WIB untuk kunci jadwal tes
   ├─ lib/ringkasan.js      → rincian hasil per tingkat, penyembunyian nilai
   ├─ lib/db.js             → koneksi SQLite + migrasi otomatis
   └─ lib/seed.js           → data awal (akun, bank soal, satu jadwal tes)

netlify/functions/*.js (mode produksi) memakai lib/ yang sama,
ditambah lib/netlifyBersama.js (cek status akun, pengaturan, kode galat Postgres)
dan lib/sesiSupabase.js (menutup sesi, memilih soal).
```

### Rute API baru

| Rute | Kegunaan |
|---|---|
| `GET /api/pengaturan` (semua peran), `PUT /api/pengaturan` (admin) | Baca/simpan pengaturan (boleh sebagian) |
| `POST /api/auth/ubah-sandi` | `{ sandiLama, sandiBaru }` |
| `PUT /api/admin/users/:id` | kini menerima `aktif: true/false` |
| `PUT /api/admin/mapel/:id` | Ubah nama mapel |
| `PUT /api/guru/kuesioner/:tesId` | Ubah judul/pertanyaan kuesioner |
| `GET /api/guru/hasil` | kini berisi sesi yang **sedang dikerjakan** juga (`status`, `tes_id`, `jumlah_soal_dijawab`) |
| `GET /api/siswa/hasil/:sesiId` | Rincian hasil: benar per tingkat, alur tingkat, status kuesioner |
| `GET /api/siswa/kuesioner-saya` | Kuesioner dari tes yang sudah selesai + `sudahDiisi` |

Layar tes: soal menyertakan `level` dan `acak`; jawaban mengembalikan
`jawabanTadi: { level, benar }` untuk panel "Riwayat jawaban", dan
`POST /api/siswa/tes/:id/mulai` mengembalikan `riwayat` sehingga tes yang
dilanjutkan (muat ulang atau perangkat lain) tetap menampilkan riwayat lengkap.
Soal berikutnya dipilih secara acak tetapi **tetap per sesi dan nomor soal**:
memuat ulang halaman memberi soal yang sama, jadi siswa tidak bisa "mengocok
ulang" soal yang sulit. Kunci jawaban tidak pernah dikirim ke peramban.

## Pengujian

```bash
npm test
```

Menjalankan rangkaian uji API yang **sama** (`tests/api-suite.js`, 94
pemeriksaan) terhadap dua mode:

- `tests/uji-express.js`: server lokal dengan SQLite sungguhan (berkas database
  sementara, tidak menyentuh `data/evalsmk.db`).
- `tests/uji-netlify.js`: fungsi Netlify dengan tiruan Supabase
  (`tests/mockSupabase.js`) yang meniru kunci unik dan foreign key Postgres;
  rute dicocokkan memakai `netlify.toml`. Ditambah uji database lama yang
  belum dimigrasi (aplikasi tetap jalan dengan nilai bawaan).

Yang diuji antara lain: login dan tab peran, ubah sandi, hak akses tiap peran,
validasi pengaturan, status akun (token lama ditolak), hapus data yang masih
dipakai (409), kunci tanggal tes, alur CAT semua benar/semua salah dengan opsi
diacak, muat ulang di tengah tes, rincian hasil, kuesioner (tolak isi ganda),
rekap anonim/bernama, jangan ulang soal, bobot mati, nilai disembunyikan, dan
waktu habis. Skenario ini bisa dijadikan bahan tabel pengujian *black box* di
laporan.

## Deploy ke Netlify + Supabase (mode produksi)

Mode kedua ini sudah lengkap: `netlify/functions/` berisi 21 serverless
function yang meng-cover seluruh rute API, memakai Supabase (Postgres)
sebagai basis data lewat `@supabase/supabase-js`. Login memakai JWT
(`lib/auth.js`) sehingga sesi tetap valid lintas-instance serverless —
beda dari pendekatan token in-memory yang hanya cocok untuk satu proses
lokal.

1. **Buat proyek Supabase**, lalu jalankan seluruh isi `data/schema.postgres.sql`
   di SQL Editor-nya (sudah memuat kolom status akun dan tabel pengaturan).
2. **Isi data awal** dari komputer Anda sendiri (bukan dari Netlify):
   ```bash
   SUPABASE_URL=https://xxxx.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=xxxx \
   node lib/seedSupabase.js
   ```
3. **Push ke GitHub**, lalu import repo-nya di Netlify (New site → Import
   an existing project). `netlify.toml` sudah berisi build command dan
   seluruh pemetaan rute, tidak perlu diubah manual.
4. **Isi 3 environment variable** di Site configuration → Environment
   variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (bukan kunci `anon` — kunci ini melewati
     Row Level Security yang dikunci di skema)
   - `JWT_SECRET` (string acak bebas, dipakai menandatangani token login —
     **wajib diisi**; kalau kosong, kode memakai nilai bawaan yang tidak
     aman untuk produksi)
5. **Trigger deploy ulang** setelah environment variable terisi.

**Sudah punya database Supabase dari versi sebelumnya (level 1–5)?** Jangan
membuat ulang. Jalankan sekali `data/migrasi-tiga-level.postgres.sql` di SQL
Editor Supabase (sebelum atau sesudah deploy kode baru). Skrip ini menambah
kolom `materi`, memetakan level lama ke tiga level (1–2 → mudah, 3 → sedang,
4–5 → sulit) di `soal`, `jawaban`, dan `sesi_tes`, mengganti batasan level
menjadi 1–3, serta memberi level dan materi pada 46 soal bawaan/contoh. Aman
dijalankan ulang (dijaga tabel `skema_versi`). Nilai yang sudah tersimpan tidak
dihitung ulang. **Pemasangan baru tidak perlu menjalankannya.**

**Sudah deploy versi sebelum halaman Pengaturan dan status akun?** Jalankan
sekali `data/migrasi-tampilan-baru.postgres.sql` di SQL Editor Supabase. Skrip ini
menambah kolom `users.aktif` (semua akun lama otomatis aktif) dan membuat tabel
`pengaturan`. Aman dijalankan ulang. Selama migrasi belum dijalankan, aplikasi
tetap berjalan dengan pengaturan bawaan, tetapi pengaturan belum bisa disimpan
(muncul pesan yang menyebut nama berkas migrasinya).

Pada mode lokal, database SQLite lama dimigrasi otomatis saat server pertama
kali dijalankan dengan kode baru (`lib/db.js`).

Keduanya (lokal dan Netlify) memakai `lib/catEngineLevel.js` dan
`lib/seedSoalData.json` yang sama persis — tidak ada logika yang
digandakan atau berisiko berbeda antara dua mode.

## Timer tes

Durasi tes (`tes.durasi_menit`) ditegakkan **di server**, bukan hanya di layar:

- Tenggat = waktu mulai sesi + durasi. Siswa tidak bisa memperpanjang waktu
  dengan mengubah jam perangkat atau menutup-membuka halaman; "Lanjutkan Tes"
  melanjutkan hitung mundur yang sama.
- Layar tes menampilkan hitung mundur (merah di bawah 1 menit). Saat mencapai
  nol, peramban meminta server menutup sesi (`POST /api/siswa/sesi/:id/selesai`);
  server yang memutuskan, sehingga jam perangkat yang meleset tidak merugikan siswa.
- Jawaban yang tiba paling lambat 5 detik setelah tenggat masih diterima
  (toleransi jaringan); setelahnya sesi ditutup dan jawaban itu tidak dihitung.
- **Penilaian saat waktu habis:** soal yang belum sempat dijawab dihitung
  salah dengan bobot level siswa saat itu. Contoh pada tes 10 soal: dua soal
  benar (sedang 2 + sulit 3 = 5) dan 8 soal belum dijawab di level sulit
  (8 x 3 = 24) menghasilkan 5/29 = 17, bukan 100.
- Sesi yang ditinggalkan siswa (tab ditutup) otomatis ditutup saat guru membuka
  dasbor hasil atau siswa membuka daftar tes, dengan waktu selesai dicatat
  sebagai tenggatnya.
- Konstanta toleransi: `GRACE_DETIK` di `lib/timer.js`.

**Tanggal tes dikunci di server:** tes baru bisa dimulai pada tanggalnya
(dihitung dalam WIB, `lib/tanggal.js`; ganti lewat variabel lingkungan
`ZONA_WAKTU` bila perlu). Sebelum itu siswa melihat "Belum dibuka" dan server
menolak dengan 403. Tes yang sudah lewat tanggalnya tetap bisa dikerjakan.

## Kepemilikan soal

Setiap soal tercatat milik guru yang membuatnya (`soal.guru_id`). Guru hanya
bisa **mengubah dan menghapus soal miliknya sendiri**; semua guru tetap bisa
*melihat* seluruh bank soal. Aturan ini ditegakkan di server (respons 403), bukan
hanya dengan menyembunyikan tombol. Di tab Bank Soal, kolom "Pembuat"
menunjukkan pemilik, dan tombol Ubah/Hapus hanya muncul pada soal sendiri.
Soal yang sudah pernah dijawab siswa tidak bisa dihapus (respons 409) agar
riwayat hasil tetap utuh. Soal awal dari seed dimiliki `guru1`.

## Impor soal dari Excel / CSV

Tab **Bank Soal → Impor Soal dari Excel / CSV**. Unduh template (Excel atau
CSV), isi, lalu pilih file. Sistem menampilkan pratinjau (berapa soal valid,
baris mana yang bermasalah dan alasannya) sebelum apa pun disimpan.

| Kolom | Isi |
|---|---|
| `mapel` | Nama mapel, harus sudah terdaftar (huruf besar/kecil diabaikan) |
| `materi` | *Opsional.* Topik/pokok bahasan (maks. 100 karakter). Kolom boleh dihilangkan. Nama lain yang dikenali: `topik`, `kompetensi`, `bab` |
| `pertanyaan` | Teks pertanyaan (maks. 2000 karakter) |
| `opsi_a` … `opsi_d` | Empat pilihan jawaban (maks. 500 karakter) |
| `kunci` | `A`, `B`, `C`, atau `D` |
| `tingkat_kesulitan` | `Mudah`, `Sedang`, `Sulit` (atau 1, 2, 3) |

- Contoh berkas siap pakai: `data/soal-contoh-bahasa-indonesia-25.csv` (25 soal).
- Berkas format lama (level 4 atau 5) ditolak dengan alasan yang jelas; ubah
  ke mudah/sedang/sulit.
- Baris pertama adalah nama kolom. Nama alternatif seperti `Opsi A`, `Level`,
  `Kunci Jawaban` dikenali. Maksimal 500 baris per file.
- Baris bermasalah dilewati, sisanya tetap diimpor. Nomor baris pada laporan
  sama dengan nomor baris di Excel.
- Soal dengan pertanyaan yang sama di mapel yang sama dianggap duplikat dan
  dilewati, jadi mengunggah file yang sama dua kali tidak menggandakan soal.
- Soal hasil impor menjadi milik guru yang mengimpor.
- CSV dari Excel berbahasa Indonesia (pemisah titik koma) terbaca otomatis.
- Pembaca Excel (SheetJS 0.18.5, lisensi Apache-2.0) disertakan di
  `public/vendor/` sehingga tidak bergantung pada CDN. File dibaca di
  peramban guru; hanya impor file yang kamu percaya.
- Validasi dilakukan di server (`lib/soalImport.js`, dipakai bersama oleh mode
  lokal dan Netlify), peramban hanya membaca file menjadi daftar baris.

## Kesesuaian dengan proposal (Bab I–II)

| Proposal | Implementasi |
|---|---|
| Aplikasi web, pengguna admin/guru/siswa dengan hak akses berbeda (1.3 poin 1–2) | Ya — login dengan 3 peran |
| Guru mengelola bank soal: pertanyaan, pilihan jawaban, **materi**, tingkat kesulitan (1.3 poin 3) | Ya — formulir soal, kolom `materi`, impor Excel/CSV |
| Soal pilihan ganda (1.3 poin 4) | Ya |
| **Tiga tingkat kesulitan**: mudah, sedang, sulit (1.3 poin 5; 2.3 poin 1) | Ya |
| Soal awal sedang; benar naik level, salah turun level (1.3 poin 6–7; 2.3 poin 2–3) | Ya |
| **Skor akhir berbobot level**, soal sulit bernilai lebih tinggi (2.3 poin 4) | Ya — bobot 1/2/3 |
| Tes berhenti setelah jumlah soal tertentu **atau batas waktu** tercapai (2.3 poin 5) | Ya — jumlah soal + timer di server |
| Kuesioner Likert 1–5 + pertanyaan terbuka (2.6) | Ya |
| **Anonimitas** kuesioner dijaga (2.6) | Ya pada antarmuka guru (lihat bagian Kuesioner anonim), dapat diatur admin |
| Rekap otomatis dan visualisasi grafik (2.6) | Ya — rata-rata per pernyataan dalam bentuk batang |
| Hasil evaluasi dan rekap feedback untuk guru (1.3 poin 9) | Ya |
| Tingkat kesulitan diperbarui dari proporsi siswa yang benar (2.4) | **Belum** — tidak ada halaman analisis butir |
| Analisis hubungan capaian belajar dan persepsi siswa (2.6) | **Belum** — data terhubung lewat `respon_kuesioner.sesi_id`, tetapi belum ada tampilan analisisnya |
| Perancangan: use case, flowchart, ERD (2.7) | Ya — lihat bagian Pemetaan ke diagram |
| Pengujian black box dan SUS (2.7) | Uji API otomatis tersedia (`npm test`); SUS dan laporan black box belum dibuat |

Teknologi yang dipakai: Node.js + Express (lokal) atau Netlify Functions,
SQLite (lokal) atau PostgreSQL di Supabase, dan JavaScript murni di frontend.
Bagian 2.2 proposal menyebut PHP/Laravel hanya sebagai contoh ("misalnya"),
jadi tidak bertentangan; sebutkan teknologi sebenarnya di Bab III.

## Keterbatasan yang masih ada

- Belum ada analisis butir soal (proporsi siswa yang menjawab benar per soal) dan
  belum ada tampilan hubungan nilai dengan feedback (proposal 2.4 dan 2.6).
- Logout pada mode JWT bersifat sisi-klien (token dibuang dari peramban). Token
  yang disalin manual masih sah sampai kedaluwarsa (8 jam), kecuali akunnya
  dinonaktifkan admin (token langsung ditolak).
- Siswa yang sedang mengerjakan tes ketika admin mengubah "Acak urutan pilihan
  jawaban" tetap aman: peramban mengirim balik status acak soal yang ditampilkan.
- Pada mode Supabase, API membatasi satu kali pengambilan data hingga 1000
  baris secara bawaan. Bank soal di atas 1000 butir per kueri memerlukan
  pagination pada pemilihan soal tes dan pemeriksaan duplikat impor.
- Teks soal hanya teks biasa (tanpa gambar atau pemformatan); teks bacaan
  masih digabung ke dalam kolom pertanyaan.
- Mode Netlify diuji dengan tiruan Supabase dan skrip SQL diuji di PostgreSQL
  (PGlite); belum diuji ulang di situs Netlify/Supabase yang sebenarnya.
