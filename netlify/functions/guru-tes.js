const { getClient } = require("../../lib/supabaseClient");
const { json, parseBody, getParam, aman } = require("../../lib/httpHelpers");
const { cekAkses, galatFK, peta, wajib } = require("../../lib/netlifyBersama");

exports.handler = aman(async (event) => {
  const supabase = getClient();
  const id = getParam(event, "id", /\/api\/guru\/tes\/([^/?]+)/);

  if (event.httpMethod === "GET") {
    const { errorResponse } = await cekAkses(event, "guru", "admin");
    if (errorResponse) return errorResponse;
    const tes = wajib(await supabase.from("tes").select("*").order("tanggal", { ascending: false }));
    const [mapelMap, kelasMap] = [
      peta(wajib(await supabase.from("mapel").select("*")), "mapel_id", "nama_mapel"),
      peta(wajib(await supabase.from("kelas").select("*")), "kelas_id", "nama_kelas"),
    ];
    const urut = [...tes].sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)) || Number(b.tes_id) - Number(a.tes_id));
    return json(200, urut.map((t) => ({
      ...t, nama_mapel: mapelMap[String(t.mapel_id)] || null, nama_kelas: t.kelas_id ? kelasMap[String(t.kelas_id)] || null : null,
    })));
  }

  const { errorResponse } = await cekAkses(event, "guru");
  if (errorResponse) return errorResponse;

  if (event.httpMethod === "POST") {
    const b = parseBody(event);
    if (!b.mapel_id || !b.judul || !b.jumlah_soal || !b.durasi_menit || !b.tanggal) {
      return json(400, { error: "Semua field tes wajib diisi." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.tanggal))) return json(400, { error: "Format tanggal harus YYYY-MM-DD." });
    if (!(Number(b.jumlah_soal) >= 1) || !(Number(b.durasi_menit) >= 1)) return json(400, { error: "Jumlah soal dan durasi minimal 1." });
    const data = wajib(await supabase.from("tes").insert({
      mapel_id: b.mapel_id, kelas_id: b.kelas_id || null, judul: String(b.judul).trim(),
      jumlah_soal: Number(b.jumlah_soal), durasi_menit: Number(b.durasi_menit), tanggal: b.tanggal,
    }).select().single());
    return json(200, { tes_id: data.tes_id });
  }

  if (event.httpMethod === "DELETE") {
    if (!id) return json(400, { error: "ID tes wajib disertakan." });
    const { error } = await supabase.from("tes").delete().eq("tes_id", id);
    if (galatFK(error)) return json(409, { error: "Tes ini sudah dikerjakan siswa atau punya kuesioner, jadi tidak bisa dihapus." });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method tidak diizinkan." });
});
