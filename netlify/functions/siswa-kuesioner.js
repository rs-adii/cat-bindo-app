const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  const { errorResponse } = checkAuth(event, "siswa");
  if (errorResponse) return errorResponse;
  const tesId = event.queryStringParameters && event.queryStringParameters.tesId;
  if (!tesId) return json(400, { error: "tesId wajib disertakan." });
  const supabase = getClient();

  const { data: kuesioner } = await supabase.from("kuesioner").select("*").eq("tes_id", tesId).maybeSingle();
  if (!kuesioner) return json(200, null);
  const { data: pertanyaan } = await supabase.from("pertanyaan_kuesioner").select("*").eq("kuesioner_id", kuesioner.kuesioner_id);
  return json(200, { kuesioner_id: kuesioner.kuesioner_id, judul: kuesioner.judul, pertanyaan: pertanyaan || [] });
};
