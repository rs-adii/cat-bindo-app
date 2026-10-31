// lib/netlifyBersama.js — alat bersama untuk netlify/functions/*.js
const { getClient } = require("./supabaseClient");
const { checkAuth } = require("./auth");
const { json } = require("./httpHelpers");
const pengaturanLib = require("./pengaturan");

// Seperti checkAuth, ditambah cek status akun di database: token JWT tetap
// sah sampai kedaluwarsa, jadi akun yang dinonaktifkan/dihapus admin harus
// ditolak di sini. Kolom `aktif` yang belum ada (migrasi belum dijalankan)
// dianggap aktif, supaya sistem lama tidak terkunci.
async function cekAkses(event, ...roles) {
  const { user, errorResponse } = checkAuth(event, ...roles);
  if (errorResponse) return { user: null, errorResponse };
  const { data: u, error } = await getClient().from("users").select("*").eq("users_id", user.users_id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!u || u.aktif === 0 || u.aktif === false) {
    return { user: null, errorResponse: json(401, { error: "Akun ini dinonaktifkan atau sudah dihapus. Hubungi admin sekolah." }) };
  }
  if (u.role !== user.role) return { user: null, errorResponse: json(401, { error: "Peran akun berubah. Silakan masuk lagi." }) };
  return { user, errorResponse: null };
}

// Tabel pengaturan belum ada (migrasi belum dijalankan) -> pakai nilai bawaan
async function ambilPengaturan(supabase) {
  const { data, error } = await supabase.from("pengaturan").select("*");
  if (error) return pengaturanLib.bawaan();
  return pengaturanLib.gabung(data || []);
}

const galatFK = (e) => !!e && (e.code === "23503" || /foreign key/i.test(e.message || ""));
const galatUnik = (e) => !!e && (e.code === "23505" || /duplicate|unique/i.test(e.message || ""));
const peta = (arr, kunci, nilai) => Object.fromEntries((arr || []).map((r) => [String(r[kunci]), nilai ? r[nilai] : r]));
const sama = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && Number(a) === Number(b);

// Memastikan sebuah kueri tidak gagal diam-diam
function wajib({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

module.exports = { cekAkses, ambilPengaturan, galatFK, galatUnik, peta, sama, wajib };
