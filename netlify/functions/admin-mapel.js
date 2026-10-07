const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json, parseBody } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  const supabase = getClient();
  const id = event.queryStringParameters && event.queryStringParameters.id;

  if (event.httpMethod === "GET") {
    const { errorResponse } = checkAuth(event, "admin", "guru");
    if (errorResponse) return errorResponse;
    const { data, error } = await supabase.from("mapel").select("*").order("nama_mapel");
    if (error) return json(500, { error: error.message });
    return json(200, data);
  }

  const { errorResponse } = checkAuth(event, "admin");
  if (errorResponse) return errorResponse;

  if (event.httpMethod === "POST") {
    const { nama_mapel } = parseBody(event);
    if (!nama_mapel) return json(400, { error: "Nama mapel wajib diisi." });
    const { data, error } = await supabase.from("mapel").insert({ nama_mapel }).select().single();
    if (error) return json(400, { error: error.message.includes("duplicate") ? "Mapel sudah ada." : error.message });
    return json(200, { mapel_id: data.mapel_id });
  }

  if (event.httpMethod === "DELETE") {
    if (!id) return json(400, { error: "ID mapel wajib disertakan." });
    const { error } = await supabase.from("mapel").delete().eq("mapel_id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method tidak diizinkan." });
};
