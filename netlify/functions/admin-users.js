const { getClient } = require("../../lib/supabaseClient");
const { hashPassword, checkAuth } = require("../../lib/auth");
const { json, parseBody, getParam } = require("../../lib/httpHelpers");

exports.handler = async (event) => {
  const { user, errorResponse } = checkAuth(event, "admin");
  if (errorResponse) return errorResponse;
  const supabase = getClient();
  const id = getParam(event, "id", /\/api\/admin\/users\/([^/?]+)/);

  if (event.httpMethod === "GET") {
    const { data: users, error } = await supabase.from("users").select("*").order("role").order("nama");
    if (error) return json(500, { error: error.message });
    const { data: kelasList } = await supabase.from("kelas").select("*");
    const kelasMap = Object.fromEntries((kelasList || []).map((k) => [k.kelas_id, k.nama_kelas]));
    const rows = users.map((u) => ({
      users_id: u.users_id, nama: u.nama, username: u.username, role: u.role,
      kelas_id: u.kelas_id, nama_kelas: u.kelas_id ? kelasMap[u.kelas_id] || null : null,
    }));
    return json(200, rows);
  }

  if (event.httpMethod === "POST") {
    const { nama, username, password, role, kelas_id } = parseBody(event);
    if (!nama || !username || !password || !role) return json(400, { error: "Semua field wajib diisi." });
    if (!["admin", "guru", "siswa"].includes(role)) return json(400, { error: "Peran tidak valid." });
    const { data, error } = await supabase.from("users").insert({
      nama, username, password_hash: hashPassword(password), role, kelas_id: kelas_id || null,
    }).select().single();
    if (error) return json(400, { error: error.message.includes("duplicate") ? "Username sudah dipakai." : error.message });
    return json(200, { users_id: data.users_id });
  }

  if (event.httpMethod === "PUT") {
    if (!id) return json(400, { error: "ID pengguna wajib disertakan." });
    const body = parseBody(event);
    const patch = {};
    if (body.nama) patch.nama = body.nama;
    if (body.role) patch.role = body.role;
    if (body.kelas_id !== undefined) patch.kelas_id = body.kelas_id || null;
    if (body.password) patch.password_hash = hashPassword(body.password);
    const { error } = await supabase.from("users").update(patch).eq("users_id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  if (event.httpMethod === "DELETE") {
    if (!id) return json(400, { error: "ID pengguna wajib disertakan." });
    const { error } = await supabase.from("users").delete().eq("users_id", id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method tidak diizinkan." });
};
