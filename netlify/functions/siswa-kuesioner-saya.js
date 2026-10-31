const { getClient } = require("../../lib/supabaseClient");
const { json, aman } = require("../../lib/httpHelpers");
const { sudahIsiKuesioner } = require("../../lib/sesiSupabase");
const { cekAkses, peta, wajib } = require("../../lib/netlifyBersama");

// Daftar kuesioner untuk tes yang sudah diselesaikan siswa (untuk Beranda & menu Kuesioner)
exports.handler = aman(async (event) => {
  const { user, errorResponse } = await cekAkses(event, "siswa");
  if (errorResponse) return errorResponse;
  const supabase = getClient();
  const sesiSelesai = wajib(await supabase.from("sesi_tes").select("*").eq("siswa_id", user.users_id).eq("status", "selesai"));
  if (!sesiSelesai.length) return json(200, []);
  const tesMap = peta(wajib(await supabase.from("tes").select("*")), "tes_id");
  const kuesionerMap = peta(wajib(await supabase.from("kuesioner").select("*").in("tes_id", sesiSelesai.map((s) => s.tes_id))), "tes_id");

  const perTes = new Map();
  for (const s of [...sesiSelesai].sort((a, b) => String(b.selesai).localeCompare(String(a.selesai)))) {
    const k = kuesionerMap[String(s.tes_id)];
    if (!k || perTes.has(String(s.tes_id))) continue;
    perTes.set(String(s.tes_id), {
      kuesioner_id: k.kuesioner_id, judul: k.judul, tes_id: s.tes_id, judul_tes: (tesMap[String(s.tes_id)] || {}).judul,
      sesi_id: s.sesites_id, sudahDiisi: await sudahIsiKuesioner(supabase, k.kuesioner_id, user.users_id),
    });
  }
  return json(200, [...perTes.values()]);
});
