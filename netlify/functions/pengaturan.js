const { getClient } = require("../../lib/supabaseClient");
const { json, parseBody, aman } = require("../../lib/httpHelpers");
const { cekAkses, ambilPengaturan } = require("../../lib/netlifyBersama");
const pengaturanLib = require("../../lib/pengaturan");

// GET: semua peran (guru butuh bawaan jumlah soal/durasi). PUT: admin saja.
exports.handler = aman(async (event) => {
  const supabase = getClient();
  if (event.httpMethod === "GET") {
    const { errorResponse } = await cekAkses(event);
    if (errorResponse) return errorResponse;
    return json(200, await ambilPengaturan(supabase));
  }
  if (event.httpMethod === "PUT") {
    const { errorResponse } = await cekAkses(event, "admin");
    if (errorResponse) return errorResponse;
    const { data, error } = pengaturanLib.validasi(parseBody(event));
    if (error) return json(400, { error });
    const rows = pengaturanLib.serialisasi(data);
    if (rows.length) {
      const { error: errUp } = await supabase.from("pengaturan").upsert(rows, { onConflict: "kunci" });
      if (errUp) {
        return json(500, { error: /pengaturan/.test(errUp.message) && /exist|schema cache/i.test(errUp.message)
          ? "Tabel pengaturan belum ada. Jalankan data/migrasi-tampilan-baru.postgres.sql di Supabase."
          : errUp.message });
      }
    }
    return json(200, await ambilPengaturan(supabase));
  }
  return json(405, { error: "Method tidak diizinkan." });
});
