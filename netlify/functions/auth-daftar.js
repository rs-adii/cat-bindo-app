const { getClient } = require("../../lib/supabaseClient");
const { hashPassword, issueToken } = require("../../lib/auth");
const { json, parseBody, aman } = require("../../lib/httpHelpers");
const { ambilPengaturan, galatUnik, wajib } = require("../../lib/netlifyBersama");
const { infoDaftar, periksaDaftar } = require("../../lib/daftar");

// GET  /api/auth/daftar -> { buka, guruBisa, kelas[] } (tanpa login, kode guru tidak dikirim)
// POST /api/auth/daftar -> buat akun guru/siswa lalu langsung login
exports.handler = aman(async (event) => {
  const supabase = getClient();
  const pengaturan = await ambilPengaturan(supabase);

  if (event.httpMethod === "GET") {
    const kelas = wajib(await supabase.from("kelas").select("kelas_id, nama_kelas").order("nama_kelas"));
    return json(200, infoDaftar(pengaturan, kelas));
  }

  if (event.httpMethod === "POST") {
    const cek = await periksaDaftar(parseBody(event), pengaturan, async (id) => {
      const { data } = await supabase.from("kelas").select("kelas_id").eq("kelas_id", id).maybeSingle();
      return !!data;
    });
    if (cek.error) return json(cek.status, { error: cek.error });
    const d = cek.data;
    const { data: user, error } = await supabase.from("users").insert({
      nama: d.nama, username: d.username, password_hash: hashPassword(d.password), role: d.role, kelas_id: d.kelas_id,
    }).select().single();
    if (galatUnik(error)) return json(409, { error: "Username sudah dipakai. Coba username lain." });
    if (error) return json(500, { error: error.message });
    return json(200, {
      token: issueToken(user),
      user: { users_id: user.users_id, nama: user.nama, role: user.role, kelas_id: user.kelas_id },
    });
  }

  return json(405, { error: "Method tidak diizinkan." });
});
