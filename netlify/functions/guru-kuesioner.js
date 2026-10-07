const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json, parseBody } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  const { errorResponse } = checkAuth(event, "guru", "admin");
  if (errorResponse) return errorResponse;
  const supabase = getClient();

  if (event.httpMethod === "GET") {
    const tesId = event.queryStringParameters && event.queryStringParameters.tesId;
    if (!tesId) return json(400, { error: "tesId wajib disertakan." });
    const { data: kuesioner } = await supabase.from("kuesioner").select("*").eq("tes_id", tesId).maybeSingle();
    if (!kuesioner) return json(200, null);
    const { data: pertanyaan } = await supabase.from("pertanyaan_kuesioner").select("*").eq("kuesioner_id", kuesioner.kuesioner_id);
    return json(200, { ...kuesioner, pertanyaan: pertanyaan || [] });
  }

  if (event.httpMethod === "POST") {
    const { tes_id, judul, pertanyaan } = parseBody(event);
    if (!tes_id || !judul || !Array.isArray(pertanyaan) || pertanyaan.length === 0) {
      return json(400, { error: "Judul dan minimal satu pertanyaan wajib diisi." });
    }
    const { data: kuesioner, error } = await supabase.from("kuesioner").insert({ tes_id, judul }).select().single();
    if (error) return json(500, { error: error.message });
    const rows = pertanyaan.map((soal) => ({ kuesioner_id: kuesioner.kuesioner_id, soal }));
    const { error: errP } = await supabase.from("pertanyaan_kuesioner").insert(rows);
    if (errP) return json(500, { error: errP.message });
    return json(200, { kuesioner_id: kuesioner.kuesioner_id });
  }

  return json(405, { error: "Method tidak diizinkan." });
};
