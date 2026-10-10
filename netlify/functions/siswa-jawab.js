const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json, parseBody, getParam, aman } = require("../../lib/httpHelpers");
const cat = require("../../lib/catEngineLevel");
const timer = require("../../lib/timer");
const { levelDariJawaban, ambilJawaban, finalisasiSesi } = require("../../lib/sesiSupabase");

exports.handler = aman(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { user, errorResponse } = checkAuth(event, "siswa");
  if (errorResponse) return errorResponse;
  const sesiId = getParam(event, "sesiId", /\/api\/siswa\/sesi\/([^/?]+)\/jawab/);
  if (!sesiId) return json(400, { error: "sesiId wajib disertakan." });
  const supabase = getClient();

  const { data: sesi } = await supabase.from("sesi_tes").select("*").eq("sesites_id", sesiId).maybeSingle();
  if (!sesi || Number(sesi.siswa_id) !== Number(user.users_id)) return json(404, { error: "Sesi tidak ditemukan." });
  if (sesi.status !== "ongoing") return json(400, { error: "Sesi ini sudah selesai." });

  const { data: tes } = await supabase.from("tes").select("*").eq("tes_id", sesi.tes_id).single();

  // Waktu habis: jawaban ini tidak dihitung; sesi ditutup dan hasilnya dikembalikan.
  if (timer.sisaDetik(sesi.mulai, tes.durasi_menit) < -timer.GRACE_DETIK) {
    return json(200, { selesai: true, hasil: await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: true }) });
  }

  const { soalId, jawabanHuruf } = parseBody(event);
  const { data: soal } = await supabase.from("soal").select("*").eq("soal_id", soalId).maybeSingle();
  if (!soal) return json(400, { error: "Soal tidak ditemukan." });

  const jsSebelum = await ambilJawaban(supabase, sesi.sesites_id);
  if (jsSebelum.some((j) => Number(j.soal_id) === Number(soal.soal_id))) {
    return json(400, { error: "Soal ini sudah dijawab pada sesi ini." });
  }

  const urutan = jsSebelum.length + 1;
  const levelSaatIni = levelDariJawaban(jsSebelum);
  const benar = jawabanHuruf === soal.kunci;
  const { error: errIns } = await supabase.from("jawaban").insert({
    sesi_id: sesi.sesites_id, soal_id: soal.soal_id, jawaban: jawabanHuruf,
    benar: benar ? 1 : 0, level_saat_itu: levelSaatIni, urutan,
  });
  if (errIns) return json(500, { error: errIns.message });

  if (urutan >= tes.jumlah_soal) {
    return json(200, { selesai: true, hasil: await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: false }) });
  }

  const { data: pool } = await supabase.from("soal").select("*").eq("mapel_id", tes.mapel_id);
  const usedIds = new Set([...jsSebelum.map((j) => j.soal_id), soal.soal_id]);
  const soalBerikut = cat.pickByLevel(pool || [], usedIds, cat.nextLevel(levelSaatIni, benar));
  if (!soalBerikut) {
    return json(200, {
      selesai: true, hasil: await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: false }),
      catatan: "Bank soal habis sebelum jumlah target tercapai.",
    });
  }

  return json(200, {
    selesai: false,
    soal: cat.publicSoal(soalBerikut),
    progress: { jumlah: urutan, total: tes.jumlah_soal },
    sisaDetik: timer.sisaDetik(sesi.mulai, tes.durasi_menit),
  });
});
