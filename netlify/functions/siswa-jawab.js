const { getClient } = require("../../lib/supabaseClient");
const { json, parseBody, getParam, aman } = require("../../lib/httpHelpers");
const cat = require("../../lib/catEngineLevel");
const timer = require("../../lib/timer");
const acakOpsi = require("../../lib/acakOpsi");
const ringkasan = require("../../lib/ringkasan");
const { levelDariJawaban, ambilJawaban, finalisasiSesi, soalBerikutnya } = require("../../lib/sesiSupabase");
const { cekAkses, ambilPengaturan, sama, wajib } = require("../../lib/netlifyBersama");

exports.handler = aman(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { user, errorResponse } = await cekAkses(event, "siswa");
  if (errorResponse) return errorResponse;
  const sesiId = getParam(event, "sesiId", /\/api\/siswa\/sesi\/([^/?]+)\/jawab/);
  if (!sesiId) return json(400, { error: "sesiId wajib disertakan." });
  const supabase = getClient();
  const peng = await ambilPengaturan(supabase);
  const saring = (h) => ringkasan.saringHasilSiswa(h, peng);
  const urutanUntuk = (soalId, aktif) => (aktif ? acakOpsi.urutanOpsi(sesiId, soalId) : acakOpsi.IDENTITAS);

  const sesi = wajib(await supabase.from("sesi_tes").select("*").eq("sesites_id", sesiId).maybeSingle());
  if (!sesi || !sama(sesi.siswa_id, user.users_id)) return json(404, { error: "Sesi tidak ditemukan." });
  if (sesi.status !== "ongoing") return json(400, { error: "Sesi ini sudah selesai." });

  const tes = wajib(await supabase.from("tes").select("*").eq("tes_id", sesi.tes_id).single());

  // Waktu habis: jawaban ini tidak dihitung; sesi ditutup dan hasilnya dikembalikan.
  if (timer.sisaDetik(sesi.mulai, tes.durasi_menit) < -timer.GRACE_DETIK) {
    return json(200, { selesai: true, hasil: saring(await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: true })) });
  }

  const { soalId, jawabanHuruf, acak } = parseBody(event);
  const soal = wajib(await supabase.from("soal").select("*").eq("soal_id", soalId).maybeSingle());
  if (!soal) return json(400, { error: "Soal tidak ditemukan." });

  const jsSebelum = await ambilJawaban(supabase, sesi.sesites_id);
  if (jsSebelum.some((j) => sama(j.soal_id, soal.soal_id))) {
    return json(400, { error: "Soal ini sudah dijawab pada sesi ini." });
  }
  // Huruf pilihan siswa = huruf TAMPILAN; terjemahkan ke huruf asli bank soal.
  const pakaiAcak = typeof acak === "boolean" ? acak : peng.acak_opsi;
  const huruf = acakOpsi.hurufAsli(jawabanHuruf, urutanUntuk(soal.soal_id, pakaiAcak));
  if (!huruf) return json(400, { error: "Pilih salah satu jawaban A, B, C, atau D." });

  const urutan = jsSebelum.length + 1;
  const levelSaatIni = levelDariJawaban(jsSebelum);
  const benar = huruf === soal.kunci;
  // Umpan balik jawaban barusan untuk panel "Riwayat jawaban" di layar tes
  const jawabanTadi = peng.tampilkan_nilai ? { benar, level: soal.tingkat_kesulitan } : { level: soal.tingkat_kesulitan };
  wajib(await supabase.from("jawaban").insert({
    sesi_id: sesi.sesites_id, soal_id: soal.soal_id, jawaban: huruf,
    benar: benar ? 1 : 0, level_saat_itu: levelSaatIni, urutan,
  }));

  if (urutan >= tes.jumlah_soal) {
    return json(200, { selesai: true, jawabanTadi, hasil: saring(await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: false })) });
  }

  const usedIds = new Set([...jsSebelum.map((j) => j.soal_id), soal.soal_id]);
  const soalBerikut = await soalBerikutnya(supabase, sesi, tes, usedIds, cat.nextLevel(levelSaatIni, benar), peng);
  if (!soalBerikut) {
    return json(200, {
      selesai: true, jawabanTadi, hasil: saring(await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: false })),
      catatan: "Bank soal habis sebelum jumlah target tercapai.",
    });
  }

  return json(200, {
    selesai: false,
    jawabanTadi,
    soal: cat.publicSoal(soalBerikut, urutanUntuk(soalBerikut.soal_id, peng.acak_opsi)),
    progress: { jumlah: urutan, total: tes.jumlah_soal },
    sisaDetik: timer.sisaDetik(sesi.mulai, tes.durasi_menit),
  });
});
