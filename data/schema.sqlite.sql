-- Skema database sesuai ERD yang diberikan.
-- Catatan implementasi (penyesuaian praktis dari ERD, dijelaskan di README):
--   1. tes.kelas_id ditambahkan (nullable) untuk merealisasikan relasi "diujikan"
--      antara Kelas dan TES -- null berarti tes terbuka untuk semua kelas.
--   2. jawaban.level_saat_itu dan jawaban.urutan ditambahkan agar mesin CAT
--      berbasis level bisa melacak soal yang "belum pernah muncul" dan progres.
--   3. sesi_tes.mulai / sesi_tes.selesai ditambahkan untuk kebutuhan dasbor guru.
--   4. respon_kuesioner.sesi_id ditambahkan agar feedback terikat ke sesi tes
--      tertentu (ERD hanya menyebut relasi ke Users/siswa).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mapel (
  mapel_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_mapel  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS kelas (
  kelas_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_kelas  TEXT NOT NULL,
  jurusan     TEXT
);

CREATE TABLE IF NOT EXISTS users (
  users_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nama          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','guru','siswa')),
  kelas_id      INTEGER REFERENCES kelas(kelas_id),
  aktif         INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0,1))   -- 0 = dinonaktifkan admin (tidak bisa login)
);

CREATE TABLE IF NOT EXISTS soal (
  soal_id            INTEGER PRIMARY KEY AUTOINCREMENT,
  mapel_id           INTEGER NOT NULL REFERENCES mapel(mapel_id),
  guru_id            INTEGER NOT NULL REFERENCES users(users_id),
  pertanyaan         TEXT NOT NULL,
  opsi_a             TEXT NOT NULL,
  opsi_b             TEXT NOT NULL,
  opsi_c             TEXT NOT NULL,
  opsi_d             TEXT NOT NULL,
  kunci              TEXT NOT NULL CHECK (kunci IN ('A','B','C','D')),
  tingkat_kesulitan  INTEGER NOT NULL CHECK (tingkat_kesulitan BETWEEN 1 AND 3), -- 1 mudah, 2 sedang, 3 sulit
  materi             TEXT                                                          -- topik/pokok bahasan (opsional)
);

CREATE TABLE IF NOT EXISTS tes (
  tes_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mapel_id       INTEGER NOT NULL REFERENCES mapel(mapel_id),
  kelas_id       INTEGER REFERENCES kelas(kelas_id),
  judul          TEXT NOT NULL,
  jumlah_soal    INTEGER NOT NULL,
  durasi_menit   INTEGER NOT NULL,
  tanggal        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kuesioner (
  kuesioner_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  tes_id        INTEGER NOT NULL REFERENCES tes(tes_id),
  judul         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pertanyaan_kuesioner (
  pertanyaan_kuesioner_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  kuesioner_id             INTEGER NOT NULL REFERENCES kuesioner(kuesioner_id),
  soal                     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesi_tes (
  sesites_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  tes_id        INTEGER NOT NULL REFERENCES tes(tes_id),
  siswa_id      INTEGER NOT NULL REFERENCES users(users_id),
  level_akhir   INTEGER,
  nilai         REAL,
  status        TEXT NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing','selesai')),
  mulai         TEXT NOT NULL DEFAULT (datetime('now')),
  selesai       TEXT
);

CREATE TABLE IF NOT EXISTS jawaban (
  jawaban_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  sesi_id         INTEGER NOT NULL REFERENCES sesi_tes(sesites_id),
  soal_id         INTEGER NOT NULL REFERENCES soal(soal_id),
  jawaban         TEXT,
  benar           INTEGER NOT NULL CHECK (benar IN (0,1)),
  level_saat_itu  INTEGER NOT NULL,
  urutan          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS respon_kuesioner (
  respon_kuesioner_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  pertanyaan_id        INTEGER NOT NULL REFERENCES pertanyaan_kuesioner(pertanyaan_kuesioner_id),
  siswa_id             INTEGER NOT NULL REFERENCES users(users_id),
  sesi_id              INTEGER REFERENCES sesi_tes(sesites_id),
  skor                 INTEGER,
  komentar             TEXT
);

CREATE INDEX IF NOT EXISTS idx_soal_mapel_level ON soal(mapel_id, tingkat_kesulitan);
CREATE INDEX IF NOT EXISTS idx_jawaban_sesi ON jawaban(sesi_id);
CREATE INDEX IF NOT EXISTS idx_sesi_tes_siswa ON sesi_tes(siswa_id);
CREATE INDEX IF NOT EXISTS idx_respon_pertanyaan ON respon_kuesioner(pertanyaan_id);

-- Pengaturan sekolah & aturan evaluasi (halaman Pengaturan admin).
-- nilai disimpan sebagai JSON; kunci yang belum ada memakai nilai bawaan (lib/pengaturan.js).
CREATE TABLE IF NOT EXISTS pengaturan (
  kunci  TEXT PRIMARY KEY,
  nilai  TEXT NOT NULL
);
