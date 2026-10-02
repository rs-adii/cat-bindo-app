const supabase = require("../../lib/supabaseClient");

function resp(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return resp(405, { error: "Method not allowed" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return resp(400, { error: "Body tidak valid." });
  }
  const { sessionId, jawaban, komentar } = body;

  const { data: session, error: selErr } = await supabase
    .from("sessions")
    .select("nama, kelas")
    .eq("id", sessionId)
    .single();
  if (selErr || !session) return resp(404, { error: "Sesi tidak ditemukan." });

  const { error } = await supabase.from("feedbacks").insert({
    session_id: sessionId,
    nama: session.nama,
    kelas: session.kelas,
    jawaban: jawaban || {},
    komentar: (komentar || "").trim(),
  });
  if (error) return resp(500, { error: error.message });

  return resp(200, { ok: true });
};
