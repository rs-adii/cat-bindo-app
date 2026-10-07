const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json } = require("../../lib/httpHelpers");
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
  const tesId = event.queryStringParameters && event.queryStringParameters.tesId;
  if (!tesId) return json(400, { error: "tesId wajib disertakan." });
  const supabase = getClient();

  const { data: tes } = await supabase.from("tes").select("*").eq("tes_id", tesId).maybeSingle();
  if (!tes) return json(404, { error: "Tes tidak ditemukan." });

  let { data: sesi } = await supabase
    .from("sesi_tes").select("*").eq("tes_id", tesId).eq("siswa_id", user.users_id).eq("status", "ongoing").maybeSingle();

  if (!sesi) {
    const { data: selesai } = await supabase
      .from("sesi_tes").select("*").eq("tes_id", tesId).eq("siswa_id", user.users_id).eq("status", "selesai").maybeSingle();
    if (selesai) return json(400, { error: "Tes ini sudah pernah kamu selesaikan." });

    const { data: baru, error: errBaru } = await supabase
      .from("sesi_tes").insert({ tes_id: tesId, siswa_id: user.users_id, status: "ongoing" }).select().single();
    if (errBaru) return json(500, { error: errBaru.message });
    sesi = baru;
  }

  const { data: pool } = await supabase.from("soal").select("*").eq("mapel_id", tes.mapel_id);
  const { data: jawabanSesi } = await supabase.from("jawaban").select("*").eq("sesi_id", sesi.sesites_id);
  const usedIds = new Set((jawabanSesi || []).map((j) => j.soal_id));
  const jumlahTerjawab = (jawabanSesi || []).length;

  if (jumlahTerjawab >= tes.jumlah_soal) {
    return json(400, { error: "Sesi ini seharusnya sudah selesai, silakan muat ulang." });
  }

  const level = levelSaatIni(jawabanSesi || []);
  const soalBerikut = cat.pickByLevel(pool || [], usedIds, level);
  if (!soalBerikut) return json(400, { error: "Bank soal untuk mapel ini belum cukup." });

  return json(200, {
    sesiId: sesi.sesites_id,
    soal: cat.publicSoal(soalBerikut),
    progress: { jumlah: jumlahTerjawab, total: tes.jumlah_soal },
  });
};
