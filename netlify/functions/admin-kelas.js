const { getClient } = require("../../lib/supabaseClient");
const { json, parseBody, getParam, aman } = require("../../lib/httpHelpers");
const { cekAkses, galatFK, wajib } = require("../../lib/netlifyBersama");

exports.handler = aman(async (event) => {
  const supabase = getClient();
  const id = getParam(event, "id", /\/api\/admin\/kelas\/([^/?]+)/);

  if (event.httpMethod === "GET") {
    const { errorResponse } = await cekAkses(event, "admin", "guru");
    if (errorResponse) return errorResponse;
    return json(200, wajib(await supabase.from("kelas").select("*").order("nama_kelas")));
  }

  const { errorResponse } = await cekAkses(event, "admin");
  if (errorResponse) return errorResponse;
  const body = parseBody(event);
  const nama = String(body.nama_kelas || "").trim();
  const jurusan = body.jurusan ? String(body.jurusan).trim() : null;

  if (event.httpMethod === "POST") {
    if (!nama) return json(400, { error: "Nama kelas wajib diisi." });
    const data = wajib(await supabase.from("kelas").insert({ nama_kelas: nama, jurusan }).select().single());
    return json(200, { kelas_id: data.kelas_id });
  }

  if (event.httpMethod === "PUT") {
    if (!id) return json(400, { error: "ID kelas wajib disertakan." });
    if (!nama) return json(400, { error: "Nama kelas wajib diisi." });
    const ada = wajib(await supabase.from("kelas").select("*").eq("kelas_id", id).maybeSingle());
    if (!ada) return json(404, { error: "Kelas tidak ditemukan." });
    wajib(await supabase.from("kelas").update({ nama_kelas: nama, jurusan }).eq("kelas_id", id));
    return json(200, { ok: true });
  }

  if (event.httpMethod === "DELETE") {
    if (!id) return json(400, { error: "ID kelas wajib disertakan." });
    const { error } = await supabase.from("kelas").delete().eq("kelas_id", id);
    if (galatFK(error)) return json(409, { error: "Kelas ini masih punya siswa atau jadwal tes, jadi tidak bisa dihapus." });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method tidak diizinkan." });
});
