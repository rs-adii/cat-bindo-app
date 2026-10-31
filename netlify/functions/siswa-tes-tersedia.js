const { getClient } = require("../../lib/supabaseClient");
const { json, aman } = require("../../lib/httpHelpers");
const { sapuSesiKadaluarsa } = require("../../lib/sesiSupabase");
const { cekAkses, ambilPengaturan, peta, sama, wajib } = require("../../lib/netlifyBersama");
const { sudahDibuka } = require("../../lib/tanggal");

exports.handler = aman(async (event) => {
  const { user, errorResponse } = await cekAkses(event, "siswa");
  if (errorResponse) return errorResponse;
  const supabase = getClient();
  await sapuSesiKadaluarsa(supabase); // tutup sesi yang waktunya habis tapi ditinggalkan siswa
  const peng = await ambilPengaturan(supabase);

  const tesList = wajib(await supabase.from("tes").select("*").order("tanggal", { ascending: false }));
  const tersedia = tesList.filter((t) => t.kelas_id === null || sama(t.kelas_id, user.kelas_id));
  if (tersedia.length === 0) return json(200, []);

  const mapelMap = peta(wajib(await supabase.from("mapel").select("*")), "mapel_id", "nama_mapel");
  const sesiPerTes = {};
  wajib(await supabase.from("sesi_tes").select("*").eq("siswa_id", user.users_id)).forEach((s) => {
    const prev = sesiPerTes[String(s.tes_id)];
    if (!prev || Number(s.sesites_id) > Number(prev.sesites_id)) sesiPerTes[String(s.tes_id)] = s;
  });

  return json(200, tersedia.map((t) => {
    const sesi = sesiPerTes[String(t.tes_id)];
    return {
      tes_id: t.tes_id, judul: t.judul, jumlah_soal: t.jumlah_soal, durasi_menit: t.durasi_menit,
      tanggal: t.tanggal, nama_mapel: mapelMap[String(t.mapel_id)] || null, dibuka: sudahDibuka(t.tanggal),
      status_saya: sesi ? sesi.status : null, sesi_saya: sesi ? sesi.sesites_id : null,
      nilai_saya: sesi && peng.tampilkan_nilai ? sesi.nilai : null,
    };
  }));
});
