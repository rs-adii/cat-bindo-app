const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json, parseBody } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  const supabase = getClient();
  const id = event.queryStringParameters && event.queryStringParameters.id;

  if (event.httpMethod === "GET") {
    const { errorResponse } = checkAuth(event, "guru", "admin");
    if (errorResponse) return errorResponse;
    const { data: soal, error } = await supabase.from("soal").select("*").order("mapel_id").order("tingkat_kesulitan");
    if (error) return json(500, { error: error.message });
    const { data: mapelList } = await supabase.from("mapel").select("*");
    const mapelMap = Object.fromEntries((mapelList || []).map((m) => [m.mapel_id, m.nama_mapel]));
    return json(200, soal.map((s) => ({ ...s, nama_mapel: mapelMap[s.mapel_id] || null })));
  }

  const { user, errorResponse } = checkAuth(event, "guru");
  if (errorResponse) return errorResponse;

  if (event.httpMethod === "POST") {
    const b = parseBody(event);
    if (!b.mapel_id || !b.pertanyaan || !b.opsi_a || !b.opsi_b || !b.opsi_c || !b.opsi_d || !b.kunci || !b.tingkat_kesulitan) {
      return json(400, { error: "Semua field soal wajib diisi." });
    }
    const { data, error } = await supabase.from("soal").insert({
      mapel_id: b.mapel_id, guru_id: user.users_id, pertanyaan: b.pertanyaan,
      opsi_a: b.opsi_a, opsi_b: b.opsi_b, opsi_c: b.opsi_c, opsi_d: b.opsi_d,
      kunci: b.kunci, tingkat_kesulitan: b.tingkat_kesulitan,
    }).select().single();
    if (error) return json(500, { error: error.message });
    return json(200, { soal_id: data.soal_id });
  }

  if (event.httpMethod === "PUT") {
    if (!id) return json(400, { error: "ID soal wajib disertakan." });
    const b = parseBody(event);
    const patch = {};
    ["pertanyaan", "opsi_a", "opsi_b", "opsi_c", "opsi_d", "kunci", "tingkat_kesulitan"].forEach((k) => {
      if (b[k] !== undefined) patch[k] = b[k];
    });
    const { error } = await supabase.from("soal").update(patch).eq("soal_id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  if (event.httpMethod === "DELETE") {
    if (!id) return json(400, { error: "ID soal wajib disertakan." });
    const { error } = await supabase.from("soal").delete().eq("soal_id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method tidak diizinkan." });
};
