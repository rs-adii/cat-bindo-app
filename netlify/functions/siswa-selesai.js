const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json, getParam, aman } = require("../../lib/httpHelpers");
const timer = require("../../lib/timer");
const { finalisasiSesi, hasilDariSesiSelesai } = require("../../lib/sesiSupabase");

// Dipanggil peramban saat hitung mundur mencapai nol. Server yang memutuskan:
// kalau waktu memang sudah habis, sesi ditutup; kalau belum (jam perangkat
// tidak sinkron), kembalikan sisa waktu yang benar.
exports.handler = aman(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { user, errorResponse } = checkAuth(event, "siswa");
  if (errorResponse) return errorResponse;
  const sesiId = getParam(event, "sesiId", /\/api\/siswa\/sesi\/([^/?]+)\/selesai/);
  if (!sesiId) return json(400, { error: "sesiId wajib disertakan." });
  const supabase = getClient();

  const { data: sesi } = await supabase.from("sesi_tes").select("*").eq("sesites_id", sesiId).maybeSingle();
  if (!sesi || Number(sesi.siswa_id) !== Number(user.users_id)) return json(404, { error: "Sesi tidak ditemukan." });
  const { data: tes } = await supabase.from("tes").select("*").eq("tes_id", sesi.tes_id).single();

  if (sesi.status === "selesai") return json(200, { selesai: true, hasil: await hasilDariSesiSelesai(supabase, sesi, tes) });

  const sisa = timer.sisaDetik(sesi.mulai, tes.durasi_menit);
  if (sisa > 0) return json(200, { selesai: false, sisaDetik: sisa });
  return json(200, { selesai: true, hasil: await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: true }) });
});
