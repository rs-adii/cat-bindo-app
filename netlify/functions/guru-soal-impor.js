const { getClient } = require("../../lib/supabaseClient");
const { checkAuth } = require("../../lib/auth");
const { json, parseBody, aman } = require("../../lib/httpHelpers");
const { validasiSemua } = require("../../lib/soalImport");

// Impor massal dari Excel/CSV. Peramban membaca file jadi daftar objek;
// validasi ada di lib/soalImport.js. dryRun=true hanya memeriksa (pratinjau).
exports.handler = aman(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  const { user, errorResponse } = checkAuth(event, "guru");
  if (errorResponse) return errorResponse;
  const { rows, dryRun } = parseBody(event);
  const supabase = getClient();

  const [{ data: mapel }, { data: soal }] = await Promise.all([
    supabase.from("mapel").select("*"),
    supabase.from("soal").select("*"),
  ]);
  const hasil = validasiSemua(rows, mapel || [], soal || []);
  if (hasil.error) return json(400, { error: hasil.error });

  let jumlahDiimpor = 0;
  if (!dryRun && hasil.valid.length > 0) {
    const { error } = await supabase.from("soal").insert(
      hasil.valid.map(({ soal: x }) => ({ ...x, guru_id: user.users_id }))
    );
    if (error) return json(500, { error: error.message });
    jumlahDiimpor = hasil.valid.length;
  }
  return json(200, {
    dryRun: !!dryRun, totalBaris: hasil.total, jumlahValid: hasil.valid.length,
    jumlahDiimpor, galat: hasil.galat, ringkas: hasil.ringkas,
  });
});
