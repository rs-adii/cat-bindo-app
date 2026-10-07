const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  const { errorResponse } = checkAuth(event, "guru", "admin");
  if (errorResponse) return errorResponse;
  const tesId = event.queryStringParameters && event.queryStringParameters.tesId;
  if (!tesId) return json(400, { error: "tesId wajib disertakan." });
  const supabase = getClient();

  const { data: kuesioner } = await supabase.from("kuesioner").select("*").eq("tes_id", tesId).maybeSingle();
  if (!kuesioner) return json(200, { jumlahResponden: 0, rataRata: [], komentar: [] });

  const { data: pertanyaanList } = await supabase.from("pertanyaan_kuesioner").select("*").eq("kuesioner_id", kuesioner.kuesioner_id);
  const pertanyaanIds = (pertanyaanList || []).map((p) => p.pertanyaan_kuesioner_id);

  const { data: responList } = pertanyaanIds.length
    ? await supabase.from("respon_kuesioner").select("*").in("pertanyaan_id", pertanyaanIds)
    : { data: [] };

  const [{ data: users }, { data: kelasList }] = await Promise.all([
    supabase.from("users").select("*"),
    supabase.from("kelas").select("*"),
  ]);
  const userMap = Object.fromEntries((users || []).map((u) => [u.users_id, u]));
  const kelasMap = Object.fromEntries((kelasList || []).map((k) => [k.kelas_id, k.nama_kelas]));

  const rataRata = (pertanyaanList || []).map((p) => {
    const jawaban = (responList || []).filter((r) => r.pertanyaan_id === p.pertanyaan_kuesioner_id && r.skor !== null);
    const rata = jawaban.length ? jawaban.reduce((a, r) => a + r.skor, 0) / jawaban.length : null;
    return { id: p.pertanyaan_kuesioner_id, pernyataan: p.soal, rata: rata !== null ? Number(rata.toFixed(2)) : null, n: jawaban.length };
  });

  const sesiUnik = new Set((responList || []).map((r) => r.sesi_id).filter(Boolean));
  const komentarMap = new Map();
  (responList || []).forEach((r) => {
    if (r.komentar && !komentarMap.has(r.sesi_id)) {
      const u = userMap[r.siswa_id] || {};
      komentarMap.set(r.sesi_id, { sesi_id: r.sesi_id, nama: u.nama, nama_kelas: u.kelas_id ? kelasMap[u.kelas_id] : null, komentar: r.komentar });
    }
  });

  return json(200, { jumlahResponden: sesiUnik.size, rataRata, komentar: Array.from(komentarMap.values()) });
};
