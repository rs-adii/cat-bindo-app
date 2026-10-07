const { getClient } = require("../../lib/supabaseClient");
const { verifyPassword, issueToken } = require("../../lib/auth");
const { json, parseBody } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { username, password } = parseBody(event);
  if (!username || !password) return json(400, { error: "Username dan password wajib diisi." });

  const supabase = getClient();
  const { data: user, error } = await supabase.from("users").select("*").eq("username", username).maybeSingle();
  if (error) return json(500, { error: error.message });
  if (!user || !verifyPassword(password, user.password_hash)) {
    return json(401, { error: "Username atau password salah." });
  }
  const token = issueToken(user);
  return json(200, {
    token,
    user: { users_id: user.users_id, nama: user.nama, role: user.role, kelas_id: user.kelas_id },
  });
};
