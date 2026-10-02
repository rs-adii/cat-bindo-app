const supabase = require("../../lib/supabaseClient");
const { kategoriSkor } = require("../../lib/catEngine");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("status", "selesai")
    .order("selesai", { ascending: false });

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const list = data.map((s) => ({
    id: s.id,
    nama: s.nama,
    kelas: s.kelas,
    skor: s.skor,
    kategori: kategoriSkor(s.skor),
    theta: Number(Number(s.theta).toFixed(2)),
    se: Number(Number(s.se).toFixed(2)),
    jumlahButir: (s.administered || []).length,
    mulai: s.mulai,
    selesai: s.selesai,
  }));

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(list) };
};
