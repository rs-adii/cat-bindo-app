const { getClient } = require("../../lib/supabaseClient");
const { cekAkses } = require("../../lib/netlifyBersama");
const { json, parseBody, getParam, aman } = require("../../lib/httpHelpers");

const cat = require("../../lib/catEngineLevel");

const PESAN_LEVEL = "Tingkat kesulitan harus 1-3 (1 mudah, 2 sedang, 3 sulit).";
function rapikanMateri(m) {
  const t = String(m === null || m === undefined ? "" : m).trim();
  return t ? t.slice(0, 100) : null;
}

const PESAN_BUKAN_PEMILIK = "Soal ini dibuat guru lain. Kamu hanya bisa mengubah atau menghapus soal milikmu sendiri.";

exports.handler = aman(async (event) => {
  const supabase = getClient();
  const id = getParam(event, "id", /\/api\/guru\/soal\/([^/?]+)/);

  if (event.httpMethod === "GET") {
    const { errorResponse } = await cekAkses(event, "guru", "admin");
    if (errorResponse) return errorResponse;
    const { data: soal, error } = await supabase.from("soal").select("*").order("mapel_id").order("tingkat_kesulitan");
    if (error) return json(500, { error: error.message });
    const [{ data: mapelList }, { data: users }] = await Promise.all([
      supabase.from("mapel").select("*"),
      supabase.from("users").select("*"),
    ]);
    const mapelMap = Object.fromEntries((mapelList || []).map((m) => [m.mapel_id, m.nama_mapel]));
    const userMap = Object.fromEntries((users || []).map((u) => [u.users_id, u.nama]));
    return json(200, soal.map((s) => ({ ...s, nama_mapel: mapelMap[s.mapel_id] || null, nama_guru: userMap[s.guru_id] || null })));
  }

  const { user, errorResponse } = await cekAkses(event, "guru");
  if (errorResponse) return errorResponse;

  if (event.httpMethod === "POST") {
    const b = parseBody(event);
    if (!b.mapel_id || !b.pertanyaan || !b.opsi_a || !b.opsi_b || !b.opsi_c || !b.opsi_d || !b.kunci || !b.tingkat_kesulitan) {
      return json(400, { error: "Semua field soal wajib diisi." });
    }
    if (!["A", "B", "C", "D"].includes(b.kunci)) return json(400, { error: "Kunci jawaban harus A, B, C, atau D." });
    const level = cat.parseLevel(b.tingkat_kesulitan);
    if (level === null) return json(400, { error: PESAN_LEVEL });
    const { data, error } = await supabase.from("soal").insert({
      mapel_id: b.mapel_id, guru_id: user.users_id, pertanyaan: b.pertanyaan,
      opsi_a: b.opsi_a, opsi_b: b.opsi_b, opsi_c: b.opsi_c, opsi_d: b.opsi_d,
      kunci: b.kunci, tingkat_kesulitan: level, materi: rapikanMateri(b.materi),
    }).select().single();
    if (error) return json(500, { error: error.message });
    return json(200, { soal_id: data.soal_id });
  }

  if (event.httpMethod === "PUT" || event.httpMethod === "DELETE") {
    if (!id) return json(400, { error: "ID soal wajib disertakan." });
    const { data: existing } = await supabase.from("soal").select("*").eq("soal_id", id).maybeSingle();
    if (!existing) return json(404, { error: "Soal tidak ditemukan." });
    if (Number(existing.guru_id) !== Number(user.users_id)) return json(403, { error: PESAN_BUKAN_PEMILIK });

    if (event.httpMethod === "PUT") {
      const b = parseBody(event);
      if (b.kunci !== undefined && !["A", "B", "C", "D"].includes(b.kunci)) return json(400, { error: "Kunci jawaban harus A, B, C, atau D." });
      const patch = {};
      ["pertanyaan", "opsi_a", "opsi_b", "opsi_c", "opsi_d", "kunci"].forEach((k) => {
        if (b[k] !== undefined && b[k] !== "") patch[k] = b[k];
      });
      if (b.tingkat_kesulitan !== undefined) {
        const level = cat.parseLevel(b.tingkat_kesulitan);
        if (level === null) return json(400, { error: PESAN_LEVEL });
        patch.tingkat_kesulitan = level;
      }
      if (b.materi !== undefined) patch.materi = rapikanMateri(b.materi);
      const { error } = await supabase.from("soal").update(patch).eq("soal_id", id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    const { error } = await supabase.from("soal").delete().eq("soal_id", id);
    if (error) {
      if (error.code === "23503" || /foreign key/i.test(error.message)) {
        return json(409, { error: "Soal ini sudah pernah dipakai dalam tes siswa, jadi tidak bisa dihapus." });
      }
      return json(500, { error: error.message });
    }
    return json(200, { ok: true });
  }

  return json(405, { error: "Method tidak diizinkan." });
});
