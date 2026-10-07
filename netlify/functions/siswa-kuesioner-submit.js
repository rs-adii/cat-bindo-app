const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json, parseBody } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { user, errorResponse } = checkAuth(event, "siswa");
  if (errorResponse) return errorResponse;
  const { sesiId, jawaban, komentar } = parseBody(event);
  if (!Array.isArray(jawaban) || jawaban.length === 0) return json(400, { error: "Jawaban kuesioner kosong." });
  const supabase = getClient();

  const rows = jawaban.map((jw, idx) => ({
    pertanyaan_id: jw.pertanyaanId,
    siswa_id: user.users_id,
    sesi_id: sesiId || null,
    skor: jw.skor,
    komentar: idx === 0 ? (komentar || null) : null,
  }));
  const { error } = await supabase.from("respon_kuesioner").insert(rows);
  if (error) return json(500, { error: error.message });
  return json(200, { ok: true });
};
