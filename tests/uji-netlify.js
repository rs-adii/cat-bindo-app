// tests/uji-netlify.js — jalankan rangkaian uji API terhadap netlify/functions
// dengan tiruan Supabase (tests/mockSupabase.js). Rute dicocokkan memakai
// aturan redirect di netlify.toml, sama seperti di Netlify.
const fs = require("fs");
const path = require("path");
const { buatMock } = require("./mockSupabase");

function bacaRedirect() {
  const toml = fs.readFileSync(path.join(__dirname, "..", "netlify.toml"), "utf8");
  const aturan = [];
  const re = /from\s*=\s*"([^"]+)"\s*\n\s*to\s*=\s*"\/\.netlify\/functions\/([^"?]+)/g;
  let m;
  while ((m = re.exec(toml))) {
    const pola = new RegExp("^" + m[1].replace(/:[a-zA-Z]+/g, "[^/]+") + "$");
    aturan.push({ pola, fungsi: m[2] });
  }
  return aturan;
}

function buatAdaptor(opsiMock) {
  // Ganti klien Supabase SEBELUM fungsi dimuat (fungsi mengambil getClient saat dimuat)
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}lib${path.sep}`) || k.includes("netlify")) delete require.cache[k];
  const mock = buatMock(opsiMock);
  require("../lib/supabaseClient").getClient = () => mock;
  const aturan = bacaRedirect();
  const fungsi = {};
  return {
    mock,
    async panggil(method, p, body, token) {
      const cocok = aturan.find((a) => a.pola.test(p));
      if (!cocok) return { status: 404, body: { error: "rute tidak ada di netlify.toml: " + p } };
      fungsi[cocok.fungsi] = fungsi[cocok.fungsi] || require(`../netlify/functions/${cocok.fungsi}.js`);
      const res = await fungsi[cocok.fungsi].handler({
        httpMethod: method, path: p, rawUrl: "https://contoh.netlify.app" + p,
        headers: token ? { authorization: "Bearer " + token } : {},
        body: body === null || body === undefined ? null : JSON.stringify(body),
        queryStringParameters: {},
      });
      return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
    },
    async mundurkanSesi(sesiId, detik) {
      const s = mock._tabel("sesi_tes").find((x) => Number(x.sesites_id) === Number(sesiId));
      s.mulai = new Date(Date.parse(s.mulai) - detik * 1000).toISOString();
    },
  };
}

async function ujiSebelumMigrasi() {
  // Database lama: belum ada kolom users.aktif dan tabel pengaturan. Aplikasi harus tetap jalan.
  const A = buatAdaptor({ tanpaTabel: ["pengaturan"], tanpaKolomAktif: true });
  const lama = console.log; console.log = () => {};
  await require("../lib/seedSupabase").seed(A.mock);
  console.log = lama;
  const gagal = [];
  const r1 = await A.panggil("POST", "/api/auth/login", { username: "guru1", password: "guru123" });
  if (r1.status !== 200) gagal.push("login sebelum migrasi");
  const r2 = await A.panggil("GET", "/api/pengaturan", null, r1.body.token);
  if (r2.status !== 200 || r2.body.acak_opsi !== true) gagal.push("pengaturan bawaan sebelum migrasi");
  const r3 = await A.panggil("GET", "/api/guru/soal", null, r1.body.token);
  if (r3.status !== 200 || r3.body.length !== 21) gagal.push("akses data sebelum migrasi");
  const tA = (await A.panggil("POST", "/api/auth/login", { username: "admin", password: "admin123" })).body.token;
  const r4 = await A.panggil("PUT", "/api/pengaturan", { acak_opsi: false }, tA);
  if (r4.status !== 500 || !/migrasi-tampilan-baru/.test(r4.body.error)) gagal.push("pesan jelas saat tabel pengaturan belum ada");
  console.log(`Netlify sebelum migrasi: ${4 - gagal.length} pemeriksaan lulus, ${gagal.length} gagal ${gagal.join("; ")}`);
  return gagal.length === 0;
}

(async () => {
  const { jalankan } = require("./api-suite");
  const A = buatAdaptor({});
  const lama = console.log; console.log = () => {};
  await require("../lib/seedSupabase").seed(A.mock);
  console.log = lama;
  let ok = false;
  try {
    ok = await jalankan(A, "Mode Netlify (fungsi + tiruan Supabase)");
    ok = (await ujiSebelumMigrasi()) && ok;
  } catch (e) { console.error(e); ok = false; }
  process.exit(ok ? 0 : 1);
})();
