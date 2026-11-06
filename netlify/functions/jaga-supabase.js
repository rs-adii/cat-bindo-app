// netlify/functions/jaga-supabase.js — Netlify Scheduled Function.
// Supabase paket gratis mem-pause project yang tidak aktif selama 7 hari.
// Fungsi ini berjalan otomatis setiap 3 hari (jadwal di netlify.toml) dan
// mengirim satu kueri kecil ke database, sehingga project tetap dianggap aktif.
// Fungsi terjadwal tidak bisa dipanggil lewat URL publik di Netlify.
const { getClient } = require("../../lib/supabaseClient");

exports.handler = async () => {
  const mulai = Date.now();
  try {
    const { count, error } = await getClient()
      .from("mapel")
      .select("mapel_id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    console.log(`[jaga-supabase] OK: ${count ?? 0} mapel, ${Date.now() - mulai} ms`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, mapel: count ?? 0 }) };
  } catch (e) {
    console.error("[jaga-supabase] GAGAL:", e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
