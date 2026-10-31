// server.js — mode lokal (Express + SQLite)
const express = require("express");
const path = require("path");
const { db } = require("./lib/db");
const { seed } = require("./lib/seed");
const auth = require("./lib/auth");
const cat = require("./lib/catEngineLevel");
const timer = require("./lib/timer");
const soalImport = require("./lib/soalImport");
const pengaturanLib = require("./lib/pengaturan");
const acakOpsi = require("./lib/acakOpsi");
const tanggal = require("./lib/tanggal");
const ringkasan = require("./lib/ringkasan");

seed(); // aman dipanggil berkali-kali, otomatis dilewati kalau sudah ada data

const app = express();
app.use(express.json({ limit: "2mb" })); // impor soal bisa memuat ratusan baris
app.use(express.static(path.join(__dirname, "public")));

const PESAN_LEVEL = "Tingkat kesulitan harus 1-3 (1 mudah, 2 sedang, 3 sulit).";
const NAMA_PERAN = { admin: "Admin", guru: "Guru", siswa: "Siswa" };
function rapikanMateri(m) {
  const t = String(m === null || m === undefined ? "" : m).trim();
  return t ? t.slice(0, 100) : null;
}
function acak(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
}
function j(res, status, body) {
  return res.status(status).json(body);
}
const galatFK = (e) => String(e && e.code).includes("FOREIGNKEY") || String(e && e.message).includes("FOREIGN KEY");
const galatUnik = (e) => String(e && e.code).includes("UNIQUE") || String(e && e.message).includes("UNIQUE");

function ambilPengaturan() {
  return pengaturanLib.gabung(db.prepare("SELECT kunci, nilai FROM pengaturan").all());
}

// Login JWT bersifat stateless; status akun dicek ke database di setiap permintaan
// supaya akun yang dinonaktifkan/dihapus admin langsung kehilangan akses.
function cekAkun(req, res, next) {
  const u = db.prepare("SELECT aktif, role FROM users WHERE users_id = ?").get(req.user.users_id);
  if (!u || !u.aktif) return j(res, 401, { error: "Akun ini dinonaktifkan atau sudah dihapus. Hubungi admin sekolah." });
  if (u.role !== req.user.role) return j(res, 401, { error: "Peran akun berubah. Silakan masuk lagi." });
  next();
}
const peran = (...roles) => [auth.requireRole(...roles), cekAkun];
const login = [auth.requireAuth, cekAkun];

// ============================== AUTH ==============================
app.post("/api/auth/login", (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return j(res, 400, { error: "Username dan password wajib diisi." });
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(String(username).trim());
  if (!user || !auth.verifyPassword(password, user.password_hash)) {
    return j(res, 401, { error: "Username atau password salah." });
  }
  if (!user.aktif) return j(res, 403, { error: "Akun ini dinonaktifkan. Hubungi admin sekolah." });
  // role (opsional) = tab peran yang dipilih di halaman login
  if (role && role !== user.role) {
    return j(res, 403, { error: `Akun ini terdaftar sebagai ${NAMA_PERAN[user.role]}. Pilih tab ${NAMA_PERAN[user.role]} lalu masuk lagi.` });
  }
  const token = auth.issueToken(user);
  j(res, 200, {
    token,
    user: { users_id: user.users_id, nama: user.nama, role: user.role, kelas_id: user.kelas_id },
  });
});

app.post("/api/auth/logout", auth.requireAuth, (req, res) => {
  auth.revokeToken((req.headers.authorization || "").slice(7));
  j(res, 200, { ok: true });
});

app.get("/api/auth/me", login, (req, res) => j(res, 200, req.user));

app.post("/api/auth/ubah-sandi", login, (req, res) => {
  const { sandiLama, sandiBaru } = req.body || {};
  if (!sandiLama || !sandiBaru) return j(res, 400, { error: "Kata sandi lama dan baru wajib diisi." });
  if (String(sandiBaru).length < 6) return j(res, 400, { error: "Kata sandi baru minimal 6 karakter." });
  const user = db.prepare("SELECT * FROM users WHERE users_id = ?").get(req.user.users_id);
  if (!auth.verifyPassword(sandiLama, user.password_hash)) return j(res, 400, { error: "Kata sandi lama salah." });
  if (sandiLama === sandiBaru) return j(res, 400, { error: "Kata sandi baru harus berbeda dari yang lama." });
  db.prepare("UPDATE users SET password_hash = ? WHERE users_id = ?").run(auth.hashPassword(sandiBaru), user.users_id);
  j(res, 200, { ok: true });
});

// ============================== PENGATURAN ==============================
// Semua peran boleh membaca (guru butuh bawaan jumlah soal/durasi, siswa butuh nama sekolah).
app.get("/api/pengaturan", login, (req, res) => j(res, 200, ambilPengaturan()));

app.put("/api/pengaturan", peran("admin"), (req, res) => {
  const { data, error } = pengaturanLib.validasi(req.body);
  if (error) return j(res, 400, { error });
  const ins = db.prepare("INSERT INTO pengaturan (kunci, nilai) VALUES (?, ?) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai");
  db.transaction(() => { for (const r of pengaturanLib.serialisasi(data)) ins.run(r.kunci, r.nilai); })();
  j(res, 200, ambilPengaturan());
});

// ============================== ADMIN: Kelola Data Pengguna ==============================
function validasiKelas(role, kelasId) {
  if (role !== "siswa") return { kelas: null };
  if (!kelasId) return { error: "Akun siswa wajib punya kelas." };
  if (!db.prepare("SELECT 1 FROM kelas WHERE kelas_id = ?").get(kelasId)) return { error: "Kelas tidak ditemukan." };
  return { kelas: Number(kelasId) };
}

app.get("/api/admin/users", peran("admin"), (req, res) => {
  const rows = db.prepare(`
    SELECT u.users_id, u.nama, u.username, u.role, u.kelas_id, u.aktif, k.nama_kelas
    FROM users u LEFT JOIN kelas k ON k.kelas_id = u.kelas_id
    ORDER BY u.role, u.nama
  `).all();
  j(res, 200, rows);
});

app.post("/api/admin/users", peran("admin"), (req, res) => {
  const { nama, username, password, role, kelas_id } = req.body || {};
  if (!nama || !username || !password || !role) return j(res, 400, { error: "Semua field wajib diisi." });
  if (!["admin", "guru", "siswa"].includes(role)) return j(res, 400, { error: "Peran tidak valid." });
  if (String(password).length < 6) return j(res, 400, { error: "Kata sandi minimal 6 karakter." });
  const k = validasiKelas(role, kelas_id);
  if (k.error) return j(res, 400, { error: k.error });
  try {
    const info = db.prepare(
      "INSERT INTO users (nama, username, password_hash, role, kelas_id, aktif) VALUES (?,?,?,?,?,1)"
    ).run(String(nama).trim(), String(username).trim(), auth.hashPassword(password), role, k.kelas);
    j(res, 200, { users_id: info.lastInsertRowid });
  } catch (e) {
    if (galatUnik(e)) return j(res, 409, { error: "Username sudah dipakai." });
    throw e;
  }
});

app.put("/api/admin/users/:id", peran("admin"), (req, res) => {
  const { nama, role, kelas_id, password, aktif } = req.body || {};
  const existing = db.prepare("SELECT * FROM users WHERE users_id = ?").get(req.params.id);
  if (!existing) return j(res, 404, { error: "Pengguna tidak ditemukan." });
  const diriSendiri = existing.users_id === req.user.users_id;
  const roleBaru = role || existing.role;
  if (!["admin", "guru", "siswa"].includes(roleBaru)) return j(res, 400, { error: "Peran tidak valid." });
  if (diriSendiri && roleBaru !== existing.role) return j(res, 400, { error: "Kamu tidak bisa mengubah peran akunmu sendiri." });
  if (diriSendiri && aktif === false) return j(res, 400, { error: "Kamu tidak bisa menonaktifkan akunmu sendiri." });
  if (password !== undefined && password !== "" && String(password).length < 6) return j(res, 400, { error: "Kata sandi minimal 6 karakter." });
  const k = validasiKelas(roleBaru, kelas_id !== undefined ? kelas_id : existing.kelas_id);
  if (k.error) return j(res, 400, { error: k.error });
  const aktifBaru = aktif === undefined ? existing.aktif : aktif ? 1 : 0;
  db.prepare("UPDATE users SET nama=?, role=?, kelas_id=?, aktif=? WHERE users_id=?").run(
    nama ? String(nama).trim() : existing.nama, roleBaru, k.kelas, aktifBaru, existing.users_id
  );
  if (password) db.prepare("UPDATE users SET password_hash=? WHERE users_id=?").run(auth.hashPassword(password), existing.users_id);
  j(res, 200, { ok: true });
});

app.delete("/api/admin/users/:id", peran("admin"), (req, res) => {
  if (Number(req.params.id) === req.user.users_id) return j(res, 400, { error: "Kamu tidak bisa menghapus akunmu sendiri." });
  try {
    const info = db.prepare("DELETE FROM users WHERE users_id = ?").run(req.params.id);
    if (!info.changes) return j(res, 404, { error: "Pengguna tidak ditemukan." });
  } catch (e) {
    if (galatFK(e)) return j(res, 409, { error: "Akun ini sudah punya soal, hasil tes, atau feedback, jadi tidak bisa dihapus. Nonaktifkan saja akunnya." });
    throw e;
  }
  j(res, 200, { ok: true });
});

// ============================== ADMIN: Kelola Kelas & Mapel ==============================
app.get("/api/admin/kelas", peran("admin", "guru"), (req, res) => {
  j(res, 200, db.prepare("SELECT * FROM kelas ORDER BY nama_kelas").all());
});
app.post("/api/admin/kelas", peran("admin"), (req, res) => {
  const { nama_kelas, jurusan } = req.body || {};
  if (!nama_kelas || !String(nama_kelas).trim()) return j(res, 400, { error: "Nama kelas wajib diisi." });
  const info = db.prepare("INSERT INTO kelas (nama_kelas, jurusan) VALUES (?,?)").run(String(nama_kelas).trim(), jurusan ? String(jurusan).trim() : null);
  j(res, 200, { kelas_id: info.lastInsertRowid });
});
app.put("/api/admin/kelas/:id", peran("admin"), (req, res) => {
  const { nama_kelas, jurusan } = req.body || {};
  if (!nama_kelas || !String(nama_kelas).trim()) return j(res, 400, { error: "Nama kelas wajib diisi." });
  const info = db.prepare("UPDATE kelas SET nama_kelas=?, jurusan=? WHERE kelas_id=?").run(String(nama_kelas).trim(), jurusan ? String(jurusan).trim() : null, req.params.id);
  if (!info.changes) return j(res, 404, { error: "Kelas tidak ditemukan." });
  j(res, 200, { ok: true });
});
app.delete("/api/admin/kelas/:id", peran("admin"), (req, res) => {
  try {
    db.prepare("DELETE FROM kelas WHERE kelas_id = ?").run(req.params.id);
  } catch (e) {
    if (galatFK(e)) return j(res, 409, { error: "Kelas ini masih punya siswa atau jadwal tes, jadi tidak bisa dihapus." });
    throw e;
  }
  j(res, 200, { ok: true });
});

app.get("/api/admin/mapel", peran("admin", "guru"), (req, res) => {
  j(res, 200, db.prepare("SELECT * FROM mapel ORDER BY nama_mapel").all());
});
app.post("/api/admin/mapel", peran("admin"), (req, res) => {
  const { nama_mapel } = req.body || {};
  if (!nama_mapel || !String(nama_mapel).trim()) return j(res, 400, { error: "Nama mapel wajib diisi." });
  try {
    const info = db.prepare("INSERT INTO mapel (nama_mapel) VALUES (?)").run(String(nama_mapel).trim());
    j(res, 200, { mapel_id: info.lastInsertRowid });
  } catch (e) {
    if (galatUnik(e)) return j(res, 409, { error: "Mapel sudah ada." });
    throw e;
  }
});
app.put("/api/admin/mapel/:id", peran("admin"), (req, res) => {
  const { nama_mapel } = req.body || {};
  if (!nama_mapel || !String(nama_mapel).trim()) return j(res, 400, { error: "Nama mapel wajib diisi." });
  try {
    const info = db.prepare("UPDATE mapel SET nama_mapel = ? WHERE mapel_id = ?").run(String(nama_mapel).trim(), req.params.id);
    if (!info.changes) return j(res, 404, { error: "Mapel tidak ditemukan." });
  } catch (e) {
    if (galatUnik(e)) return j(res, 409, { error: "Mapel dengan nama itu sudah ada." });
    throw e;
  }
  j(res, 200, { ok: true });
});
app.delete("/api/admin/mapel/:id", peran("admin"), (req, res) => {
  try {
    db.prepare("DELETE FROM mapel WHERE mapel_id = ?").run(req.params.id);
  } catch (e) {
    if (galatFK(e)) return j(res, 409, { error: "Mapel ini masih punya soal atau jadwal tes, jadi tidak bisa dihapus." });
    throw e;
  }
  j(res, 200, { ok: true });
});

// ============================== GURU: Kelola Bank Soal ==============================
const PESAN_BUKAN_PEMILIK = "Soal ini dibuat guru lain. Kamu hanya bisa mengubah atau menghapus soal milikmu sendiri.";

app.get("/api/guru/soal", peran("guru", "admin"), (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, m.nama_mapel, u.nama AS nama_guru
    FROM soal s
    JOIN mapel m ON m.mapel_id = s.mapel_id
    LEFT JOIN users u ON u.users_id = s.guru_id
    ORDER BY s.mapel_id, s.tingkat_kesulitan
  `).all();
  j(res, 200, rows);
});
app.post("/api/guru/soal", peran("guru"), (req, res) => {
  const { mapel_id, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, kunci, tingkat_kesulitan, materi } = req.body || {};
  if (!mapel_id || !pertanyaan || !opsi_a || !opsi_b || !opsi_c || !opsi_d || !kunci || !tingkat_kesulitan) {
    return j(res, 400, { error: "Semua field soal wajib diisi." });
  }
  if (!["A", "B", "C", "D"].includes(kunci)) return j(res, 400, { error: "Kunci jawaban harus A, B, C, atau D." });
  const level = cat.parseLevel(tingkat_kesulitan);
  if (level === null) return j(res, 400, { error: PESAN_LEVEL });
  const info = db.prepare(`
    INSERT INTO soal (mapel_id, guru_id, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, kunci, tingkat_kesulitan, materi)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(mapel_id, req.user.users_id, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, kunci, level, rapikanMateri(materi));
  j(res, 200, { soal_id: info.lastInsertRowid });
});

// Impor massal dari Excel/CSV. Peramban membaca file jadi daftar objek;
// validasi ada di lib/soalImport.js. dryRun=true hanya memeriksa (pratinjau).
app.post("/api/guru/soal/impor", peran("guru"), (req, res) => {
  const { rows, dryRun } = req.body || {};
  const hasil = soalImport.validasiSemua(
    rows,
    db.prepare("SELECT mapel_id, nama_mapel FROM mapel").all(),
    db.prepare("SELECT mapel_id, pertanyaan FROM soal").all()
  );
  if (hasil.error) return j(res, 400, { error: hasil.error });

  let jumlahDiimpor = 0;
  if (!dryRun && hasil.valid.length > 0) {
    const ins = db.prepare(`
      INSERT INTO soal (mapel_id, guru_id, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, kunci, tingkat_kesulitan, materi)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    db.transaction(() => {
      for (const { soal: x } of hasil.valid) {
        ins.run(x.mapel_id, req.user.users_id, x.pertanyaan, x.opsi_a, x.opsi_b, x.opsi_c, x.opsi_d, x.kunci, x.tingkat_kesulitan, x.materi);
      }
    })();
    jumlahDiimpor = hasil.valid.length;
  }
  j(res, 200, {
    dryRun: !!dryRun, totalBaris: hasil.total, jumlahValid: hasil.valid.length,
    jumlahDiimpor, galat: hasil.galat, ringkas: hasil.ringkas,
  });
});

app.put("/api/guru/soal/:id", peran("guru"), (req, res) => {
  const f = req.body || {};
  const existing = db.prepare("SELECT * FROM soal WHERE soal_id=?").get(req.params.id);
  if (!existing) return j(res, 404, { error: "Soal tidak ditemukan." });
  if (existing.guru_id !== req.user.users_id) return j(res, 403, { error: PESAN_BUKAN_PEMILIK });
  if (f.kunci !== undefined && !["A", "B", "C", "D"].includes(f.kunci)) return j(res, 400, { error: "Kunci jawaban harus A, B, C, atau D." });
  let level = existing.tingkat_kesulitan;
  if (f.tingkat_kesulitan !== undefined) {
    level = cat.parseLevel(f.tingkat_kesulitan);
    if (level === null) return j(res, 400, { error: PESAN_LEVEL });
  }
  db.prepare(`
    UPDATE soal SET pertanyaan=?, opsi_a=?, opsi_b=?, opsi_c=?, opsi_d=?, kunci=?, tingkat_kesulitan=?, materi=?
    WHERE soal_id=?
  `).run(
    f.pertanyaan || existing.pertanyaan, f.opsi_a || existing.opsi_a, f.opsi_b || existing.opsi_b,
    f.opsi_c || existing.opsi_c, f.opsi_d || existing.opsi_d, f.kunci || existing.kunci,
    level, f.materi !== undefined ? rapikanMateri(f.materi) : existing.materi, req.params.id
  );
  j(res, 200, { ok: true });
});
app.delete("/api/guru/soal/:id", peran("guru"), (req, res) => {
  const existing = db.prepare("SELECT * FROM soal WHERE soal_id=?").get(req.params.id);
  if (!existing) return j(res, 404, { error: "Soal tidak ditemukan." });
  if (existing.guru_id !== req.user.users_id) return j(res, 403, { error: PESAN_BUKAN_PEMILIK });
  try {
    db.prepare("DELETE FROM soal WHERE soal_id = ?").run(req.params.id);
  } catch (e) {
    if (galatFK(e)) return j(res, 409, { error: "Soal ini sudah pernah dipakai dalam tes siswa, jadi tidak bisa dihapus." });
    throw e;
  }
  j(res, 200, { ok: true });
});

// ============================== GURU: Atur Jadwal Tes ==============================
app.get("/api/guru/tes", peran("guru", "admin"), (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, m.nama_mapel, k.nama_kelas FROM tes t
    JOIN mapel m ON m.mapel_id = t.mapel_id
    LEFT JOIN kelas k ON k.kelas_id = t.kelas_id
    ORDER BY t.tanggal DESC, t.tes_id DESC
  `).all();
  j(res, 200, rows);
});
app.post("/api/guru/tes", peran("guru"), (req, res) => {
  const { mapel_id, kelas_id, judul, jumlah_soal, durasi_menit, tanggal: tgl } = req.body || {};
  if (!mapel_id || !judul || !jumlah_soal || !durasi_menit || !tgl) {
    return j(res, 400, { error: "Semua field tes wajib diisi." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tgl))) return j(res, 400, { error: "Format tanggal harus YYYY-MM-DD." });
  if (!(Number(jumlah_soal) >= 1) || !(Number(durasi_menit) >= 1)) return j(res, 400, { error: "Jumlah soal dan durasi minimal 1." });
  const info = db.prepare(`
    INSERT INTO tes (mapel_id, kelas_id, judul, jumlah_soal, durasi_menit, tanggal) VALUES (?,?,?,?,?,?)
  `).run(mapel_id, kelas_id || null, String(judul).trim(), Number(jumlah_soal), Number(durasi_menit), tgl);
  j(res, 200, { tes_id: info.lastInsertRowid });
});
app.delete("/api/guru/tes/:id", peran("guru"), (req, res) => {
  try {
    db.prepare("DELETE FROM tes WHERE tes_id = ?").run(req.params.id);
  } catch (e) {
    if (galatFK(e)) return j(res, 409, { error: "Tes ini sudah dikerjakan siswa atau punya kuesioner, jadi tidak bisa dihapus." });
    throw e;
  }
  j(res, 200, { ok: true });
});

// ============================== GURU: Kelola Kuesioner ==============================
function jumlahRespon(kuesionerId) {
  return db.prepare(`
    SELECT COUNT(DISTINCT rk.siswa_id) AS n FROM respon_kuesioner rk
    JOIN pertanyaan_kuesioner pk ON pk.pertanyaan_kuesioner_id = rk.pertanyaan_id
    WHERE pk.kuesioner_id = ?
  `).get(kuesionerId).n;
}
function validasiKuesioner(body) {
  const judul = String((body && body.judul) || "").trim();
  const pertanyaan = Array.isArray(body && body.pertanyaan) ? body.pertanyaan.map((p) => String(p || "").trim()).filter(Boolean) : [];
  if (!judul || pertanyaan.length === 0) return { error: "Judul dan minimal satu pertanyaan wajib diisi." };
  if (pertanyaan.length > 30) return { error: "Maksimal 30 pertanyaan." };
  if (pertanyaan.some((p) => p.length > 300)) return { error: "Setiap pertanyaan maksimal 300 karakter." };
  return { judul, pertanyaan };
}

app.get("/api/guru/kuesioner/:tesId", peran("guru", "admin"), (req, res) => {
  const kuesioner = db.prepare("SELECT * FROM kuesioner WHERE tes_id = ?").get(req.params.tesId);
  if (!kuesioner) return j(res, 200, null);
  const pertanyaan = db.prepare("SELECT * FROM pertanyaan_kuesioner WHERE kuesioner_id = ? ORDER BY pertanyaan_kuesioner_id").all(kuesioner.kuesioner_id);
  j(res, 200, { ...kuesioner, pertanyaan, jumlahRespon: jumlahRespon(kuesioner.kuesioner_id) });
});
app.post("/api/guru/kuesioner", peran("guru"), (req, res) => {
  const v = validasiKuesioner(req.body);
  if (v.error) return j(res, 400, { error: v.error });
  const tesId = (req.body || {}).tes_id;
  if (!db.prepare("SELECT 1 FROM tes WHERE tes_id = ?").get(tesId)) return j(res, 404, { error: "Tes tidak ditemukan." });
  if (db.prepare("SELECT 1 FROM kuesioner WHERE tes_id = ?").get(tesId)) {
    return j(res, 409, { error: "Tes ini sudah punya kuesioner. Ubah kuesioner yang ada." });
  }
  const kuesionerId = db.transaction(() => {
    const kId = db.prepare("INSERT INTO kuesioner (tes_id, judul) VALUES (?,?)").run(tesId, v.judul).lastInsertRowid;
    const ins = db.prepare("INSERT INTO pertanyaan_kuesioner (kuesioner_id, soal) VALUES (?,?)");
    for (const p of v.pertanyaan) ins.run(kId, p);
    return kId;
  })();
  j(res, 200, { kuesioner_id: kuesionerId });
});
// Ubah kuesioner. Pertanyaan hanya bisa diganti selama belum ada siswa yang mengisi,
// supaya rekap rata-rata tidak mencampur jawaban untuk pertanyaan yang berbeda.
app.put("/api/guru/kuesioner/:tesId", peran("guru"), (req, res) => {
  const v = validasiKuesioner(req.body);
  if (v.error) return j(res, 400, { error: v.error });
  const k = db.prepare("SELECT * FROM kuesioner WHERE tes_id = ?").get(req.params.tesId);
  if (!k) return j(res, 404, { error: "Kuesioner untuk tes ini belum ada." });
  const lama = db.prepare("SELECT soal FROM pertanyaan_kuesioner WHERE kuesioner_id = ? ORDER BY pertanyaan_kuesioner_id").all(k.kuesioner_id).map((r) => r.soal);
  const pertanyaanBerubah = lama.length !== v.pertanyaan.length || lama.some((p, i) => p !== v.pertanyaan[i]);
  if (pertanyaanBerubah && jumlahRespon(k.kuesioner_id) > 0) {
    return j(res, 409, { error: "Kuesioner ini sudah diisi siswa, jadi pertanyaannya tidak bisa diubah lagi. Judul masih bisa diganti." });
  }
  db.transaction(() => {
    db.prepare("UPDATE kuesioner SET judul = ? WHERE kuesioner_id = ?").run(v.judul, k.kuesioner_id);
    if (pertanyaanBerubah) {
      db.prepare("DELETE FROM pertanyaan_kuesioner WHERE kuesioner_id = ?").run(k.kuesioner_id);
      const ins = db.prepare("INSERT INTO pertanyaan_kuesioner (kuesioner_id, soal) VALUES (?,?)");
      for (const p of v.pertanyaan) ins.run(k.kuesioner_id, p);
    }
  })();
  j(res, 200, { ok: true });
});

// ============================== GURU: Lihat hasil & rekap feedback ==============================
// Semua sesi (selesai dan sedang dikerjakan), supaya guru bisa memantau siswa yang belum selesai.
app.get("/api/guru/hasil", peran("guru", "admin"), (req, res) => {
  sapuSesiKadaluarsa(); // sesi yang waktunya habis tapi siswanya tidak kembali ikut diselesaikan
  const rows = db.prepare(`
    SELECT st.sesites_id, st.tes_id, u.nama, k.nama_kelas, t.judul AS judul_tes, st.nilai, st.level_akhir, st.status, st.mulai, st.selesai,
           (SELECT COUNT(*) FROM jawaban WHERE sesi_id = st.sesites_id) AS jumlah_soal_dijawab, t.jumlah_soal
    FROM sesi_tes st
    JOIN users u ON u.users_id = st.siswa_id
    JOIN tes t ON t.tes_id = st.tes_id
    LEFT JOIN kelas k ON k.kelas_id = u.kelas_id
    ORDER BY COALESCE(st.selesai, st.mulai) DESC
  `).all();
  j(res, 200, rows);
});

app.get("/api/guru/feedback-summary/:tesId", peran("guru", "admin"), (req, res) => {
  const anonim = ambilPengaturan().kuesioner_anonim;
  const kuesioner = db.prepare("SELECT * FROM kuesioner WHERE tes_id = ?").get(req.params.tesId);
  if (!kuesioner) return j(res, 200, { ada: false, anonim, jumlahResponden: 0, rataRata: [], komentar: [] });
  const pertanyaanList = db.prepare("SELECT * FROM pertanyaan_kuesioner WHERE kuesioner_id = ? ORDER BY pertanyaan_kuesioner_id").all(kuesioner.kuesioner_id);

  const rataRata = pertanyaanList.map((p) => {
    const agg = db.prepare(
      "SELECT AVG(skor) AS rata, COUNT(*) AS n FROM respon_kuesioner WHERE pertanyaan_id = ? AND skor IS NOT NULL"
    ).get(p.pertanyaan_kuesioner_id);
    return {
      id: p.pertanyaan_kuesioner_id,
      pernyataan: p.soal,
      rata: agg.rata !== null ? Number(agg.rata.toFixed(2)) : null,
      n: agg.n,
    };
  });

  const komentarRows = db.prepare(`
    SELECT rk.komentar, u.nama, k.nama_kelas
    FROM respon_kuesioner rk
    JOIN pertanyaan_kuesioner pk ON pk.pertanyaan_kuesioner_id = rk.pertanyaan_id
    LEFT JOIN users u ON u.users_id = rk.siswa_id
    LEFT JOIN kelas k ON k.kelas_id = u.kelas_id
    WHERE pk.kuesioner_id = ? AND rk.komentar IS NOT NULL AND rk.komentar != ''
    ORDER BY rk.respon_kuesioner_id
  `).all(kuesioner.kuesioner_id);

  // Anonim: tanpa nama/kelas, dan urutannya diacak supaya komentar tidak bisa
  // dicocokkan dengan urutan siswa yang selesai tes di tabel hasil.
  const komentar = anonim
    ? acak(komentarRows.map((r) => ({ komentar: r.komentar })))
    : komentarRows.map((r) => ({ komentar: r.komentar, nama: r.nama, nama_kelas: r.nama_kelas }));
  j(res, 200, { ada: true, anonim, judul: kuesioner.judul, jumlahResponden: jumlahRespon(kuesioner.kuesioner_id), rataRata, komentar });
});

// ============================== SISWA ==============================
function jawabanSesi(sesiId) {
  // level_soal = tingkat kesulitan SOAL yang dijawab (dasar bobot nilai)
  return db.prepare(`
    SELECT j.*, s.tingkat_kesulitan AS level_soal
    FROM jawaban j LEFT JOIN soal s ON s.soal_id = j.soal_id
    WHERE j.sesi_id = ? ORDER BY j.urutan
  `).all(sesiId);
}
function levelDariJawaban(js) {
  if (js.length === 0) return cat.START_LEVEL;
  const last = js[js.length - 1];
  return cat.nextLevel(last.level_saat_itu, !!last.benar);
}
function bentukHasil(sesiId, nilai, levelAkhir, jumlahSoal, tes, waktuHabis) {
  return {
    sesiId, nilai, kategori: cat.kategoriNilai(nilai), levelAkhir,
    jumlahSoal, jumlahTarget: tes.jumlah_soal, waktuHabis: !!waktuHabis,
  };
}
// Menutup sesi. Nilai berbobot level soal (mudah 1, sedang 2, sulit 3) kecuali
// pengaturan "Bobot skor per level" dimatikan.
// karenaWaktu=true: soal yang belum sempat dijawab dihitung salah (bobot level
// siswa saat itu) dan waktu selesai dicatat sebagai tenggatnya.
function finalisasiSesi(sesi, tes, { karenaWaktu }) {
  const js = jawabanSesi(sesi.sesites_id);
  const levelAkhir = levelDariJawaban(js);
  const nilai = cat.hitungNilai(
    js.map((r) => ({ benar: r.benar, level: r.level_soal || r.level_saat_itu })),
    {
      belumDijawab: karenaWaktu ? Math.max(0, tes.jumlah_soal - js.length) : 0,
      levelBelumDijawab: levelAkhir,
      ...ringkasan.opsiNilai(ambilPengaturan()),
    }
  );
  const selesaiAt = karenaWaktu
    ? new Date(timer.tenggatMs(sesi.mulai, tes.durasi_menit)).toISOString()
    : new Date().toISOString();
  db.prepare("UPDATE sesi_tes SET status='selesai', nilai=?, level_akhir=?, selesai=? WHERE sesites_id=?")
    .run(nilai, levelAkhir, selesaiAt, sesi.sesites_id);
  return bentukHasil(sesi.sesites_id, nilai, levelAkhir, js.length, tes, karenaWaktu);
}
function hasilDariSesiSelesai(sesi, tes) {
  const n = db.prepare("SELECT COUNT(*) AS n FROM jawaban WHERE sesi_id = ?").get(sesi.sesites_id).n;
  return bentukHasil(sesi.sesites_id, sesi.nilai, sesi.level_akhir, n, tes, n < tes.jumlah_soal);
}
// Sesi 'ongoing' yang waktunya sudah lewat (siswa menutup tab / pergi) ditutup otomatis.
function sapuSesiKadaluarsa() {
  const rows = db.prepare(`
    SELECT st.*, t.durasi_menit AS t_durasi, t.jumlah_soal AS t_jumlah
    FROM sesi_tes st JOIN tes t ON t.tes_id = st.tes_id WHERE st.status = 'ongoing'
  `).all();
  for (const r of rows) {
    if (timer.sisaDetik(r.mulai, r.t_durasi) <= -timer.GRACE_DETIK) {
      finalisasiSesi(r, { jumlah_soal: r.t_jumlah, durasi_menit: r.t_durasi }, { karenaWaktu: true });
    }
  }
}
const urutanUntuk = (sesiId, soalId, aktif) => (aktif ? acakOpsi.urutanOpsi(sesiId, soalId) : acakOpsi.IDENTITAS);

// Soal berikutnya: level target, tidak mengulang soal di sesi ini, dan (bila
// pengaturan "Jangan ulang soal" aktif) mengutamakan soal yang belum pernah
// diterima siswa ini di tes lain.
function soalBerikutnya(sesi, tes, usedIds, level, peng) {
  const pool = db.prepare("SELECT * FROM soal WHERE mapel_id = ? ORDER BY soal_id").all(tes.mapel_id);
  let hindari = null;
  if (peng.jangan_ulang_soal) {
    hindari = new Set(db.prepare(`
      SELECT j.soal_id FROM jawaban j JOIN sesi_tes st ON st.sesites_id = j.sesi_id
      WHERE st.siswa_id = ? AND st.sesites_id != ?
    `).all(sesi.siswa_id, sesi.sesites_id).map((r) => r.soal_id));
  }
  return cat.pickByLevel(pool, usedIds, level, hindari, acakOpsi.pembangkitSoal(sesi.sesites_id, usedIds.size));
}

app.get("/api/siswa/tes-tersedia", peran("siswa"), (req, res) => {
  sapuSesiKadaluarsa();
  const peng = ambilPengaturan();
  const rows = db.prepare(`
    SELECT t.tes_id, t.judul, t.jumlah_soal, t.durasi_menit, t.tanggal, m.nama_mapel,
           (SELECT status FROM sesi_tes WHERE tes_id = t.tes_id AND siswa_id = ? ORDER BY sesites_id DESC LIMIT 1) AS status_saya,
           (SELECT nilai FROM sesi_tes WHERE tes_id = t.tes_id AND siswa_id = ? ORDER BY sesites_id DESC LIMIT 1) AS nilai_saya,
           (SELECT sesites_id FROM sesi_tes WHERE tes_id = t.tes_id AND siswa_id = ? ORDER BY sesites_id DESC LIMIT 1) AS sesi_saya
    FROM tes t JOIN mapel m ON m.mapel_id = t.mapel_id
    WHERE t.kelas_id IS NULL OR t.kelas_id = ?
    ORDER BY t.tanggal DESC
  `).all(req.user.users_id, req.user.users_id, req.user.users_id, req.user.kelas_id);
  j(res, 200, rows.map((r) => ({
    ...r, dibuka: tanggal.sudahDibuka(r.tanggal), nilai_saya: peng.tampilkan_nilai ? r.nilai_saya : null,
  })));
});

app.post("/api/siswa/tes/:tesId/mulai", peran("siswa"), (req, res) => {
  const tes = db.prepare("SELECT * FROM tes WHERE tes_id = ?").get(req.params.tesId);
  if (!tes) return j(res, 404, { error: "Tes tidak ditemukan." });
  if (tes.kelas_id && tes.kelas_id !== req.user.kelas_id) return j(res, 403, { error: "Tes ini bukan untuk kelasmu." });
  const peng = ambilPengaturan();

  let sesi = db.prepare(
    "SELECT * FROM sesi_tes WHERE tes_id = ? AND siswa_id = ? AND status = 'ongoing'"
  ).get(tes.tes_id, req.user.users_id);

  if (sesi) {
    // Melanjutkan sesi lama: kalau waktunya sudah habis, tutup dan tampilkan hasil.
    if (timer.sisaDetik(sesi.mulai, tes.durasi_menit) <= 0) {
      return j(res, 200, { selesai: true, hasil: ringkasan.saringHasilSiswa(finalisasiSesi(sesi, tes, { karenaWaktu: true }), peng) });
    }
  } else {
    if (!tanggal.sudahDibuka(tes.tanggal)) {
      return j(res, 403, { error: `Tes ini baru dibuka pada ${tanggal.tanggalTes(tes.tanggal)}.` });
    }
    const sudahSelesai = db.prepare(
      "SELECT 1 FROM sesi_tes WHERE tes_id = ? AND siswa_id = ? AND status = 'selesai'"
    ).get(tes.tes_id, req.user.users_id);
    if (sudahSelesai) return j(res, 400, { error: "Tes ini sudah pernah kamu selesaikan." });

    const info = db.prepare("INSERT INTO sesi_tes (tes_id, siswa_id, status) VALUES (?,?, 'ongoing')")
      .run(tes.tes_id, req.user.users_id);
    sesi = db.prepare("SELECT * FROM sesi_tes WHERE sesites_id = ?").get(info.lastInsertRowid);
  }

  const js = jawabanSesi(sesi.sesites_id);
  if (js.length >= tes.jumlah_soal) {
    return j(res, 200, { selesai: true, hasil: ringkasan.saringHasilSiswa(finalisasiSesi(sesi, tes, { karenaWaktu: false }), peng) });
  }

  const soal = soalBerikutnya(sesi, tes, new Set(js.map((r) => r.soal_id)), levelDariJawaban(js), peng);
  if (!soal) return j(res, 400, { error: "Bank soal untuk mapel ini belum cukup." });

  j(res, 200, {
    sesiId: sesi.sesites_id,
    soal: cat.publicSoal(soal, urutanUntuk(sesi.sesites_id, soal.soal_id, peng.acak_opsi)),
    progress: { jumlah: js.length, total: tes.jumlah_soal },
    sisaDetik: timer.sisaDetik(sesi.mulai, tes.durasi_menit),
    durasiMenit: tes.durasi_menit,
    // riwayat untuk panel "Riwayat jawaban" saat tes dilanjutkan dari perangkat lain/setelah muat ulang
    riwayat: ringkasan.rincianJawaban(js).alur.map((a) => (peng.tampilkan_nilai ? a : { level: a.level })),
  });
});

app.post("/api/siswa/sesi/:sesiId/jawab", peran("siswa"), (req, res) => {
  const sesi = db.prepare("SELECT * FROM sesi_tes WHERE sesites_id = ?").get(req.params.sesiId);
  if (!sesi || sesi.siswa_id !== req.user.users_id) return j(res, 404, { error: "Sesi tidak ditemukan." });
  if (sesi.status !== "ongoing") return j(res, 400, { error: "Sesi ini sudah selesai." });

  const tes = db.prepare("SELECT * FROM tes WHERE tes_id = ?").get(sesi.tes_id);
  const peng = ambilPengaturan();

  // Waktu habis: jawaban ini tidak dihitung; sesi ditutup dan hasilnya dikembalikan.
  if (timer.sisaDetik(sesi.mulai, tes.durasi_menit) < -timer.GRACE_DETIK) {
    return j(res, 200, { selesai: true, hasil: ringkasan.saringHasilSiswa(finalisasiSesi(sesi, tes, { karenaWaktu: true }), peng) });
  }

  const { soalId, jawabanHuruf, acak: acakDitampilkan } = req.body || {};
  const soal = db.prepare("SELECT * FROM soal WHERE soal_id = ?").get(soalId);
  if (!soal) return j(res, 400, { error: "Soal tidak ditemukan." });

  const jsSebelum = jawabanSesi(sesi.sesites_id);
  if (jsSebelum.some((r) => r.soal_id === soal.soal_id)) {
    return j(res, 400, { error: "Soal ini sudah dijawab pada sesi ini." });
  }
  // Huruf yang dipilih siswa adalah huruf TAMPILAN; terjemahkan ke huruf asli bank soal.
  // `acak` dikirim balik oleh peramban (dari soal yang ditampilkan) supaya pengaturan
  // yang diubah admin di tengah tes tidak salah menerjemahkan jawaban.
  const pakaiAcak = typeof acakDitampilkan === "boolean" ? acakDitampilkan : peng.acak_opsi;
  const huruf = acakOpsi.hurufAsli(jawabanHuruf, urutanUntuk(sesi.sesites_id, soal.soal_id, pakaiAcak));
  if (!huruf) return j(res, 400, { error: "Pilih salah satu jawaban A, B, C, atau D." });

  const urutan = jsSebelum.length + 1;
  const levelSaatIni = levelDariJawaban(jsSebelum);
  const benar = huruf === soal.kunci;
  // Umpan balik jawaban barusan untuk panel "Riwayat jawaban" di layar tes
  const jawabanTadi = peng.tampilkan_nilai ? { benar, level: soal.tingkat_kesulitan } : { level: soal.tingkat_kesulitan };
  db.prepare(`
    INSERT INTO jawaban (sesi_id, soal_id, jawaban, benar, level_saat_itu, urutan) VALUES (?,?,?,?,?,?)
  `).run(sesi.sesites_id, soal.soal_id, huruf, benar ? 1 : 0, levelSaatIni, urutan);

  if (urutan >= tes.jumlah_soal) {
    return j(res, 200, { selesai: true, jawabanTadi, hasil: ringkasan.saringHasilSiswa(finalisasiSesi(sesi, tes, { karenaWaktu: false }), peng) });
  }

  const usedIds = new Set([...jsSebelum.map((r) => r.soal_id), soal.soal_id]);
  const soalBerikut = soalBerikutnya(sesi, tes, usedIds, cat.nextLevel(levelSaatIni, benar), peng);
  if (!soalBerikut) {
    return j(res, 200, {
      selesai: true, jawabanTadi, hasil: ringkasan.saringHasilSiswa(finalisasiSesi(sesi, tes, { karenaWaktu: false }), peng),
      catatan: "Bank soal habis sebelum jumlah target tercapai.",
    });
  }

  j(res, 200, {
    selesai: false,
    jawabanTadi,
    soal: cat.publicSoal(soalBerikut, urutanUntuk(sesi.sesites_id, soalBerikut.soal_id, peng.acak_opsi)),
    progress: { jumlah: urutan, total: tes.jumlah_soal },
    sisaDetik: timer.sisaDetik(sesi.mulai, tes.durasi_menit),
  });
});

// Dipanggil peramban saat hitung mundur mencapai nol. Server yang memutuskan:
// kalau waktu memang sudah habis, sesi ditutup; kalau belum (jam perangkat
// tidak sinkron), kembalikan sisa waktu yang benar.
app.post("/api/siswa/sesi/:sesiId/selesai", peran("siswa"), (req, res) => {
  const sesi = db.prepare("SELECT * FROM sesi_tes WHERE sesites_id = ?").get(req.params.sesiId);
  if (!sesi || sesi.siswa_id !== req.user.users_id) return j(res, 404, { error: "Sesi tidak ditemukan." });
  const tes = db.prepare("SELECT * FROM tes WHERE tes_id = ?").get(sesi.tes_id);
  const peng = ambilPengaturan();

  if (sesi.status === "selesai") return j(res, 200, { selesai: true, hasil: ringkasan.saringHasilSiswa(hasilDariSesiSelesai(sesi, tes), peng) });

  const sisa = timer.sisaDetik(sesi.mulai, tes.durasi_menit);
  if (sisa > 0) return j(res, 200, { selesai: false, sisaDetik: sisa });
  j(res, 200, { selesai: true, hasil: ringkasan.saringHasilSiswa(finalisasiSesi(sesi, tes, { karenaWaktu: true }), peng) });
});

// ---------- Kuesioner siswa ----------
function sudahIsiKuesioner(kuesionerId, siswaId) {
  return !!db.prepare(`
    SELECT 1 FROM respon_kuesioner rk JOIN pertanyaan_kuesioner pk ON pk.pertanyaan_kuesioner_id = rk.pertanyaan_id
    WHERE pk.kuesioner_id = ? AND rk.siswa_id = ? LIMIT 1
  `).get(kuesionerId, siswaId);
}

app.get("/api/siswa/kuesioner/:tesId", peran("siswa"), (req, res) => {
  const kuesioner = db.prepare("SELECT * FROM kuesioner WHERE tes_id = ?").get(req.params.tesId);
  if (!kuesioner) return j(res, 200, null);
  const pertanyaan = db.prepare("SELECT * FROM pertanyaan_kuesioner WHERE kuesioner_id = ? ORDER BY pertanyaan_kuesioner_id").all(kuesioner.kuesioner_id);
  j(res, 200, {
    kuesioner_id: kuesioner.kuesioner_id, tes_id: kuesioner.tes_id, judul: kuesioner.judul, pertanyaan,
    sudahDiisi: sudahIsiKuesioner(kuesioner.kuesioner_id, req.user.users_id),
    anonim: ambilPengaturan().kuesioner_anonim,
  });
});

// Daftar kuesioner untuk tes yang sudah diselesaikan siswa (untuk Beranda & menu Kuesioner)
app.get("/api/siswa/kuesioner-saya", peran("siswa"), (req, res) => {
  const rows = db.prepare(`
    SELECT k.kuesioner_id, k.judul, t.tes_id, t.judul AS judul_tes, MAX(st.sesites_id) AS sesi_id
    FROM sesi_tes st JOIN tes t ON t.tes_id = st.tes_id JOIN kuesioner k ON k.tes_id = t.tes_id
    WHERE st.siswa_id = ? AND st.status = 'selesai'
    GROUP BY k.kuesioner_id ORDER BY MAX(st.selesai) DESC
  `).all(req.user.users_id);
  j(res, 200, rows.map((r) => ({ ...r, sudahDiisi: sudahIsiKuesioner(r.kuesioner_id, req.user.users_id) })));
});

app.post("/api/siswa/kuesioner/submit", peran("siswa"), (req, res) => {
  const { jawaban, komentar } = req.body || {};
  if (!Array.isArray(jawaban) || jawaban.length === 0) return j(res, 400, { error: "Jawaban kuesioner kosong." });
  const ids = jawaban.map((x) => Number(x && x.pertanyaanId));
  const pertanyaan = db.prepare(`SELECT * FROM pertanyaan_kuesioner WHERE pertanyaan_kuesioner_id IN (${ids.map(() => "?").join(",")})`).all(...ids);
  const kId = pertanyaan[0] && pertanyaan[0].kuesioner_id;
  if (pertanyaan.length !== new Set(ids).size || ids.length !== new Set(ids).size || pertanyaan.some((p) => p.kuesioner_id !== kId)) {
    return j(res, 400, { error: "Pertanyaan kuesioner tidak valid." });
  }
  const semua = db.prepare("SELECT COUNT(*) AS n FROM pertanyaan_kuesioner WHERE kuesioner_id = ?").get(kId).n;
  if (ids.length !== semua) return j(res, 400, { error: "Semua pernyataan wajib diisi." });
  if (jawaban.some((x) => !Number.isInteger(Number(x.skor)) || Number(x.skor) < 1 || Number(x.skor) > 5)) return j(res, 400, { error: "Skor harus 1–5." });

  const k = db.prepare("SELECT * FROM kuesioner WHERE kuesioner_id = ?").get(kId);
  const sesi = db.prepare("SELECT * FROM sesi_tes WHERE tes_id = ? AND siswa_id = ? AND status = 'selesai' ORDER BY sesites_id DESC LIMIT 1")
    .get(k.tes_id, req.user.users_id);
  if (!sesi) return j(res, 403, { error: "Kuesioner bisa diisi setelah kamu menyelesaikan tesnya." });
  if (sudahIsiKuesioner(kId, req.user.users_id)) return j(res, 409, { error: "Kamu sudah mengisi kuesioner ini. Terima kasih!" });

  const teksKomentar = String(komentar || "").trim().slice(0, 1000) || null;
  const ins = db.prepare(
    "INSERT INTO respon_kuesioner (pertanyaan_id, siswa_id, sesi_id, skor, komentar) VALUES (?,?,?,?,?)"
  );
  db.transaction(() => {
    jawaban.forEach((jw, idx) => {
      ins.run(Number(jw.pertanyaanId), req.user.users_id, sesi.sesites_id, Number(jw.skor), idx === 0 ? teksKomentar : null);
    });
  })();
  j(res, 200, { ok: true });
});

// ---------- Hasil siswa ----------
app.get("/api/siswa/hasil", peran("siswa"), (req, res) => {
  const peng = ambilPengaturan();
  const rows = db.prepare(`
    SELECT st.sesites_id, st.tes_id, t.judul AS judul_tes, m.nama_mapel, st.nilai, st.level_akhir, st.selesai
    FROM sesi_tes st
    JOIN tes t ON t.tes_id = st.tes_id
    JOIN mapel m ON m.mapel_id = t.mapel_id
    WHERE st.siswa_id = ? AND st.status = 'selesai'
    ORDER BY st.selesai DESC
  `).all(req.user.users_id);
  j(res, 200, rows.map((r) => ({ ...r, nilai: peng.tampilkan_nilai ? r.nilai : null })));
});

app.get("/api/siswa/hasil/:sesiId", peran("siswa"), (req, res) => {
  const peng = ambilPengaturan();
  const r = db.prepare(`
    SELECT st.*, t.judul AS judul_tes, t.jumlah_soal, m.nama_mapel
    FROM sesi_tes st JOIN tes t ON t.tes_id = st.tes_id JOIN mapel m ON m.mapel_id = t.mapel_id
    WHERE st.sesites_id = ? AND st.siswa_id = ?
  `).get(req.params.sesiId, req.user.users_id);
  if (!r || r.status !== "selesai") return j(res, 404, { error: "Hasil tes tidak ditemukan." });
  const rinci = ringkasan.rincianJawaban(jawabanSesi(r.sesites_id));
  const k = db.prepare("SELECT kuesioner_id FROM kuesioner WHERE tes_id = ?").get(r.tes_id);
  j(res, 200, {
    sesites_id: r.sesites_id, tes_id: r.tes_id, judul_tes: r.judul_tes, nama_mapel: r.nama_mapel,
    selesai: r.selesai, level_akhir: r.level_akhir, jumlah_soal: r.jumlah_soal, jumlahDijawab: rinci.jumlahDijawab,
    tampilkanNilai: peng.tampilkan_nilai, bobotAktif: peng.bobot_skor,
    nilai: peng.tampilkan_nilai ? r.nilai : null,
    perLevel: peng.tampilkan_nilai ? rinci.perLevel : null,
    alur: rinci.alur.map((a) => (peng.tampilkan_nilai ? a : { level: a.level })),
    kuesioner: k ? { ada: true, sudahDiisi: sudahIsiKuesioner(k.kuesioner_id, req.user.users_id) } : { ada: false },
  });
});

// Galat tak terduga: kirim JSON (bukan halaman HTML) supaya pesan bisa ditampilkan di aplikasi
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  j(res, 500, { error: "Terjadi kesalahan pada server." });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`EvalSMK (mode lokal, SQLite) berjalan di http://localhost:${PORT}`);
  });
}
module.exports = { app };
