const { getClient } = require("../../lib/supabaseClient");
const { json, aman } = require("../../lib/httpHelpers");
const { sapuSesiKadaluarsa } = require("../../lib/sesiSupabase");
const { cekAkses, peta, wajib } = require("../../lib/netlifyBersama");

// Semua sesi (selesai dan sedang dikerjakan), supaya guru bisa memantau siswa yang belum selesai.
exports.handler = aman(async (event) => {
  const { errorResponse } = await cekAkses(event, "guru", "admin");
  if (errorResponse) return errorResponse;
  const supabase = getClient();
  await sapuSesiKadaluarsa(supabase); // tutup sesi yang waktunya habis tapi ditinggalkan siswa

  const sesiList = wajib(await supabase.from("sesi_tes").select("*"));
  if (sesiList.length === 0) return json(200, []);

  const userMap = peta(wajib(await supabase.from("users").select("*")), "users_id");
  const tesMap = peta(wajib(await supabase.from("tes").select("*")), "tes_id");
  const kelasMap = peta(wajib(await supabase.from("kelas").select("*")), "kelas_id", "nama_kelas");
  const jumlahJawaban = {};
  wajib(await supabase.from("jawaban").select("sesi_id")).forEach((j) => {
    jumlahJawaban[String(j.sesi_id)] = (jumlahJawaban[String(j.sesi_id)] || 0) + 1;
  });

  const rows = sesiList.map((s) => {
    const u = userMap[String(s.siswa_id)] || {};
    const t = tesMap[String(s.tes_id)] || {};
    return {
      sesites_id: s.sesites_id, tes_id: s.tes_id, nama: u.nama, nama_kelas: u.kelas_id ? kelasMap[String(u.kelas_id)] || null : null,
      judul_tes: t.judul, nilai: s.nilai, level_akhir: s.level_akhir, status: s.status,
      mulai: s.mulai, selesai: s.selesai, jumlah_soal_dijawab: jumlahJawaban[String(s.sesites_id)] || 0, jumlah_soal: t.jumlah_soal,
    };
  });
  rows.sort((a, b) => String(b.selesai || b.mulai).localeCompare(String(a.selesai || a.mulai)));
  return json(200, rows);
});
