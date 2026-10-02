const supabase = require("../../lib/supabaseClient");
const { loadBank } = require("../../lib/catEngine");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { data: sessions, error } = await supabase.from("sessions").select("administered");
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const usage = {};
  const correct = {};
  const total = {};
  for (const s of sessions) {
    for (const a of s.administered || []) {
      usage[a.itemId] = (usage[a.itemId] || 0) + 1;
      total[a.itemId] = (total[a.itemId] || 0) + 1;
      correct[a.itemId] = (correct[a.itemId] || 0) + a.x;
    }
  }

  const stats = loadBank()
    .map((it) => ({
      id: it.id,
      kompetensi: it.kompetensi,
      kesulitan: it.b,
      dipakai: usage[it.id] || 0,
      proporsiBenar: total[it.id] ? Number((correct[it.id] / total[it.id]).toFixed(2)) : null,
    }))
    .sort((a, b) => a.kesulitan - b.kesulitan);

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(stats) };
};
