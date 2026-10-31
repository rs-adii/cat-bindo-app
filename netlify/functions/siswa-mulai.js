const { getClient } = require("../../lib/supabaseClient");
const { json, getParam, aman } = require("../../lib/httpHelpers");
const cat = require("../../lib/catEngineLevel");
const timer = require("../../lib/timer");
const acakOpsi = require("../../lib/acakOpsi");
const ringkasan = require("../../lib/ringkasan");
const { sudahDibuka, tanggalTes } = require("../../lib/tanggal");
const { levelDariJawaban, ambilJawaban, finalisasiSesi, soalBerikutnya } = require("../../lib/sesiSupabase");
const { cekAkses, ambilPengaturan, sama, wajib } = require("../../lib/netlifyBersama");

exports.handler = aman(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { user, errorResponse } = await cekAkses(event, "siswa");
  if (errorResponse) return errorResponse;
  const tesId = getParam(event, "tesId", /\/api\/siswa\/tes\/([^/?]+)\/mulai/);
  if (!tesId) return json(400, { error: "tesId wajib disertakan." });
  const supabase = getClient();
  const peng = await ambilPengaturan(supabase);
  const saring = (h) => ringkasan.saringHasilSiswa(h, peng);

  const tes = wajib(await supabase.from("tes").select("*").eq("tes_id", tesId).maybeSingle());
  if (!tes) return json(404, { error: "Tes tidak ditemukan." });
  if (tes.kelas_id && !sama(tes.kelas_id, user.kelas_id)) return json(403, { error: "Tes ini bukan untuk kelasmu." });

  const sesiSaya = wajib(await supabase.from("sesi_tes").select("*").eq("tes_id", tesId).eq("siswa_id", user.users_id));
  let sesi = sesiSaya.find((s) => s.status === "ongoing");

  if (sesi) {
    // Melanjutkan sesi lama: kalau waktunya sudah habis, tutup dan tampilkan hasil.
    if (timer.sisaDetik(sesi.mulai, tes.durasi_menit) <= 0) {
      return json(200, { selesai: true, hasil: saring(await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: true })) });
    }
  } else {
    if (!sudahDibuka(tes.tanggal)) return json(403, { error: `Tes ini baru dibuka pada ${tanggalTes(tes.tanggal)}.` });
    if (sesiSaya.some((s) => s.status === "selesai")) return json(400, { error: "Tes ini sudah pernah kamu selesaikan." });
    sesi = wajib(await supabase.from("sesi_tes").insert({ tes_id: tes.tes_id, siswa_id: user.users_id, status: "ongoing" }).select().single());
  }

  const js = await ambilJawaban(supabase, sesi.sesites_id);
  if (js.length >= tes.jumlah_soal) {
    return json(200, { selesai: true, hasil: saring(await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: false })) });
  }

  const soal = await soalBerikutnya(supabase, sesi, tes, new Set(js.map((j) => j.soal_id)), levelDariJawaban(js), peng);
  if (!soal) return json(400, { error: "Bank soal untuk mapel ini belum cukup." });
  const urutan = peng.acak_opsi ? acakOpsi.urutanOpsi(sesi.sesites_id, soal.soal_id) : acakOpsi.IDENTITAS;

  return json(200, {
    sesiId: sesi.sesites_id,
    soal: cat.publicSoal(soal, urutan),
    progress: { jumlah: js.length, total: tes.jumlah_soal },
    sisaDetik: timer.sisaDetik(sesi.mulai, tes.durasi_menit),
    durasiMenit: tes.durasi_menit,
    // riwayat untuk panel "Riwayat jawaban" saat tes dilanjutkan dari perangkat lain/setelah muat ulang
    riwayat: ringkasan.rincianJawaban(js).alur.map((a) => (peng.tampilkan_nilai ? a : { level: a.level })),
  });
});
