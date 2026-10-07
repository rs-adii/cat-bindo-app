const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  const { errorResponse } = checkAuth(event, "guru", "admin");
  if (errorResponse) return errorResponse;
  const supabase = getClient();

  const { data: sesiList, error } = await supabase
    .from("sesi_tes").select("*").eq("status", "selesai").order("selesai", { ascending: false });
  if (error) return json(500, { error: error.message });
  if (!sesiList || sesiList.length === 0) return json(200, []);

  const [{ data: users }, { data: tesList }, { data: kelasList }, { data: jawabanAll }] = await Promise.all([
    supabase.from("users").select("*"),
    supabase.from("tes").select("*"),
    supabase.from("kelas").select("*"),
    supabase.from("jawaban").select("sesi_id"),
  ]);
  const userMap = Object.fromEntries((users || []).map((u) => [u.users_id, u]));
  const tesMap = Object.fromEntries((tesList || []).map((t) => [t.tes_id, t]));
  const kelasMap = Object.fromEntries((kelasList || []).map((k) => [k.kelas_id, k.nama_kelas]));
  const jumlahJawabanPerSesi = {};
  (jawabanAll || []).forEach((j) => { jumlahJawabanPerSesi[j.sesi_id] = (jumlahJawabanPerSesi[j.sesi_id] || 0) + 1; });

  const rows = sesiList.map((s) => {
    const u = userMap[s.siswa_id] || {};
    const t = tesMap[s.tes_id] || {};
    return {
      sesites_id: s.sesites_id, nama: u.nama, nama_kelas: u.kelas_id ? kelasMap[u.kelas_id] : null,
      judul_tes: t.judul, nilai: s.nilai, level_akhir: s.level_akhir, status: s.status,
      mulai: s.mulai, selesai: s.selesai, jumlah_soal_dijawab: jumlahJawabanPerSesi[s.sesites_id] || 0,
    };
  });
  return json(200, rows);
};
