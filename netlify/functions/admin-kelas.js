const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json, parseBody } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  const { errorResponse: errGet } = checkAuth(event, "admin", "guru");
  const supabase = getClient();
  const id = event.queryStringParameters && event.queryStringParameters.id;

  if (event.httpMethod === "GET") {
    if (errGet) return errGet;
    const { data, error } = await supabase.from("kelas").select("*").order("nama_kelas");
    if (error) return json(500, { error: error.message });
    return json(200, data);
  }

  const { errorResponse } = checkAuth(event, "admin");
  if (errorResponse) return errorResponse;

  if (event.httpMethod === "POST") {
    const { nama_kelas, jurusan } = parseBody(event);
    if (!nama_kelas) return json(400, { error: "Nama kelas wajib diisi." });
    const { data, error } = await supabase.from("kelas").insert({ nama_kelas, jurusan: jurusan || null }).select().single();
    if (error) return json(500, { error: error.message });
    return json(200, { kelas_id: data.kelas_id });
  }

  if (event.httpMethod === "PUT") {
    if (!id) return json(400, { error: "ID kelas wajib disertakan." });
    const { nama_kelas, jurusan } = parseBody(event);
    const { error } = await supabase.from("kelas").update({ nama_kelas, jurusan: jurusan || null }).eq("kelas_id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  if (event.httpMethod === "DELETE") {
    if (!id) return json(400, { error: "ID kelas wajib disertakan." });
    const { error } = await supabase.from("kelas").delete().eq("kelas_id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method tidak diizinkan." });
};
