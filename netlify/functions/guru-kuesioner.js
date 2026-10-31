const { getClient } = require("../../lib/supabaseClient");
const { json, parseBody, getParam, aman } = require("../../lib/httpHelpers");
const { cekAkses, wajib } = require("../../lib/netlifyBersama");

function validasiKuesioner(body) {
  const judul = String((body && body.judul) || "").trim();
  const pertanyaan = Array.isArray(body && body.pertanyaan) ? body.pertanyaan.map((p) => String(p || "").trim()).filter(Boolean) : [];
  if (!judul || pertanyaan.length === 0) return { error: "Judul dan minimal satu pertanyaan wajib diisi." };
  if (pertanyaan.length > 30) return { error: "Maksimal 30 pertanyaan." };
  if (pertanyaan.some((p) => p.length > 300)) return { error: "Setiap pertanyaan maksimal 300 karakter." };
  return { judul, pertanyaan };
}
async function pertanyaanDari(supabase, kuesionerId) {
  const data = wajib(await supabase.from("pertanyaan_kuesioner").select("*").eq("kuesioner_id", kuesionerId));
  return [...data].sort((a, b) => Number(a.pertanyaan_kuesioner_id) - Number(b.pertanyaan_kuesioner_id));
}
async function jumlahRespon(supabase, pertanyaan) {
  const ids = pertanyaan.map((p) => p.pertanyaan_kuesioner_id);
  if (!ids.length) return 0;
  const respon = wajib(await supabase.from("respon_kuesioner").select("*").in("pertanyaan_id", ids));
  return new Set(respon.map((r) => String(r.siswa_id))).size;
}

exports.handler = aman(async (event) => {
  const supabase = getClient();
  const tesId = getParam(event, "tesId", /\/api\/guru\/kuesioner\/([^/?]+)/);

  if (event.httpMethod === "GET") {
    const { errorResponse } = await cekAkses(event, "guru", "admin");
    if (errorResponse) return errorResponse;
    if (!tesId) return json(400, { error: "tesId wajib disertakan." });
    const kuesioner = wajib(await supabase.from("kuesioner").select("*").eq("tes_id", tesId).maybeSingle());
    if (!kuesioner) return json(200, null);
    const pertanyaan = await pertanyaanDari(supabase, kuesioner.kuesioner_id);
    return json(200, { ...kuesioner, pertanyaan, jumlahRespon: await jumlahRespon(supabase, pertanyaan) });
  }

  const { errorResponse } = await cekAkses(event, "guru");
  if (errorResponse) return errorResponse;
  const body = parseBody(event);
  const v = validasiKuesioner(body);

  if (event.httpMethod === "POST") {
    if (v.error) return json(400, { error: v.error });
    const tes = wajib(await supabase.from("tes").select("*").eq("tes_id", body.tes_id).maybeSingle());
    if (!tes) return json(404, { error: "Tes tidak ditemukan." });
    const ada = wajib(await supabase.from("kuesioner").select("*").eq("tes_id", body.tes_id).maybeSingle());
    if (ada) return json(409, { error: "Tes ini sudah punya kuesioner. Ubah kuesioner yang ada." });
    const kuesioner = wajib(await supabase.from("kuesioner").insert({ tes_id: body.tes_id, judul: v.judul }).select().single());
    wajib(await supabase.from("pertanyaan_kuesioner").insert(v.pertanyaan.map((soal) => ({ kuesioner_id: kuesioner.kuesioner_id, soal }))));
    return json(200, { kuesioner_id: kuesioner.kuesioner_id });
  }

  // Pertanyaan hanya bisa diganti selama belum ada siswa yang mengisi, supaya
  // rekap rata-rata tidak mencampur jawaban untuk pertanyaan yang berbeda.
  if (event.httpMethod === "PUT") {
    if (!tesId) return json(400, { error: "tesId wajib disertakan." });
    if (v.error) return json(400, { error: v.error });
    const k = wajib(await supabase.from("kuesioner").select("*").eq("tes_id", tesId).maybeSingle());
    if (!k) return json(404, { error: "Kuesioner untuk tes ini belum ada." });
    const lama = await pertanyaanDari(supabase, k.kuesioner_id);
    const berubah = lama.length !== v.pertanyaan.length || lama.some((p, i) => p.soal !== v.pertanyaan[i]);
    if (berubah && (await jumlahRespon(supabase, lama)) > 0) {
      return json(409, { error: "Kuesioner ini sudah diisi siswa, jadi pertanyaannya tidak bisa diubah lagi. Judul masih bisa diganti." });
    }
    wajib(await supabase.from("kuesioner").update({ judul: v.judul }).eq("kuesioner_id", k.kuesioner_id));
    if (berubah) {
      wajib(await supabase.from("pertanyaan_kuesioner").delete().eq("kuesioner_id", k.kuesioner_id));
      wajib(await supabase.from("pertanyaan_kuesioner").insert(v.pertanyaan.map((soal) => ({ kuesioner_id: k.kuesioner_id, soal }))));
    }
    return json(200, { ok: true });
  }

  return json(405, { error: "Method tidak diizinkan." });
});
