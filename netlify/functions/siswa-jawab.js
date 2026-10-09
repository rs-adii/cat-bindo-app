const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json, parseBody, getParam } = require("../../lib/httpHelpers");
const cat = require("../../lib/catEngineLevel");

function levelSaatIni(jawabanSesi) {
  if (jawabanSesi.length === 0) return cat.START_LEVEL;
  const last = jawabanSesi.reduce((a, b) => (a.urutan > b.urutan ? a : b));
  return cat.nextLevel(last.level_saat_itu, !!last.benar);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { user, errorResponse } = checkAuth(event, "siswa");
  if (errorResponse) return errorResponse;
  const sesiId = getParam(event, "sesiId", /\/api\/siswa\/sesi\/([^/?]+)\/jawab/);
  if (!sesiId) return json(400, { error: "sesiId wajib disertakan." });
  const supabase = getClient();

  const { data: sesi } = await supabase.from("sesi_tes").select("*").eq("sesites_id", sesiId).maybeSingle();
  if (!sesi || sesi.siswa_id !== user.users_id) return json(404, { error: "Sesi tidak ditemukan." });
  if (sesi.status !== "ongoing") return json(400, { error: "Sesi ini sudah selesai." });

  const { data: tes } = await supabase.from("tes").select("*").eq("tes_id", sesi.tes_id).single();
  const { soalId, jawabanHuruf } = parseBody(event);
  const { data: soal } = await supabase.from("soal").select("*").eq("soal_id", soalId).maybeSingle();
  if (!soal) return json(400, { error: "Soal tidak ditemukan." });

  const { data: jawabanSesi } = await supabase.from("jawaban").select("*").eq("sesi_id", sesiId);
  if ((jawabanSesi || []).some((j) => j.soal_id === Number(soalId) || j.soal_id === soalId)) {
    return json(400, { error: "Soal ini sudah dijawab pada sesi ini." });
  }

  const urutan = (jawabanSesi || []).length + 1;
  const levelSekarang = levelSaatIni(jawabanSesi || []);
  const benar = jawabanHuruf === soal.kunci;

  const { error: errIns } = await supabase.from("jawaban").insert({
    sesi_id: sesiId, soal_id: soalId, jawaban: jawabanHuruf, benar: benar ? 1 : 0,
    level_saat_itu: levelSekarang, urutan,
  });
  if (errIns) return json(500, { error: errIns.message });

  const levelBerikut = cat.nextLevel(levelSekarang, benar);
  const semuaJawabanTerbaru = [...(jawabanSesi || []), { benar: benar ? 1 : 0 }];

  async function selesaikanSesi() {
    const nilai = cat.hitungNilai(semuaJawabanTerbaru.map((r) => ({ benar: r.benar })));
    await supabase.from("sesi_tes").update({
      status: "selesai", nilai, level_akhir: levelBerikut, selesai: new Date().toISOString(),
    }).eq("sesites_id", sesiId);
    return { sesiId: Number(sesiId), nilai, kategori: cat.kategoriNilai(nilai), levelAkhir: levelBerikut, jumlahSoal: urutan };
  }

  if (urutan >= tes.jumlah_soal) {
    return json(200, { selesai: true, hasil: await selesaikanSesi() });
  }

  const { data: pool } = await supabase.from("soal").select("*").eq("mapel_id", tes.mapel_id);
  const usedIds = new Set([...(jawabanSesi || []).map((j) => j.soal_id), Number(soalId)]);
  const soalBerikut = cat.pickByLevel(pool || [], usedIds, levelBerikut);
  if (!soalBerikut) {
    return json(200, { selesai: true, hasil: await selesaikanSesi(), catatan: "Bank soal habis sebelum jumlah target tercapai." });
  }

  return json(200, {
    selesai: false,
    soal: cat.publicSoal(soalBerikut),
    progress: { jumlah: urutan, total: tes.jumlah_soal },
  });
};
