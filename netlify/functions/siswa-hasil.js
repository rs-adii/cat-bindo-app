const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  const { user, errorResponse } = checkAuth(event, "siswa");
  if (errorResponse) return errorResponse;
  const supabase = getClient();

  const { data: sesiList, error } = await supabase
    .from("sesi_tes").select("*").eq("siswa_id", user.users_id).eq("status", "selesai").order("selesai", { ascending: false });
  if (error) return json(500, { error: error.message });
  if (!sesiList || sesiList.length === 0) return json(200, []);

  const { data: tesList } = await supabase.from("tes").select("*");
  const { data: mapelList } = await supabase.from("mapel").select("*");
  const tesMap = Object.fromEntries((tesList || []).map((t) => [t.tes_id, t]));
  const mapelMap = Object.fromEntries((mapelList || []).map((m) => [m.mapel_id, m.nama_mapel]));

  const rows = sesiList.map((s) => {
    const t = tesMap[s.tes_id] || {};
    return {
      sesites_id: s.sesites_id, judul_tes: t.judul, nama_mapel: mapelMap[t.mapel_id] || null,
      nilai: s.nilai, level_akhir: s.level_akhir, selesai: s.selesai,
    };
  });
  return json(200, rows);
};
