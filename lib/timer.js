// lib/timer.js — hitung sisa waktu tes DI SERVER (bukan di peramban), supaya
// siswa tidak bisa memperpanjang waktu dengan mengubah jam perangkat atau
// menutup-buka halaman. Tenggat = waktu mulai sesi + durasi tes.
//
// Dipakai bersama oleh mode lokal (server.js) dan Netlify Functions.

// Toleransi untuk jawaban yang sudah dikirim tepat di batas waktu tetapi
// tertunda di jaringan.
const GRACE_DETIK = 5;

// SQLite menyimpan waktu tanpa zona ("2026-10-08 23:42:13", UTC);
// Postgres/Supabase mengembalikan ISO dengan zona. Keduanya dinormalkan ke UTC.
function parseWaktu(s) {
  if (!s) return NaN;
  let str = String(s);
  if (!/[zZ]$|[+-]\d\d:?\d\d$/.test(str)) str = str.replace(" ", "T") + "Z";
  return new Date(str).getTime();
}

function tenggatMs(mulai, durasiMenit) {
  return parseWaktu(mulai) + durasiMenit * 60 * 1000;
}

// Sisa detik (bisa negatif kalau sudah lewat).
function sisaDetik(mulai, durasiMenit, nowMs = Date.now()) {
  return Math.floor((tenggatMs(mulai, durasiMenit) - nowMs) / 1000);
}

module.exports = { GRACE_DETIK, parseWaktu, tenggatMs, sisaDetik };
