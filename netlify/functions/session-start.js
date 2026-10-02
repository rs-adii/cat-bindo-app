const { randomUUID } = require("crypto");
const supabase = require("../../lib/supabaseClient");
const { pickNextItem, publicItem, MIN_ITEMS, MAX_ITEMS } = require("../../lib/catEngine");

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

  const nama = (body.nama || "").trim();
  const kelas = (body.kelas || "").trim();
  if (!nama) return resp(400, { error: "Nama wajib diisi." });

  const session = {
    id: randomUUID(),
    nama,
    kelas,
    theta: 0,
    se: 99,
    administered: [],
    status: "ongoing",
  };
  const firstItem = pickNextItem(session);

  const { error } = await supabase.from("sessions").insert({
    id: session.id,
    nama: session.nama,
    kelas: session.kelas,
    theta: session.theta,
    se: session.se,
    administered: session.administered,
    status: session.status,
  });
  if (error) return resp(500, { error: error.message });

  return resp(200, {
    sessionId: session.id,
    item: publicItem(firstItem),
    progress: { jumlah: 0, min: MIN_ITEMS, max: MAX_ITEMS },
  });
};
