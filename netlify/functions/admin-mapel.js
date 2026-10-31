const { getClient } = require("../../lib/supabaseClient");
const { json, parseBody, getParam, aman } = require("../../lib/httpHelpers");
const { cekAkses, galatFK, galatUnik, wajib } = require("../../lib/netlifyBersama");

exports.handler = aman(async (event) => {
  const supabase = getClient();
  const id = getParam(event, "id", /\/api\/admin\/mapel\/([^/?]+)/);

  if (event.httpMethod === "GET") {
    const { errorResponse } = await cekAkses(event, "admin", "guru");
    if (errorResponse) return errorResponse;
    return json(200, wajib(await supabase.from("mapel").select("*").order("nama_mapel")));
  }

  const { errorResponse } = await cekAkses(event, "admin");
  if (errorResponse) return errorResponse;
  const nama = String(parseBody(event).nama_mapel || "").trim();

  if (event.httpMethod === "POST") {
    if (!nama) return json(400, { error: "Nama mapel wajib diisi." });
    const { data, error } = await supabase.from("mapel").insert({ nama_mapel: nama }).select().single();
    if (galatUnik(error)) return json(409, { error: "Mapel sudah ada." });
    if (error) return json(500, { error: error.message });
    return json(200, { mapel_id: data.mapel_id });
  }

  if (event.httpMethod === "PUT") {
    if (!id) return json(400, { error: "ID mapel wajib disertakan." });
    if (!nama) return json(400, { error: "Nama mapel wajib diisi." });
    const ada = wajib(await supabase.from("mapel").select("*").eq("mapel_id", id).maybeSingle());
    if (!ada) return json(404, { error: "Mapel tidak ditemukan." });
    const { error } = await supabase.from("mapel").update({ nama_mapel: nama }).eq("mapel_id", id);
    if (galatUnik(error)) return json(409, { error: "Mapel dengan nama itu sudah ada." });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  if (event.httpMethod === "DELETE") {
    if (!id) return json(400, { error: "ID mapel wajib disertakan." });
    const { error } = await supabase.from("mapel").delete().eq("mapel_id", id);
    if (galatFK(error)) return json(409, { error: "Mapel ini masih punya soal atau jadwal tes, jadi tidak bisa dihapus." });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method tidak diizinkan." });
});
