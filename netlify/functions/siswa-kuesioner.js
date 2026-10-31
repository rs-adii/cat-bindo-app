const { getClient } = require("../../lib/supabaseClient");
const { json, getParam, aman } = require("../../lib/httpHelpers");
const { sudahIsiKuesioner } = require("../../lib/sesiSupabase");
const { cekAkses, ambilPengaturan, wajib } = require("../../lib/netlifyBersama");

exports.handler = aman(async (event) => {
  const { user, errorResponse } = await cekAkses(event, "siswa");
  if (errorResponse) return errorResponse;
  const tesId = getParam(event, "tesId", /\/api\/siswa\/kuesioner\/([^/?]+)/);
  if (!tesId) return json(400, { error: "tesId wajib disertakan." });
  const supabase = getClient();

  const kuesioner = wajib(await supabase.from("kuesioner").select("*").eq("tes_id", tesId).maybeSingle());
  if (!kuesioner) return json(200, null);
  const pertanyaan = [...wajib(await supabase.from("pertanyaan_kuesioner").select("*").eq("kuesioner_id", kuesioner.kuesioner_id))]
    .sort((a, b) => Number(a.pertanyaan_kuesioner_id) - Number(b.pertanyaan_kuesioner_id));
  return json(200, {
    kuesioner_id: kuesioner.kuesioner_id, tes_id: kuesioner.tes_id, judul: kuesioner.judul, pertanyaan,
    sudahDiisi: await sudahIsiKuesioner(supabase, kuesioner.kuesioner_id, user.users_id),
    anonim: (await ambilPengaturan(supabase)).kuesioner_anonim,
  });
});
