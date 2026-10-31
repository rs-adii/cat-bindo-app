const { getClient } = require("../../lib/supabaseClient");
const { verifyPassword, issueToken } = require("../../lib/auth");
const { json, parseBody, aman } = require("../../lib/httpHelpers");

const NAMA_PERAN = { admin: "Admin", guru: "Guru", siswa: "Siswa" };

exports.handler = aman(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { username, password, role } = parseBody(event);
  if (!username || !password) return json(400, { error: "Username dan password wajib diisi." });

  const supabase = getClient();
  const { data: user, error } = await supabase.from("users").select("*").eq("username", String(username).trim()).maybeSingle();
  if (error) return json(500, { error: error.message });
  if (!user || !verifyPassword(password, user.password_hash)) {
    return json(401, { error: "Username atau password salah." });
  }
  if (user.aktif === 0 || user.aktif === false) return json(403, { error: "Akun ini dinonaktifkan. Hubungi admin sekolah." });
  // role (opsional) = tab peran yang dipilih di halaman login
  if (role && role !== user.role) {
    return json(403, { error: `Akun ini terdaftar sebagai ${NAMA_PERAN[user.role]}. Pilih tab ${NAMA_PERAN[user.role]} lalu masuk lagi.` });
  }
  const token = issueToken(user);
  return json(200, {
    token,
    user: { users_id: user.users_id, nama: user.nama, role: user.role, kelas_id: user.kelas_id },
  });
});
