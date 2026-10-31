const { getClient } = require("../../lib/supabaseClient");
const { hashPassword } = require("../../lib/auth");
const { json, parseBody, getParam, aman } = require("../../lib/httpHelpers");
const { cekAkses, galatFK, galatUnik, peta, sama, wajib } = require("../../lib/netlifyBersama");

async function validasiKelas(supabase, role, kelasId) {
  if (role !== "siswa") return { kelas: null };
  if (!kelasId) return { error: "Akun siswa wajib punya kelas." };
  const { data } = await supabase.from("kelas").select("*").eq("kelas_id", kelasId).maybeSingle();
  if (!data) return { error: "Kelas tidak ditemukan." };
  return { kelas: Number(kelasId) };
}

exports.handler = aman(async (event) => {
  const { user, errorResponse } = await cekAkses(event, "admin");
  if (errorResponse) return errorResponse;
  const supabase = getClient();
  const id = getParam(event, "id", /\/api\/admin\/users\/([^/?]+)/);

  if (event.httpMethod === "GET") {
    const users = wajib(await supabase.from("users").select("*").order("role").order("nama"));
    const kelasMap = peta(wajib(await supabase.from("kelas").select("*")), "kelas_id", "nama_kelas");
    return json(200, users.map((u) => ({
      users_id: u.users_id, nama: u.nama, username: u.username, role: u.role, kelas_id: u.kelas_id,
      aktif: u.aktif === 0 || u.aktif === false ? 0 : 1,
      nama_kelas: u.kelas_id ? kelasMap[String(u.kelas_id)] || null : null,
    })));
  }

  if (event.httpMethod === "POST") {
    const { nama, username, password, role, kelas_id } = parseBody(event);
    if (!nama || !username || !password || !role) return json(400, { error: "Semua field wajib diisi." });
    if (!["admin", "guru", "siswa"].includes(role)) return json(400, { error: "Peran tidak valid." });
    if (String(password).length < 6) return json(400, { error: "Kata sandi minimal 6 karakter." });
    const k = await validasiKelas(supabase, role, kelas_id);
    if (k.error) return json(400, { error: k.error });
    const { data, error } = await supabase.from("users").insert({
      nama: String(nama).trim(), username: String(username).trim(), password_hash: hashPassword(password), role, kelas_id: k.kelas,
    }).select().single();
    if (galatUnik(error)) return json(409, { error: "Username sudah dipakai." });
    if (error) return json(500, { error: error.message });
    return json(200, { users_id: data.users_id });
  }

  if (event.httpMethod === "PUT") {
    if (!id) return json(400, { error: "ID pengguna wajib disertakan." });
    const lama = wajib(await supabase.from("users").select("*").eq("users_id", id).maybeSingle());
    if (!lama) return json(404, { error: "Pengguna tidak ditemukan." });
    const body = parseBody(event);
    const diriSendiri = sama(lama.users_id, user.users_id);
    const roleBaru = body.role || lama.role;
    if (!["admin", "guru", "siswa"].includes(roleBaru)) return json(400, { error: "Peran tidak valid." });
    if (diriSendiri && roleBaru !== lama.role) return json(400, { error: "Kamu tidak bisa mengubah peran akunmu sendiri." });
    if (diriSendiri && body.aktif === false) return json(400, { error: "Kamu tidak bisa menonaktifkan akunmu sendiri." });
    if (body.password && String(body.password).length < 6) return json(400, { error: "Kata sandi minimal 6 karakter." });
    const k = await validasiKelas(supabase, roleBaru, body.kelas_id !== undefined ? body.kelas_id : lama.kelas_id);
    if (k.error) return json(400, { error: k.error });
    const patch = { nama: body.nama ? String(body.nama).trim() : lama.nama, role: roleBaru, kelas_id: k.kelas };
    if (body.aktif !== undefined) patch.aktif = body.aktif ? 1 : 0;
    if (body.password) patch.password_hash = hashPassword(body.password);
    wajib(await supabase.from("users").update(patch).eq("users_id", id));
    return json(200, { ok: true });
  }

  if (event.httpMethod === "DELETE") {
    if (!id) return json(400, { error: "ID pengguna wajib disertakan." });
    if (sama(id, user.users_id)) return json(400, { error: "Kamu tidak bisa menghapus akunmu sendiri." });
    const ada = wajib(await supabase.from("users").select("*").eq("users_id", id).maybeSingle());
    if (!ada) return json(404, { error: "Pengguna tidak ditemukan." });
    const { error } = await supabase.from("users").delete().eq("users_id", id);
    if (galatFK(error)) return json(409, { error: "Akun ini sudah punya soal, hasil tes, atau feedback, jadi tidak bisa dihapus. Nonaktifkan saja akunnya." });
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: "Method tidak diizinkan." });
});
