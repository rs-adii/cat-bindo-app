// lib/seed.js — isi data awal supaya sistem langsung bisa dicoba.
// Aman dijalankan berkali-kali (idempotent): kalau mapel "Bahasa Indonesia"
// sudah ada, seed dilewati.

const { db } = require("./db");
const { hashPassword } = require("./auth");

// 21 soal bawaan: 7 mudah, 7 sedang, 7 sulit (lihat lib/seedSoalData.json)
const SOAL_SUMBER = require("./seedSoalData.json");

const DIMENSI_KUESIONER = [
  "Penjelasan materi Bahasa Indonesia yang diberikan guru mudah saya pahami.",
  "Guru menggunakan metode mengajar yang membuat saya aktif belajar.",
  "Media dan latihan soal yang digunakan membantu saya memahami materi.",
  "Saya merasa nyaman bertanya dan berpendapat selama pembelajaran.",
  "Soal tes yang diberikan sesuai dengan materi yang telah diajarkan.",
];

function seed() {
  const sudahAda = db.prepare("SELECT mapel_id FROM mapel WHERE nama_mapel = ?").get("Bahasa Indonesia");
  if (sudahAda) {
    console.log("Seed dilewati: data sudah ada.");
    return;
  }

  const trx = db.transaction(() => {
    const mapelId = db.prepare("INSERT INTO mapel (nama_mapel) VALUES (?)").run("Bahasa Indonesia").lastInsertRowid;

    const kelas1 = db.prepare("INSERT INTO kelas (nama_kelas, jurusan) VALUES (?,?)").run("XI Bahasa 1", "Bahasa").lastInsertRowid;
    db.prepare("INSERT INTO kelas (nama_kelas, jurusan) VALUES (?,?)").run("XI Bahasa 2", "Bahasa");

    const insUser = db.prepare(
      "INSERT INTO users (nama, username, password_hash, role, kelas_id) VALUES (?,?,?,?,?)"
    );
    const adminId = insUser.run("Admin Sistem", "admin", hashPassword("admin123"), "admin", null).lastInsertRowid;
    const guruId = insUser.run("Bu Siti Nurhaliza", "guru1", hashPassword("guru123"), "guru", null).lastInsertRowid;
    const siswaId = insUser.run("Nadia Putri", "siswa1", hashPassword("siswa123"), "siswa", kelas1).lastInsertRowid;
    insUser.run("Rizky Ananda", "siswa2", hashPassword("siswa123"), "siswa", kelas1);

    const insSoal = db.prepare(`
      INSERT INTO soal (mapel_id, guru_id, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, kunci, tingkat_kesulitan, materi)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    const HURUF = ["A", "B", "C", "D"];
    for (const s of SOAL_SUMBER) {
      insSoal.run(mapelId, guruId, s.pertanyaan, s.opsi[0], s.opsi[1], s.opsi[2], s.opsi[3], HURUF[s.kunci], s.level, s.materi || null);
    }

    const tesId = db.prepare(`
      INSERT INTO tes (mapel_id, kelas_id, judul, jumlah_soal, durasi_menit, tanggal)
      VALUES (?,?,?,?,?,?)
    `).run(mapelId, kelas1, "Tes Bahasa Indonesia — Bab Teks Eksposisi", 10, 30, require("./tanggal").hariIni()).lastInsertRowid;

    const kuesionerId = db.prepare("INSERT INTO kuesioner (tes_id, judul) VALUES (?,?)")
      .run(tesId, "Kuesioner Feedback Pembelajaran Bahasa Indonesia").lastInsertRowid;

    const insPertanyaan = db.prepare("INSERT INTO pertanyaan_kuesioner (kuesioner_id, soal) VALUES (?,?)");
    for (const p of DIMENSI_KUESIONER) insPertanyaan.run(kuesionerId, p);

    console.log("Seed selesai:");
    console.log("  admin  / admin123");
    console.log("  guru1  / guru123");
    console.log("  siswa1 / siswa123 (kelas XI Bahasa 1)");
    console.log("  siswa2 / siswa123 (kelas XI Bahasa 1)");
    console.log(`  Tes "${"Tes Bahasa Indonesia — Bab Teks Eksposisi"}" (tes_id=${tesId}) siap dikerjakan siswa1/siswa2.`);
  });

  trx();
}

if (require.main === module) {
  seed();
  process.exit(0);
}

module.exports = { seed };
