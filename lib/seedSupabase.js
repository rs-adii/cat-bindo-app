// lib/seedSupabase.js — isi data awal ke Supabase.
// Jalankan SEKALI secara manual dari komputer Anda (bukan dari Netlify),
// setelah menjalankan data/schema.postgres.sql di SQL Editor Supabase:
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx node lib/seedSupabase.js
//
// Aman dijalankan berkali-kali (idempotent): kalau mapel "Bahasa Indonesia"
// sudah ada, seed dilewati.

const { createClient } = require("@supabase/supabase-js");
const { hashPassword } = require("./auth");

const SOAL_SUMBER = require("./seedSoalData.json");
const DIMENSI_KUESIONER = [
  "Penjelasan materi Bahasa Indonesia yang diberikan guru mudah saya pahami.",
  "Guru menggunakan metode mengajar yang membuat saya aktif belajar.",
  "Media dan latihan soal yang digunakan membantu saya memahami materi.",
  "Saya merasa nyaman bertanya dan berpendapat selama pembelajaran.",
  "Soal tes yang diberikan sesuai dengan materi yang telah diajarkan.",
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set dulu env var SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: sudahAda } = await supabase.from("mapel").select("mapel_id").eq("nama_mapel", "Bahasa Indonesia").maybeSingle();
  if (sudahAda) {
    console.log("Seed dilewati: data sudah ada di Supabase.");
    return;
  }

  const { data: mapel, error: errMapel } = await supabase.from("mapel").insert({ nama_mapel: "Bahasa Indonesia" }).select().single();
  if (errMapel) throw errMapel;

  const { data: kelas1, error: errKelas } = await supabase.from("kelas").insert({ nama_kelas: "XI Bahasa 1", jurusan: "Bahasa" }).select().single();
  if (errKelas) throw errKelas;
  await supabase.from("kelas").insert({ nama_kelas: "XI Bahasa 2", jurusan: "Bahasa" });

  const { data: admin } = await supabase.from("users").insert({
    nama: "Admin Sistem", username: "admin", password_hash: hashPassword("admin123"), role: "admin",
  }).select().single();

  const { data: guru } = await supabase.from("users").insert({
    nama: "Bu Siti Nurhaliza", username: "guru1", password_hash: hashPassword("guru123"), role: "guru",
  }).select().single();

  await supabase.from("users").insert({
    nama: "Nadia Putri", username: "siswa1", password_hash: hashPassword("siswa123"), role: "siswa", kelas_id: kelas1.kelas_id,
  });
  await supabase.from("users").insert({
    nama: "Rizky Ananda", username: "siswa2", password_hash: hashPassword("siswa123"), role: "siswa", kelas_id: kelas1.kelas_id,
  });

  const HURUF = ["A", "B", "C", "D"];
  const soalRows = SOAL_SUMBER.map((s) => ({
    mapel_id: mapel.mapel_id, guru_id: guru.users_id, pertanyaan: s.pertanyaan,
    opsi_a: s.opsi[0], opsi_b: s.opsi[1], opsi_c: s.opsi[2], opsi_d: s.opsi[3],
    kunci: HURUF[s.kunci], tingkat_kesulitan: s.level,
  }));
  const { error: errSoal } = await supabase.from("soal").insert(soalRows);
  if (errSoal) throw errSoal;

  const { data: tes } = await supabase.from("tes").insert({
    mapel_id: mapel.mapel_id, kelas_id: kelas1.kelas_id, judul: "Tes Bahasa Indonesia — Bab Teks Eksposisi",
    jumlah_soal: 10, durasi_menit: 30, tanggal: new Date().toISOString().slice(0, 10),
  }).select().single();

  const { data: kuesioner } = await supabase.from("kuesioner").insert({
    tes_id: tes.tes_id, judul: "Kuesioner Feedback Pembelajaran Bahasa Indonesia",
  }).select().single();

  await supabase.from("pertanyaan_kuesioner").insert(
    DIMENSI_KUESIONER.map((soal) => ({ kuesioner_id: kuesioner.kuesioner_id, soal }))
  );

  console.log("Seed Supabase selesai:");
  console.log("  admin  / admin123");
  console.log("  guru1  / guru123");
  console.log("  siswa1 / siswa123 (kelas XI Bahasa 1)");
  console.log("  siswa2 / siswa123 (kelas XI Bahasa 1)");
  console.log(`  Tes "${tes.judul}" (tes_id=${tes.tes_id}) siap dikerjakan.`);
}

main().catch((e) => { console.error("Seed gagal:", e.message); process.exit(1); });
