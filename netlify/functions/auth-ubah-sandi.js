const { getClient } = require("../../lib/supabaseClient");
const { verifyPassword, hashPassword } = require("../../lib/auth");
const { json, parseBody, aman } = require("../../lib/httpHelpers");
const { cekAkses, wajib } = require("../../lib/netlifyBersama");

exports.handler = aman(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { user, errorResponse } = await cekAkses(event);
  if (errorResponse) return errorResponse;
  const { sandiLama, sandiBaru } = parseBody(event);
  if (!sandiLama || !sandiBaru) return json(400, { error: "Kata sandi lama dan baru wajib diisi." });
  if (String(sandiBaru).length < 6) return json(400, { error: "Kata sandi baru minimal 6 karakter." });
  const supabase = getClient();
  const u = wajib(await supabase.from("users").select("*").eq("users_id", user.users_id).single());
  if (!verifyPassword(sandiLama, u.password_hash)) return json(400, { error: "Kata sandi lama salah." });
  if (sandiLama === sandiBaru) return json(400, { error: "Kata sandi baru harus berbeda dari yang lama." });
  wajib(await supabase.from("users").update({ password_hash: hashPassword(sandiBaru) }).eq("users_id", user.users_id));
  return json(200, { ok: true });
});
