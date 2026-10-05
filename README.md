# SIEP SMK — Bank Soal Adaptif (CAT) + Kuesioner Feedback

Prototipe kerja untuk capstone project **"Pengembangan Sistem Informasi Evaluasi
Pembelajaran Terpadu Berbasis Web: Bank Soal Adaptif dengan Metode CAT dan
Kuesioner Feedback Siswa di SMK"**. Mata pelajaran **Bahasa Indonesia SMA/SMK**
dipakai sebagai bank soal latihan untuk membuktikan sistem ini bekerja — struktur
bank soal dirancang agar mata pelajaran lain mudah ditambahkan di kemudian hari.

Proyek ini punya **dua mode** yang berbagi mesin CAT yang persis sama
(`lib/catEngine.js`), supaya hasil tes tidak pernah berbeda antara keduanya:

| Mode | Backend | Penyimpanan | Cocok untuk |
|---|---|---|---|
| **Lokal** | `server.js` (Express) | file `data/db.json` | coba-coba di komputer sendiri, tanpa setup apa pun |
| **Produksi** | `netlify/functions/*.js` | Supabase (PostgreSQL) | demo online yang datanya tidak hilang |

## Mode 1 — Jalankan di komputer sendiri

Butuh Node.js versi 18 ke atas.

```bash
cd cat-bindo-app
npm install
npm start
```

Buka `http://localhost:3000`. Data tersimpan di `data/db.json` di komputer
Anda sendiri — cukup untuk mencoba alur aplikasi, tapi **tidak** untuk
dibagikan online (lihat Mode 2).

## Mode 2 — Deploy online dengan Netlify + Supabase

Dipakai kalau Anda ingin aplikasi bisa diakses lewat URL publik dan datanya
tahan lama (tidak hilang saat server idle/restart, berbeda dari penyimpanan
file JSON biasa).

### Langkah A — Siapkan basis data di Supabase

1. Buat akun gratis di [supabase.com](https://supabase.com) lalu buat proyek baru.
2. Buka **SQL Editor** di dashboard Supabase, tempel isi file `supabase/schema.sql`
   dari proyek ini, lalu jalankan (Run). Ini membuat tabel `sessions` dan
   `feedbacks`.
3. Buka **Project Settings → API**. Catat dua nilai ini:
   - **Project URL** (contoh: `https://xxxxx.supabase.co`)
   - **service_role key** (bukan `anon` key — ini kunci rahasia untuk akses
     penuh dari server, jangan pernah ditaruh di kode frontend)

### Langkah B — Deploy ke Netlify

1. Unggah folder `cat-bindo-app` ini ke repository GitHub.
2. Daftar/masuk ke [netlify.com](https://netlify.com) dengan akun GitHub.
3. Klik **Add new site → Import an existing project**, pilih repository tadi.
   Netlify otomatis membaca `netlify.toml` (build command, folder publish,
   dan folder functions sudah terisi).
4. Sebelum/selama deploy, buka **Site configuration → Environment variables**
   dan tambahkan:
   - `SUPABASE_URL` = Project URL dari Langkah A
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key dari Langkah A
5. Klik **Deploy site**. Setelah selesai, Anda mendapat URL publik
   (`https://nama-acak.netlify.app`).

### Kenapa butuh dua backend (Express dan Netlify Functions)?

Netlify tidak bisa menjalankan server Express yang menyala terus-menerus —
yang bisa dijalankan hanya **fungsi serverless** yang aktif sebentar per
permintaan. Karena itu, setiap rute API ditulis ulang sebagai satu file di
`netlify/functions/`, tapi logika CAT-nya (model Rasch, estimasi kemampuan,
aturan berhenti) tetap satu sumber kebenaran di `lib/catEngine.js` yang
di-require oleh keduanya.

| Rute (dipanggil frontend) | Mode lokal | Mode Netlify |
|---|---|---|
| `POST /api/session/start` | `server.js` | `netlify/functions/session-start.js` |
| `POST /api/session/answer` | `server.js` | `netlify/functions/session-answer.js` |
| `POST /api/feedback` | `server.js` | `netlify/functions/feedback.js` |
| `GET /api/meta/dimensi` | `server.js` | `netlify/functions/meta-dimensi.js` |
| `GET /api/teacher/sessions` | `server.js` | `netlify/functions/teacher-sessions.js` |
| `GET /api/teacher/feedback-summary` | `server.js` | `netlify/functions/teacher-feedback-summary.js` |
| `GET /api/teacher/item-stats` | `server.js` | `netlify/functions/teacher-item-stats.js` |

File `netlify.toml` memetakan path `/api/...` yang dipanggil `public/app.js`
ke path asli Netlify Functions (`/.netlify/functions/...`), jadi kode
frontend tidak perlu tahu bedanya.

### Keamanan kunci Supabase

`SUPABASE_SERVICE_ROLE_KEY` melewati semua aturan keamanan (Row Level
Security) di Supabase, jadi dia **hanya** boleh dipakai di `lib/supabaseClient.js`
yang berjalan di sisi server (Netlify Functions). Frontend (`public/app.js`)
tidak pernah menghubungi Supabase secara langsung — selalu lewat `/api/...`
yang diteruskan ke fungsi server. Ini sekaligus menjaga kunci jawaban soal
(`kunci`) dan parameter kesulitan (`b`) tidak pernah terkirim ke browser
siswa.

## Arsitektur

```
Frontend (public/, JS murni)
        |  fetch("/api/...")
        v
+--------------------+-------------------------------+
|  Mode lokal        |  Mode produksi                 |
|  server.js         |  netlify/functions/*.js        |
|  (Express)         |  (serverless, via Netlify)     |
+---------+----------+---------------+-----------------+
          |                          |
   data/db.json              Supabase (PostgreSQL)
          |                          |
          +------------+-------------+
                       v
              lib/catEngine.js
        (mesin CAT, satu-satunya sumber
         logika Rasch untuk keduanya)
```

- `data/questionBank.json` — 21 butir soal Bahasa Indonesia (ejaan, kosakata,
  tata bahasa, membaca pemahaman, sastra, menulis) dengan parameter kesulitan
  `b` dari −2.0 sampai +2.0 untuk model Rasch.
- `data/questionnaire.json` — 5 pernyataan kuesioner feedback (skala 1–5).
- `supabase/schema.sql` — definisi tabel `sessions` dan `feedbacks` untuk
  mode produksi.

## Mesin CAT (model Rasch / IRT 1PL)

Diimplementasikan di `lib/catEngine.js`, sepenuhnya di sisi server (kunci
jawaban dan parameter kesulitan butir **tidak pernah** dikirim ke klien
selama tes berlangsung):

- **Peluang menjawab benar:** `P(θ) = 1 / (1 + e^-(θ-b))`
- **Pemilihan butir:** butir dengan informasi `I(θ) = P(θ)·(1-P(θ))` tertinggi
  pada estimasi kemampuan saat ini, dengan keacakan ringan di antara 3
  kandidat teratas sebagai kontrol keterpaparan butir.
- **Estimasi kemampuan:** Newton–Raphson (maximum likelihood), dibatasi pada
  rentang θ ∈ [−4, 4] agar tidak divergen pada pola jawaban ekstrem.
- **Aturan penghentian:** tes berhenti bila jumlah butir ≥ 8 **dan** standard
  error ≤ 0,30, atau jumlah butir mencapai 15.
- **Skor akhir:** θ dikonversi linear ke skala 0–100 untuk laporan ke siswa
  dan guru.

Konstanta ini (`MIN_ITEMS`, `MAX_ITEMS`, `SE_STOP`) ada di bagian atas
`lib/catEngine.js` dan berlaku untuk kedua mode sekaligus.

## Menambah soal atau mata pelajaran lain

Tambahkan objek baru ke `data/questionBank.json` dengan field `id`,
`kompetensi`, `pertanyaan`, `opsi` (4 pilihan), `kunci` (indeks 0–3), dan `b`
(taksiran kesulitan). Kalau pakai mode Netlify, cukup commit perubahan file
ini ke GitHub — Netlify akan build ulang otomatis.

## Keterbatasan prototipe ini

- Belum ada autentikasi/login guru — dasbor guru dapat diakses siapa pun yang
  membuka situs dan memilih peran Guru. Untuk penggunaan nyata, tambahkan
  autentikasi sebelum rute `/api/teacher/*` (mis. Supabase Auth).
- Kalibrasi kesulitan butir (`b`) pada bank soal saat ini adalah taksiran
  awal penulis soal, sesuai batasan masalah pada proposal; idealnya diperbarui
  secara berkala dari data jawaban siswa sungguhan.
- Tabel Supabase diamankan dengan Row Level Security yang ditutup rapat untuk
  akses publik — semua baca/tulis wajib lewat Netlify Functions. Jangan
  menonaktifkan RLS atau mengekspos service_role key di kode frontend.
