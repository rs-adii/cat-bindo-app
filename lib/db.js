// lib/db.js — koneksi SQLite untuk mode lokal (server.js)
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// EVALSMK_DB dapat diisi untuk memakai berkas lain (mis. database uji)
const DB_PATH = process.env.EVALSMK_DB || path.join(__dirname, "..", "data", "evalsmk.db");

// Pindah nama aplikasi SIEP SMK -> EvalSMK: database lama data/siep.db dipakai
// terus dengan nama baru (dipindahkan sekali, datanya tidak berubah).
const DB_LAMA = path.join(__dirname, "..", "data", "siep.db");
if (!process.env.EVALSMK_DB && !fs.existsSync(DB_PATH) && fs.existsSync(DB_LAMA)) {
  for (const akhiran of ["", "-wal", "-shm"]) {
    if (fs.existsSync(DB_LAMA + akhiran)) fs.renameSync(DB_LAMA + akhiran, DB_PATH + akhiran);
  }
  console.log("Database lama data/siep.db dipindahkan ke data/evalsmk.db.");
}
const SCHEMA_PATH = path.join(__dirname, "..", "data", "schema.sqlite.sql");

const isNew = !fs.existsSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

// Terapkan skema setiap start (semua statement pakai IF NOT EXISTS, aman diulang)
db.exec(fs.readFileSync(SCHEMA_PATH, "utf-8"));

// ---- Migrasi database lama (dibuat sebelum 3 level & kolom materi) ----
// Dijaga tabel skema_versi sehingga hanya berjalan sekali.
db.exec("CREATE TABLE IF NOT EXISTS skema_versi (nama TEXT PRIMARY KEY, diterapkan TEXT NOT NULL DEFAULT (datetime('now')))");

if (!db.prepare("PRAGMA table_info(soal)").all().some((c) => c.name === "materi")) {
  db.exec("ALTER TABLE soal ADD COLUMN materi TEXT");
}

// Status akun (aktif/nonaktif) untuk database yang dibuat sebelum fitur ini
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "aktif")) {
  db.exec("ALTER TABLE users ADD COLUMN aktif INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0,1))");
}

if (!db.prepare("SELECT 1 FROM skema_versi WHERE nama = 'tiga-level'").get()) {
  if (!isNew) {
    // 5 level lama -> 3 level: 1-2 mudah, 3 sedang, 4-5 sulit
    const petakan = (kolom) => `CASE WHEN ${kolom} <= 2 THEN 1 WHEN ${kolom} = 3 THEN 2 ELSE 3 END`;
    db.transaction(() => {
      db.exec(`UPDATE soal SET tingkat_kesulitan = ${petakan("tingkat_kesulitan")}`);
      db.exec(`UPDATE jawaban SET level_saat_itu = ${petakan("level_saat_itu")}`);
      db.exec(`UPDATE sesi_tes SET level_akhir = ${petakan("level_akhir")} WHERE level_akhir IS NOT NULL`);
      // Soal bawaan seed: pakai pembagian 7/7/7 dan isi materinya
      const upd = db.prepare("UPDATE soal SET tingkat_kesulitan = ?, materi = COALESCE(materi, ?) WHERE pertanyaan = ?");
      for (const s of require("./seedSoalData.json")) upd.run(s.level, s.materi || null, s.pertanyaan);
    })();
  }
  db.prepare("INSERT INTO skema_versi (nama) VALUES ('tiga-level')").run();
}

module.exports = { db, isNew };
