const { getClient } = require("../../lib/supabaseClient");
const { json, getParam, aman } = require("../../lib/httpHelpers");
const { cekAkses, ambilPengaturan, peta, wajib } = require("../../lib/netlifyBersama");

exports.handler = aman(async (event) => {
  const { errorResponse } = await cekAkses(event, "guru", "admin");
  if (errorResponse) return errorResponse;
  const tesId = getParam(event, "tesId", /\/api\/guru\/feedback-summary\/([^/?]+)/);
  if (!tesId) return json(400, { error: "tesId wajib disertakan." });
  const supabase = getClient();
  const anonim = (await ambilPengaturan(supabase)).kuesioner_anonim;

  const kuesioner = wajib(await supabase.from("kuesioner").select("*").eq("tes_id", tesId).maybeSingle());
  if (!kuesioner) return json(200, { ada: false, anonim, jumlahResponden: 0, rataRata: [], komentar: [] });

  const pertanyaanList = [...wajib(await supabase.from("pertanyaan_kuesioner").select("*").eq("kuesioner_id", kuesioner.kuesioner_id))]
    .sort((a, b) => Number(a.pertanyaan_kuesioner_id) - Number(b.pertanyaan_kuesioner_id));
  const pertanyaanIds = pertanyaanList.map((p) => p.pertanyaan_kuesioner_id);
  const responList = pertanyaanIds.length
    ? [...wajib(await supabase.from("respon_kuesioner").select("*").in("pertanyaan_id", pertanyaanIds))]
        .sort((a, b) => Number(a.respon_kuesioner_id) - Number(b.respon_kuesioner_id))
    : [];

  const rataRata = pertanyaanList.map((p) => {
    const jawaban = responList.filter((r) => Number(r.pertanyaan_id) === Number(p.pertanyaan_kuesioner_id) && r.skor !== null);
    const rata = jawaban.length ? jawaban.reduce((a, r) => a + Number(r.skor), 0) / jawaban.length : null;
    return { id: p.pertanyaan_kuesioner_id, pernyataan: p.soal, rata: rata !== null ? Number(rata.toFixed(2)) : null, n: jawaban.length };
  });

  const responden = new Set(responList.map((r) => String(r.siswa_id)));
  const denganKomentar = responList.filter((r) => r.komentar);
  let komentar;
  if (anonim) {
    // Anonim: hanya teks komentar, tanpa nama/kelas/ID sesi, dan urutannya diacak
    // supaya tidak bisa dicocokkan dengan urutan siswa selesai tes.
    komentar = denganKomentar.map((r) => ({ komentar: r.komentar }));
    for (let i = komentar.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [komentar[i], komentar[k]] = [komentar[k], komentar[i]];
    }
  } else {
    const users = peta(wajib(await supabase.from("users").select("*")), "users_id");
    const kelas = peta(wajib(await supabase.from("kelas").select("*")), "kelas_id", "nama_kelas");
    komentar = denganKomentar.map((r) => {
      const u = users[String(r.siswa_id)] || {};
      return { komentar: r.komentar, nama: u.nama || null, nama_kelas: u.kelas_id ? kelas[String(u.kelas_id)] || null : null };
    });
  }

  return json(200, { ada: true, anonim, judul: kuesioner.judul, jumlahResponden: responden.size, rataRata, komentar });
});
