const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json, parseBody } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  const supabase = getClient();
  const id = event.queryStringParameters && event.queryStringParameters.id;

  if (event.httpMethod === "GET") {
    const { errorResponse } = checkAuth(event, "guru", "admin");
    if (errorResponse) return errorResponse;
    const { data: tes, error } = await supabase.from("tes").select("*").order("tanggal", { ascending: false });
    if (error) return json(500, { error: error.message });
    const [{ data: mapelList }, { data: kelasList }] = await Promise.all([
      supabase.from("mapel").select("*"),
      supabase.from("kelas").select("*"),
    ]);
    const mapelMap = Object.fromEntries((mapelList || []).map((m) => [m.mapel_id, m.nama_mapel]));
    const kelasMap = Object.fromEntries((kelasList || []).map((k) => [k.kelas_id, k.nama_kelas]));
    return json(200, tes.map((t) => ({
      ...t, nama_mapel: mapelMap[t.mapel_id] || null, nama_kelas: t.kelas_id ? kelasMap[t.kelas_id] || null : null,
    })));
  }

  const { errorResponse } = checkAuth(event, "guru");
  if (errorResponse) return errorResponse;

  if (event.httpMethod === "POST") {
    const b = parseBody(event);
    if (!b.mapel_id || !b.judul || !b.jumlah_soal || !b.durasi_menit || !b.tanggal) {
      return json(400, { error: "Semua field tes wajib diisi." });
    }
    const { data, error } = await supabase.from("tes").insert({
      mapel_id: b.mapel_id, kelas_id: b.kelas_id || null, judul: b.judul,
      jumlah_soal: b.jumlah_soal, durasi_menit: b.durasi_menit, tanggal: b.tanggal,
    }).select().single();
    if (error) return json(500, { error: error.message });
    return json(200, { tes_id: data.tes_id });
  }

  if (event.httpMethod === "DELETE") {
    if (!id) return json(400, { error: "ID tes wajib disertakan." });
    const { error } = await supabase.from("tes").delete().eq("tes_id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method tidak diizinkan." });
};
