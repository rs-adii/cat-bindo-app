// lib/tanggal.js — tanggal "hari ini" menurut zona sekolah (WIB), dipakai untuk
// mengunci tes sebelum tanggalnya. Server Netlify berjalan di UTC, jadi tanpa ini
// tes hari-H baru terbuka pukul 07.00 WIB.
const ZONA = process.env.ZONA_WAKTU || "Asia/Jakarta";

function hariIni(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
// tes.tanggal bisa "2026-10-31" (teks) atau Date/ISO dari Postgres
function tanggalTes(t) {
  if (t instanceof Date) return hariIni(t);
  return String(t || "").slice(0, 10);
}
function sudahDibuka(tanggal, now = new Date()) {
  return tanggalTes(tanggal) <= hariIni(now);
}

module.exports = { ZONA, hariIni, tanggalTes, sudahDibuka };
