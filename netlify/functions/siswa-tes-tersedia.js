const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  const { user, errorResponse } = checkAuth(event, "siswa");
  if (errorResponse) return errorResponse;
  const supabase = getClient();

  const { data: tesList, error } = await supabase.from("tes").select("*").order("tanggal", { ascending: false });
  if (error) return json(500, { error: error.message });
  const tersedia = (tesList || []).filter((t) => t.kelas_id === null || t.kelas_id === user.kelas_id);
  if (tersedia.length === 0) return json(200, []);

  const { data: mapelList } = await supabase.from("mapel").select("*");
  const mapelMap = Object.fromEntries((mapelList || []).map((m) => [m.mapel_id, m.nama_mapel]));

  const { data: sesiSaya } = await supabase.from("sesi_tes").select("*").eq("siswa_id", user.users_id);
  const sesiPerTes = {};
  (sesiSaya || []).forEach((s) => {
    const prev = sesiPerTes[s.tes_id];
    if (!prev || s.sesites_id > prev.sesites_id) sesiPerTes[s.tes_id] = s;
  });

  const rows = tersedia.map((t) => {
    const sesi = sesiPerTes[t.tes_id];
    return {
      tes_id: t.tes_id, judul: t.judul, jumlah_soal: t.jumlah_soal, durasi_menit: t.durasi_menit,
      tanggal: t.tanggal, nama_mapel: mapelMap[t.mapel_id] || null,
      status_saya: sesi ? sesi.status : null, nilai_saya: sesi ? sesi.nilai : null,
    };
  });
  return json(200, rows);
};
