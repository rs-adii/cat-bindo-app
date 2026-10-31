const { getClient } = require("../../lib/supabaseClient");
const { json, getParam, aman } = require("../../lib/httpHelpers");
const ringkasan = require("../../lib/ringkasan");
const { ambilJawaban, sudahIsiKuesioner } = require("../../lib/sesiSupabase");
const { cekAkses, ambilPengaturan, peta, sama, wajib } = require("../../lib/netlifyBersama");

// GET /api/siswa/hasil          -> daftar hasil tes yang sudah selesai
// GET /api/siswa/hasil/:sesiId  -> rincian satu hasil (per tingkat, alur tingkat, status kuesioner)
exports.handler = aman(async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method tidak diizinkan." });
  const { user, errorResponse } = await cekAkses(event, "siswa");
  if (errorResponse) return errorResponse;
  const supabase = getClient();
  const peng = await ambilPengaturan(supabase);
  const sesiId = getParam(event, "sesiId", /\/api\/siswa\/hasil\/([^/?]+)/);

  const tesMap = peta(wajib(await supabase.from("tes").select("*")), "tes_id");
  const mapelMap = peta(wajib(await supabase.from("mapel").select("*")), "mapel_id", "nama_mapel");

  if (!sesiId) {
    const sesiList = wajib(await supabase.from("sesi_tes").select("*").eq("siswa_id", user.users_id).eq("status", "selesai"));
    const rows = sesiList.map((s) => {
      const t = tesMap[String(s.tes_id)] || {};
      return {
        sesites_id: s.sesites_id, tes_id: s.tes_id, judul_tes: t.judul, nama_mapel: mapelMap[String(t.mapel_id)] || null,
        nilai: peng.tampilkan_nilai ? s.nilai : null, level_akhir: s.level_akhir, selesai: s.selesai,
      };
    });
    rows.sort((a, b) => String(b.selesai).localeCompare(String(a.selesai)));
    return json(200, rows);
  }

  const s = wajib(await supabase.from("sesi_tes").select("*").eq("sesites_id", sesiId).maybeSingle());
  if (!s || !sama(s.siswa_id, user.users_id) || s.status !== "selesai") return json(404, { error: "Hasil tes tidak ditemukan." });
  const t = tesMap[String(s.tes_id)] || {};
  const rinci = ringkasan.rincianJawaban(await ambilJawaban(supabase, s.sesites_id));
  const k = wajib(await supabase.from("kuesioner").select("*").eq("tes_id", s.tes_id).maybeSingle());
  return json(200, {
    sesites_id: s.sesites_id, tes_id: s.tes_id, judul_tes: t.judul, nama_mapel: mapelMap[String(t.mapel_id)] || null,
    selesai: s.selesai, level_akhir: s.level_akhir, jumlah_soal: t.jumlah_soal, jumlahDijawab: rinci.jumlahDijawab,
    tampilkanNilai: peng.tampilkan_nilai, bobotAktif: peng.bobot_skor,
    nilai: peng.tampilkan_nilai ? s.nilai : null,
    perLevel: peng.tampilkan_nilai ? rinci.perLevel : null,
    alur: rinci.alur.map((a) => (peng.tampilkan_nilai ? a : { level: a.level })),
    kuesioner: k ? { ada: true, sudahDiisi: await sudahIsiKuesioner(supabase, k.kuesioner_id, user.users_id) } : { ada: false },
  });
});
