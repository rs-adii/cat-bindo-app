const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json, getParam, aman } = require("../../lib/httpHelpers");
const cat = require("../../lib/catEngineLevel");
const timer = require("../../lib/timer");
const { levelDariJawaban, ambilJawaban, finalisasiSesi } = require("../../lib/sesiSupabase");

exports.handler = aman(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { user, errorResponse } = checkAuth(event, "siswa");
  if (errorResponse) return errorResponse;
  const tesId = getParam(event, "tesId", /\/api\/siswa\/tes\/([^/?]+)\/mulai/);
  if (!tesId) return json(400, { error: "tesId wajib disertakan." });
  const supabase = getClient();

  const { data: tes } = await supabase.from("tes").select("*").eq("tes_id", tesId).maybeSingle();
  if (!tes) return json(404, { error: "Tes tidak ditemukan." });

  let { data: sesi } = await supabase
    .from("sesi_tes").select("*").eq("tes_id", tesId).eq("siswa_id", user.users_id).eq("status", "ongoing").maybeSingle();

  if (sesi) {
    // Melanjutkan sesi lama: kalau waktunya sudah habis, tutup dan tampilkan hasil.
    if (timer.sisaDetik(sesi.mulai, tes.durasi_menit) <= 0) {
      return json(200, { selesai: true, hasil: await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: true }) });
    }
  } else {
    const { data: selesai } = await supabase
      .from("sesi_tes").select("*").eq("tes_id", tesId).eq("siswa_id", user.users_id).eq("status", "selesai").maybeSingle();
    if (selesai) return json(400, { error: "Tes ini sudah pernah kamu selesaikan." });

    const { data: baru, error: errBaru } = await supabase
      .from("sesi_tes").insert({ tes_id: tes.tes_id, siswa_id: user.users_id, status: "ongoing" }).select().single();
    if (errBaru) return json(500, { error: errBaru.message });
    sesi = baru;
  }

  const { data: pool } = await supabase.from("soal").select("*").eq("mapel_id", tes.mapel_id);
  const js = await ambilJawaban(supabase, sesi.sesites_id);
  if (js.length >= tes.jumlah_soal) {
    return json(200, { selesai: true, hasil: await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: false }) });
  }

  const soalBerikut = cat.pickByLevel(pool || [], new Set(js.map((j) => j.soal_id)), levelDariJawaban(js));
  if (!soalBerikut) return json(400, { error: "Bank soal untuk mapel ini belum cukup." });

  return json(200, {
    sesiId: sesi.sesites_id,
    soal: cat.publicSoal(soalBerikut),
    progress: { jumlah: js.length, total: tes.jumlah_soal },
    sisaDetik: timer.sisaDetik(sesi.mulai, tes.durasi_menit),
    durasiMenit: tes.durasi_menit,
  });
});
