const { getClient } = require("../../lib/supabaseClient");
const { json, parseBody, aman } = require("../../lib/httpHelpers");
const { sudahIsiKuesioner } = require("../../lib/sesiSupabase");
const { cekAkses, wajib } = require("../../lib/netlifyBersama");

exports.handler = aman(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { user, errorResponse } = await cekAkses(event, "siswa");
  if (errorResponse) return errorResponse;
  const { jawaban, komentar } = parseBody(event);
  if (!Array.isArray(jawaban) || jawaban.length === 0) return json(400, { error: "Jawaban kuesioner kosong." });
  const supabase = getClient();

  const ids = jawaban.map((x) => Number(x && x.pertanyaanId));
  const pertanyaan = wajib(await supabase.from("pertanyaan_kuesioner").select("*").in("pertanyaan_kuesioner_id", ids));
  const kId = pertanyaan[0] && pertanyaan[0].kuesioner_id;
  if (pertanyaan.length !== new Set(ids).size || ids.length !== new Set(ids).size || pertanyaan.some((p) => Number(p.kuesioner_id) !== Number(kId))) {
    return json(400, { error: "Pertanyaan kuesioner tidak valid." });
  }
  const semua = wajib(await supabase.from("pertanyaan_kuesioner").select("*").eq("kuesioner_id", kId));
  if (ids.length !== semua.length) return json(400, { error: "Semua pernyataan wajib diisi." });
  if (jawaban.some((x) => !Number.isInteger(Number(x.skor)) || Number(x.skor) < 1 || Number(x.skor) > 5)) return json(400, { error: "Skor harus 1–5." });

  const k = wajib(await supabase.from("kuesioner").select("*").eq("kuesioner_id", kId).single());
  const sesiSelesai = wajib(await supabase.from("sesi_tes").select("*").eq("tes_id", k.tes_id).eq("siswa_id", user.users_id).eq("status", "selesai"));
  if (!sesiSelesai.length) return json(403, { error: "Kuesioner bisa diisi setelah kamu menyelesaikan tesnya." });
  if (await sudahIsiKuesioner(supabase, kId, user.users_id)) return json(409, { error: "Kamu sudah mengisi kuesioner ini. Terima kasih!" });
  const sesiId = sesiSelesai.reduce((a, s) => Math.max(a, Number(s.sesites_id)), 0);

  const teksKomentar = String(komentar || "").trim().slice(0, 1000) || null;
  wajib(await supabase.from("respon_kuesioner").insert(jawaban.map((jw, idx) => ({
    pertanyaan_id: Number(jw.pertanyaanId), siswa_id: user.users_id, sesi_id: sesiId,
    skor: Number(jw.skor), komentar: idx === 0 ? teksKomentar : null,
  }))));
  return json(200, { ok: true });
});
