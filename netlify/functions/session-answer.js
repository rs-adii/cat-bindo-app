const supabase = require("../../lib/supabaseClient");
const {
  estimateTheta,
  computeSE,
  pickNextItem,
  skorFromTheta,
  kategoriSkor,
  publicItem,
  loadBank,
  MIN_ITEMS,
  MAX_ITEMS,
  SE_STOP,
} = require("../../lib/catEngine");

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
  const { sessionId, itemId, jawaban } = body;
  if (!sessionId || !itemId || typeof jawaban !== "number") {
    return resp(400, { error: "Data tidak lengkap." });
  }

  const { data: session, error: selErr } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (selErr || !session) return resp(404, { error: "Sesi tidak ditemukan." });
  if (session.status !== "ongoing") return resp(400, { error: "Sesi ini sudah selesai." });

  const item = loadBank().find((it) => it.id === itemId);
  if (!item) return resp(400, { error: "Soal tidak ditemukan." });
  if ((session.administered || []).some((a) => a.itemId === itemId)) {
    return resp(400, { error: "Soal ini sudah dijawab pada sesi ini." });
  }

  const benar = jawaban === item.kunci;
  const administered = [
    ...(session.administered || []),
    { itemId: item.id, b: item.b, x: benar ? 1 : 0, kompetensi: item.kompetensi },
  ];
  const theta = estimateTheta(administered, session.theta);
  const se = computeSE(administered, theta);
  const jumlah = administered.length;
  const selesai = jumlah >= MAX_ITEMS || (jumlah >= MIN_ITEMS && se <= SE_STOP);

  if (selesai) {
    const skor = skorFromTheta(theta);
    const { error } = await supabase
      .from("sessions")
      .update({ administered, theta, se, status: "selesai", selesai: new Date().toISOString(), skor })
      .eq("id", sessionId);
    if (error) return resp(500, { error: error.message });
    return resp(200, {
      selesai: true,
      hasil: {
        sessionId,
        skor,
        kategori: kategoriSkor(skor),
        theta: Number(theta.toFixed(2)),
        se: Number(se.toFixed(2)),
        jumlahButir: jumlah,
      },
    });
  }

  const nextItem = pickNextItem({ theta, administered });
  const { error } = await supabase.from("sessions").update({ administered, theta, se }).eq("id", sessionId);
  if (error) return resp(500, { error: error.message });

  return resp(200, {
    selesai: false,
    item: publicItem(nextItem),
    progress: { jumlah, min: MIN_ITEMS, max: MAX_ITEMS },
  });
};
