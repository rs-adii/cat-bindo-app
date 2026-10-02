const supabase = require("../../lib/supabaseClient");
const { loadDimensi } = require("../../lib/catEngine");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { data: feedbacks, error } = await supabase
    .from("feedbacks")
    .select("*")
    .order("waktu", { ascending: false });
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const dims = loadDimensi();
  const totals = {};
  const counts = {};
  dims.forEach((d) => {
    totals[d.id] = 0;
    counts[d.id] = 0;
  });
  const komentar = [];

  for (const fb of feedbacks) {
    for (const d of dims) {
      const v = fb.jawaban ? fb.jawaban[d.id] : null;
      if (typeof v === "number") {
        totals[d.id] += v;
        counts[d.id] += 1;
      }
    }
    if (fb.komentar) {
      komentar.push({ nama: fb.nama, kelas: fb.kelas, teks: fb.komentar, waktu: fb.waktu });
    }
  }

  const rataRata = dims.map((d) => ({
    id: d.id,
    dimensi: d.label,
    rata: counts[d.id] ? Number((totals[d.id] / counts[d.id]).toFixed(2)) : null,
    n: counts[d.id],
  }));

  const result = {
    jumlahResponden: feedbacks.length,
    rataRata,
    komentar: komentar.slice(0, 20),
  };

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) };
};
