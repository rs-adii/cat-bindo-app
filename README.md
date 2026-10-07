# SIEP SMK v2 — Sesuai Use Case, ERD, dan Flowchart

Versi ini adalah penulisan ulang total dari prototipe SIEP SMK sebelumnya, dibangun
mengikuti tiga diagram perancangan: **Use Case Diagram**, **ERD**, dan **Flowchart**
mesin tes adaptif.

## Menjalankan

Butuh Node.js 18+.

```bash
cd siep-smk-v2
npm install
npm start
```

Buka `http://localhost:3000`. Database SQLite (`data/siep.db`) dan data awal
dibuat otomatis saat pertama kali dijalankan.

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
| Guru | Kelola Bank Soal | `/api/guru/soal` (CRUD) | Tab "Bank Soal" |
| Guru | Atur Jadwal Tes | `/api/guru/tes` (CRUD) | Tab "Jadwal Tes" |
| Guru | Kelola Kuesioner | `/api/guru/kuesioner` | Tab "Kuesioner" |
| Guru | Lihat Hasil & Rekap Feedback | `/api/guru/hasil`, `/api/guru/feedback-summary/:tesId` | Tab "Hasil & Feedback" |
| Siswa | Kerjakan Tes CAT | `/api/siswa/tes/:id/mulai`, `/api/siswa/sesi/:id/jawab` | "Tes Tersedia" → alur tes |
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
mulai di **level sedang (3)** → jawaban benar → level naik (maks 5) / salah →
level turun (min 1) → ambil soal sesuai level yang **belum pernah muncul** →
ulangi sampai `jumlah_soal` pada tabel `tes` tercapai → hitung nilai
(persentase jawaban benar) dan level akhir → simpan ke `sesi_tes` → siswa isi
kuesioner → simpan ke `respon_kuesioner` → guru lihat hasil & rekap.

Catatan: ini **bukan** model Rasch/IRT seperti pada prototipe sebelumnya —
sesuai pilihan yang sudah disepakati, pendekatannya memang disederhanakan
menjadi sistem level naik/turun sesuai flowchart.

## Arsitektur

```
public/ (HTML+CSS+JS polos, SPA)
   │  fetch() dengan header Authorization: Bearer <token>
   ▼
server.js (Express)
   │
   ├─ lib/auth.js        → hashing password (bcryptjs), token sesi in-memory
   ├─ lib/catEngineLevel.js → mesin tes adaptif berbasis level
   ├─ lib/db.js           → koneksi SQLite
   └─ lib/seed.js         → data awal (akun, bank soal, satu jadwal tes)
```

## Deploy ke Netlify + Supabase (mode produksi)

Mode kedua ini sudah lengkap: `netlify/functions/` berisi 15 serverless
function yang meng-cover seluruh rute API, memakai Supabase (Postgres)
sebagai basis data lewat `@supabase/supabase-js`. Login memakai JWT
(`lib/auth.js`) sehingga sesi tetap valid lintas-instance serverless —
beda dari pendekatan token in-memory yang hanya cocok untuk satu proses
lokal.

1. **Buat proyek Supabase**, lalu jalankan seluruh isi `data/schema.postgres.sql`
   di SQL Editor-nya.
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

Keduanya (lokal dan Netlify) memakai `lib/catEngineLevel.js` dan
`lib/seedSoalData.json` yang sama persis — tidak ada logika yang
digandakan atau berisiko berbeda antara dua mode.

## Keterbatasan yang masih ada

- Guru saat ini bisa mengelola/menghapus soal siapa pun (tidak dibatasi
  hanya miliknya sendiri) — disederhanakan untuk demo satu kelas.
- Belum ada halaman edit untuk kelas/soal dari UI (baru tambah & hapus);
  rute `PUT` untuk update sudah ada di backend, tinggal ditambahkan
  tombol "Edit" di frontend kalau diperlukan.
- Logout pada mode JWT bersifat sisi-klien saja (token dibuang dari
  memori peramban) — token lama secara teknis masih valid sampai
  kedaluwarsa (8 jam) kalau disalin manual. Untuk kebutuhan keamanan
  lebih ketat, tambahkan daftar token yang dicabut (blocklist) di basis
  data.
