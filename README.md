# SIEP Bahasa Indonesia — Bank Soal Adaptif (CAT) + Kuesioner Feedback

Prototipe kerja untuk capstone project **"Pengembangan Sistem Informasi Evaluasi
Pembelajaran Terpadu Berbasis Web: Bank Soal Adaptif dengan Metode CAT dan
Kuesioner Feedback Siswa di SMK"**, dengan bank soal mata pelajaran **Bahasa
Indonesia SMA/SMK**.

## Cara menjalankan

Butuh Node.js versi 18 ke atas.

```bash
cd cat-bindo-app
npm install
npm start
```

Buka `http://localhost:3000` di peramban. Klik **"Mulai sebagai Siswa"** untuk
mengerjakan tes di satu tab, dan buka tab/peramban lain lalu klik **"Masuk
sebagai Guru"** untuk melihat dasbor — hasil akan langsung muncul karena
keduanya berbagi data yang sama di server (bukan localStorage per-peramban).

## Arsitektur

Mengikuti rancangan tiga lapis pada proposal (Bab III):

```
Frontend (public/, JS murni)  →  Backend (server.js, Express/REST API)  →  Data (data/db.json)
```

- `data/db.json` berperan sebagai basis data sementara (file JSON). Struktur
  rute API di `server.js` sudah memisahkan logika dari penyimpanan, sehingga
  fungsi `loadDB()`/`saveDB()` dapat diganti dengan modul PostgreSQL (mis. `pg`
  atau Prisma) tanpa mengubah rute atau mesin CAT.
- `data/questionBank.json` — 21 butir soal Bahasa Indonesia (ejaan, kosakata,
  tata bahasa, membaca pemahaman, sastra, menulis) dengan parameter kesulitan
  `b` dari −2.0 sampai +2.0 untuk model Rasch.
- `data/questionnaire.json` — 5 pernyataan kuesioner feedback (skala 1–5).

## Mesin CAT (model Rasch / IRT 1PL)

Diimplementasikan di `server.js`, sepenuhnya di sisi server (kunci jawaban dan
parameter kesulitan butir **tidak pernah** dikirim ke klien selama tes
berlangsung):

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
`server.js` dan mudah disesuaikan.

## Menambah soal atau mata pelajaran lain

Tambahkan objek baru ke `data/questionBank.json` dengan field `id`,
`kompetensi`, `pertanyaan`, `opsi` (4 pilihan), `kunci` (indeks 0–3), dan `b`
(taksiran kesulitan). Semakin besar bank soal dan semakin tersebar nilai `b`,
semakin stabil pengukuran adaptifnya.

## Keterbatasan prototipe ini

- Penyimpanan berupa file JSON tunggal — cocok untuk demo/uji coba satu kelas,
  belum untuk skala produksi banyak sekolah sekaligus (lihat rekomendasi
  migrasi ke PostgreSQL di atas).
- Belum ada autentikasi/login guru — dasbor guru dapat diakses siapa pun yang
  membuka `/` dan memilih peran Guru. Untuk penggunaan nyata, tambahkan
  autentikasi sebelum rute `/api/teacher/*`.
- Kalibrasi kesulitan butir (`b`) pada bank soal saat ini adalah taksiran
  awal penulis soal, sesuai batasan masalah pada proposal; idealnya diperbarui
  secara berkala dari data jawaban siswa sungguhan.
