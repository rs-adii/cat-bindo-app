// server.js — mode lokal (Express + SQLite)
const express = require("express");
const path = require("path");
const { db } = require("./lib/db");
const { seed } = require("./lib/seed");
const auth = require("./lib/auth");
const cat = require("./lib/catEngineLevel");
const timer = require("./lib/timer");
const soalImport = require("./lib/soalImport");

seed(); // aman dipanggil berkali-kali, otomatis dilewati kalau sudah ada data

const app = express();
app.use(express.json({ limit: "2mb" })); // impor soal bisa memuat ratusan baris
app.use(express.static(path.join(__dirname, "public")));

function j(res, status, body) {
  return res.status(status).json(body);
}

// ============================== AUTH ==============================
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return j(res, 400, { error: "Username dan password wajib diisi." });
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !auth.verifyPassword(password, user.password_hash)) {
    return j(res, 401, { error: "Username atau password salah." });
  }
  const token = auth.issueToken(user);
  j(res, 200, {
    token,
    user: { users_id: user.users_id, nama: user.nama, role: user.role, kelas_id: user.kelas_id },
  });
});

app.post("/api/auth/logout", auth.requireAuth, (req, res) => {
  const header = req.headers.authorization || "";
  auth.revokeToken(header.slice(7));
  j(res, 200, { ok: true });
});

app.get("/api/auth/me", auth.requireAuth, (req, res) => j(res, 200, req.user));

// ============================== ADMIN: Kelola Data Pengguna ==============================
app.get("/api/admin/users", auth.requireRole("admin"), (req, res) => {
  const rows = db.prepare(`
    SELECT u.users_id, u.nama, u.username, u.role, u.kelas_id, k.nama_kelas
    FROM users u LEFT JOIN kelas k ON k.kelas_id = u.kelas_id
    ORDER BY u.role, u.nama
  `).all();
  j(res, 200, rows);
});

app.post("/api/admin/users", auth.requireRole("admin"), (req, res) => {
  const { nama, username, password, role, kelas_id } = req.body || {};
  if (!nama || !username || !password || !role) return j(res, 400, { error: "Semua field wajib diisi." });
  if (!["admin", "guru", "siswa"].includes(role)) return j(res, 400, { error: "Peran tidak valid." });
  try {
    const info = db.prepare(
      "INSERT INTO users (nama, username, password_hash, role, kelas_id) VALUES (?,?,?,?,?)"
    ).run(nama, username, auth.hashPassword(password), role, kelas_id || null);
    j(res, 200, { users_id: info.lastInsertRowid });
  } catch (e) {
    j(res, 400, { error: e.message.includes("UNIQUE") ? "Username sudah dipakai." : e.message });
  }
});

app.put("/api/admin/users/:id", auth.requireRole("admin"), (req, res) => {
  const { nama, role, kelas_id, password } = req.body || {};
  const existing = db.prepare("SELECT * FROM users WHERE users_id = ?").get(req.params.id);
  if (!existing) return j(res, 404, { error: "Pengguna tidak ditemukan." });
  db.prepare("UPDATE users SET nama=?, role=?, kelas_id=? WHERE users_id=?").run(
    nama || existing.nama, role || existing.role, kelas_id ?? existing.kelas_id, req.params.id
  );
  if (password) {
    db.prepare("UPDATE users SET password_hash=? WHERE users_id=?").run(auth.hashPassword(password), req.params.id);
  }
  j(res, 200, { ok: true });
});

app.delete("/api/admin/users/:id", auth.requireRole("admin"), (req, res) => {
  db.prepare("DELETE FROM users WHERE users_id = ?").run(req.params.id);
  j(res, 200, { ok: true });
});

// ============================== ADMIN: Kelola Kelas & Mapel ==============================
app.get("/api/admin/kelas", auth.requireRole("admin", "guru"), (req, res) => {
  j(res, 200, db.prepare("SELECT * FROM kelas ORDER BY nama_kelas").all());
});
app.post("/api/admin/kelas", auth.requireRole("admin"), (req, res) => {
  const { nama_kelas, jurusan } = req.body || {};
  if (!nama_kelas) return j(res, 400, { error: "Nama kelas wajib diisi." });
  const info = db.prepare("INSERT INTO kelas (nama_kelas, jurusan) VALUES (?,?)").run(nama_kelas, jurusan || null);
  j(res, 200, { kelas_id: info.lastInsertRowid });
});
app.put("/api/admin/kelas/:id", auth.requireRole("admin"), (req, res) => {
  const { nama_kelas, jurusan } = req.body || {};
  db.prepare("UPDATE kelas SET nama_kelas=?, jurusan=? WHERE kelas_id=?").run(nama_kelas, jurusan || null, req.params.id);
  j(res, 200, { ok: true });
});
app.delete("/api/admin/kelas/:id", auth.requireRole("admin"), (req, res) => {
  db.prepare("DELETE FROM kelas WHERE kelas_id = ?").run(req.params.id);
  j(res, 200, { ok: true });
});

app.get("/api/admin/mapel", auth.requireRole("admin", "guru"), (req, res) => {
  j(res, 200, db.prepare("SELECT * FROM mapel ORDER BY nama_mapel").all());
});
app.post("/api/admin/mapel", auth.requireRole("admin"), (req, res) => {
  const { nama_mapel } = req.body || {};
  if (!nama_mapel) return j(res, 400, { error: "Nama mapel wajib diisi." });
  try {
    const info = db.prepare("INSERT INTO mapel (nama_mapel) VALUES (?)").run(nama_mapel);
    j(res, 200, { mapel_id: info.lastInsertRowid });
  } catch (e) {
    j(res, 400, { error: e.message.includes("UNIQUE") ? "Mapel sudah ada." : e.message });
  }
});
app.delete("/api/admin/mapel/:id", auth.requireRole("admin"), (req, res) => {
  db.prepare("DELETE FROM mapel WHERE mapel_id = ?").run(req.params.id);
  j(res, 200, { ok: true });
});

// ============================== GURU: Kelola Bank Soal ==============================
const PESAN_BUKAN_PEMILIK = "Soal ini dibuat guru lain. Kamu hanya bisa mengubah atau menghapus soal milikmu sendiri.";

app.get("/api/guru/soal", auth.requireRole("guru", "admin"), (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, m.nama_mapel, u.nama AS nama_guru
    FROM soal s
    JOIN mapel m ON m.mapel_id = s.mapel_id
    LEFT JOIN users u ON u.users_id = s.guru_id
    ORDER BY s.mapel_id, s.tingkat_kesulitan
  `).all();
  j(res, 200, rows);
});
app.post("/api/guru/soal", auth.requireRole("guru"), (req, res) => {
  const { mapel_id, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, kunci, tingkat_kesulitan } = req.body || {};
  if (!mapel_id || !pertanyaan || !opsi_a || !opsi_b || !opsi_c || !opsi_d || !kunci || !tingkat_kesulitan) {
    return j(res, 400, { error: "Semua field soal wajib diisi." });
  }
  const info = db.prepare(`
    INSERT INTO soal (mapel_id, guru_id, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, kunci, tingkat_kesulitan)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(mapel_id, req.user.users_id, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, kunci, tingkat_kesulitan);
  j(res, 200, { soal_id: info.lastInsertRowid });
});

// Impor massal dari Excel/CSV. Peramban membaca file jadi daftar objek;
// validasi ada di lib/soalImport.js. dryRun=true hanya memeriksa (pratinjau).
app.post("/api/guru/soal/impor", auth.requireRole("guru"), (req, res) => {
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
      INSERT INTO soal (mapel_id, guru_id, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, kunci, tingkat_kesulitan)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    db.transaction(() => {
      for (const { soal: x } of hasil.valid) {
        ins.run(x.mapel_id, req.user.users_id, x.pertanyaan, x.opsi_a, x.opsi_b, x.opsi_c, x.opsi_d, x.kunci, x.tingkat_kesulitan);
      }
    })();
    jumlahDiimpor = hasil.valid.length;
  }
  j(res, 200, {
    dryRun: !!dryRun, totalBaris: hasil.total, jumlahValid: hasil.valid.length,
    jumlahDiimpor, galat: hasil.galat, ringkas: hasil.ringkas,
  });
});

app.put("/api/guru/soal/:id", auth.requireRole("guru"), (req, res) => {
  const f = req.body || {};
  const existing = db.prepare("SELECT * FROM soal WHERE soal_id=?").get(req.params.id);
  if (!existing) return j(res, 404, { error: "Soal tidak ditemukan." });
  if (existing.guru_id !== req.user.users_id) return j(res, 403, { error: PESAN_BUKAN_PEMILIK });
  db.prepare(`
    UPDATE soal SET pertanyaan=?, opsi_a=?, opsi_b=?, opsi_c=?, opsi_d=?, kunci=?, tingkat_kesulitan=?
    WHERE soal_id=?
  `).run(
    f.pertanyaan ?? existing.pertanyaan, f.opsi_a ?? existing.opsi_a, f.opsi_b ?? existing.opsi_b,
    f.opsi_c ?? existing.opsi_c, f.opsi_d ?? existing.opsi_d, f.kunci ?? existing.kunci,
    f.tingkat_kesulitan ?? existing.tingkat_kesulitan, req.params.id
  );
  j(res, 200, { ok: true });
});
app.delete("/api/guru/soal/:id", auth.requireRole("guru"), (req, res) => {
  const existing = db.prepare("SELECT * FROM soal WHERE soal_id=?").get(req.params.id);
  if (!existing) return j(res, 404, { error: "Soal tidak ditemukan." });
  if (existing.guru_id !== req.user.users_id) return j(res, 403, { error: PESAN_BUKAN_PEMILIK });
  try {
    db.prepare("DELETE FROM soal WHERE soal_id = ?").run(req.params.id);
  } catch (e) {
    if (String(e.message).includes("FOREIGN KEY")) {
      return j(res, 409, { error: "Soal ini sudah pernah dipakai dalam tes siswa, jadi tidak bisa dihapus." });
    }
    throw e;
  }
  j(res, 200, { ok: true });
});

// ============================== GURU: Atur Jadwal Tes ==============================
app.get("/api/guru/tes", auth.requireRole("guru", "admin"), (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, m.nama_mapel, k.nama_kelas FROM tes t
    JOIN mapel m ON m.mapel_id = t.mapel_id
    LEFT JOIN kelas k ON k.kelas_id = t.kelas_id
    ORDER BY t.tanggal DESC
  `).all();
  j(res, 200, rows);
});
app.post("/api/guru/tes", auth.requireRole("guru"), (req, res) => {
  const { mapel_id, kelas_id, judul, jumlah_soal, durasi_menit, tanggal } = req.body || {};
  if (!mapel_id || !judul || !jumlah_soal || !durasi_menit || !tanggal) {
    return j(res, 400, { error: "Semua field tes wajib diisi." });
  }
  const info = db.prepare(`
    INSERT INTO tes (mapel_id, kelas_id, judul, jumlah_soal, durasi_menit, tanggal) VALUES (?,?,?,?,?,?)
  `).run(mapel_id, kelas_id || null, judul, jumlah_soal, durasi_menit, tanggal);
  j(res, 200, { tes_id: info.lastInsertRowid });
});
app.delete("/api/guru/tes/:id", auth.requireRole("guru"), (req, res) => {
  db.prepare("DELETE FROM tes WHERE tes_id = ?").run(req.params.id);
  j(res, 200, { ok: true });
});

// ============================== GURU: Kelola Kuesioner ==============================
app.get("/api/guru/kuesioner/:tesId", auth.requireRole("guru", "admin"), (req, res) => {
  const kuesioner = db.prepare("SELECT * FROM kuesioner WHERE tes_id = ?").get(req.params.tesId);
  if (!kuesioner) return j(res, 200, null);
  const pertanyaan = db.prepare("SELECT * FROM pertanyaan_kuesioner WHERE kuesioner_id = ?").all(kuesioner.kuesioner_id);
  j(res, 200, { ...kuesioner, pertanyaan });
});
app.post("/api/guru/kuesioner", auth.requireRole("guru"), (req, res) => {
  const { tes_id, judul, pertanyaan } = req.body || {};
  if (!tes_id || !judul || !Array.isArray(pertanyaan) || pertanyaan.length === 0) {
    return j(res, 400, { error: "Judul dan minimal satu pertanyaan wajib diisi." });
  }
  const trx = db.transaction(() => {
    const kId = db.prepare("INSERT INTO kuesioner (tes_id, judul) VALUES (?,?)").run(tes_id, judul).lastInsertRowid;
    const ins = db.prepare("INSERT INTO pertanyaan_kuesioner (kuesioner_id, soal) VALUES (?,?)");
    for (const p of pertanyaan) ins.run(kId, p);
    return kId;
  });
  const kuesionerId = trx();
  j(res, 200, { kuesioner_id: kuesionerId });
});

// ============================== GURU: Lihat hasil & rekap feedback ==============================
app.get("/api/guru/hasil", auth.requireRole("guru", "admin"), (req, res) => {
  sapuSesiKadaluarsa(); // sesi yang waktunya habis tapi siswanya tidak kembali ikut diselesaikan
  const rows = db.prepare(`
    SELECT st.sesites_id, u.nama, k.nama_kelas, t.judul AS judul_tes, st.nilai, st.level_akhir, st.status, st.mulai, st.selesai,
           (SELECT COUNT(*) FROM jawaban WHERE sesi_id = st.sesites_id) AS jumlah_soal_dijawab
    FROM sesi_tes st
    JOIN users u ON u.users_id = st.siswa_id
    JOIN tes t ON t.tes_id = st.tes_id
    LEFT JOIN kelas k ON k.kelas_id = u.kelas_id
    WHERE st.status = 'selesai'
    ORDER BY st.selesai DESC
  `).all();
  j(res, 200, rows);
});

app.get("/api/guru/feedback-summary/:tesId", auth.requireRole("guru", "admin"), (req, res) => {
  const kuesioner = db.prepare("SELECT * FROM kuesioner WHERE tes_id = ?").get(req.params.tesId);
  if (!kuesioner) return j(res, 200, { jumlahResponden: 0, rataRata: [], komentar: [] });
  const pertanyaanList = db.prepare("SELECT * FROM pertanyaan_kuesioner WHERE kuesioner_id = ?").all(kuesioner.kuesioner_id);

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
    SELECT DISTINCT rk.sesi_id, u.nama, k.nama_kelas, rk.komentar
    FROM respon_kuesioner rk
    JOIN pertanyaan_kuesioner pk ON pk.pertanyaan_kuesioner_id = rk.pertanyaan_id
    JOIN users u ON u.users_id = rk.siswa_id
    LEFT JOIN kelas k ON k.kelas_id = u.kelas_id
    WHERE pk.kuesioner_id = ? AND rk.komentar IS NOT NULL AND rk.komentar != ''
  `).all(kuesioner.kuesioner_id);

  const jumlahResponden = db.prepare(`
    SELECT COUNT(DISTINCT rk.sesi_id) AS n FROM respon_kuesioner rk
    JOIN pertanyaan_kuesioner pk ON pk.pertanyaan_kuesioner_id = rk.pertanyaan_id
    WHERE pk.kuesioner_id = ?
  `).get(kuesioner.kuesioner_id).n;

  j(res, 200, { jumlahResponden, rataRata, komentar: komentarRows });
});

// ============================== SISWA ==============================
function jawabanSesi(sesiId) {
  return db.prepare("SELECT * FROM jawaban WHERE sesi_id = ? ORDER BY urutan").all(sesiId);
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
// Menutup sesi. karenaWaktu=true: soal yang belum sempat dijawab dihitung salah
// (penyebut = jumlah soal tes) dan waktu selesai dicatat sebagai tenggatnya.
function finalisasiSesi(sesi, tes, { karenaWaktu }) {
  const js = jawabanSesi(sesi.sesites_id);
  const levelAkhir = levelDariJawaban(js);
  const pembagi = karenaWaktu ? tes.jumlah_soal : js.length;
  const nilai = cat.hitungNilai(js.map((r) => ({ benar: r.benar })), pembagi);
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

app.get("/api/siswa/tes-tersedia", auth.requireRole("siswa"), (req, res) => {
  sapuSesiKadaluarsa();
  const rows = db.prepare(`
    SELECT t.tes_id, t.judul, t.jumlah_soal, t.durasi_menit, t.tanggal, m.nama_mapel,
           (SELECT status FROM sesi_tes WHERE tes_id = t.tes_id AND siswa_id = ? ORDER BY sesites_id DESC LIMIT 1) AS status_saya,
           (SELECT nilai FROM sesi_tes WHERE tes_id = t.tes_id AND siswa_id = ? ORDER BY sesites_id DESC LIMIT 1) AS nilai_saya
    FROM tes t JOIN mapel m ON m.mapel_id = t.mapel_id
    WHERE t.kelas_id IS NULL OR t.kelas_id = ?
    ORDER BY t.tanggal DESC
  `).all(req.user.users_id, req.user.users_id, req.user.kelas_id);
  j(res, 200, rows);
});

app.post("/api/siswa/tes/:tesId/mulai", auth.requireRole("siswa"), (req, res) => {
  const tes = db.prepare("SELECT * FROM tes WHERE tes_id = ?").get(req.params.tesId);
  if (!tes) return j(res, 404, { error: "Tes tidak ditemukan." });

  let sesi = db.prepare(
    "SELECT * FROM sesi_tes WHERE tes_id = ? AND siswa_id = ? AND status = 'ongoing'"
  ).get(tes.tes_id, req.user.users_id);

  if (sesi) {
    // Melanjutkan sesi lama: kalau waktunya sudah habis, tutup dan tampilkan hasil.
    if (timer.sisaDetik(sesi.mulai, tes.durasi_menit) <= 0) {
      return j(res, 200, { selesai: true, hasil: finalisasiSesi(sesi, tes, { karenaWaktu: true }) });
    }
  } else {
    const sudahSelesai = db.prepare(
      "SELECT 1 FROM sesi_tes WHERE tes_id = ? AND siswa_id = ? AND status = 'selesai'"
    ).get(tes.tes_id, req.user.users_id);
    if (sudahSelesai) return j(res, 400, { error: "Tes ini sudah pernah kamu selesaikan." });

    const info = db.prepare("INSERT INTO sesi_tes (tes_id, siswa_id, status) VALUES (?,?, 'ongoing')")
      .run(tes.tes_id, req.user.users_id);
    sesi = db.prepare("SELECT * FROM sesi_tes WHERE sesites_id = ?").get(info.lastInsertRowid);
  }

  const pool = db.prepare("SELECT * FROM soal WHERE mapel_id = ?").all(tes.mapel_id);
  const js = jawabanSesi(sesi.sesites_id);
  if (js.length >= tes.jumlah_soal) {
    return j(res, 200, { selesai: true, hasil: finalisasiSesi(sesi, tes, { karenaWaktu: false }) });
  }

  const soalBerikut = cat.pickByLevel(pool, new Set(js.map((r) => r.soal_id)), levelDariJawaban(js));
  if (!soalBerikut) return j(res, 400, { error: "Bank soal untuk mapel ini belum cukup." });

  j(res, 200, {
    sesiId: sesi.sesites_id,
    soal: cat.publicSoal(soalBerikut),
    progress: { jumlah: js.length, total: tes.jumlah_soal },
    sisaDetik: timer.sisaDetik(sesi.mulai, tes.durasi_menit),
    durasiMenit: tes.durasi_menit,
  });
});

app.post("/api/siswa/sesi/:sesiId/jawab", auth.requireRole("siswa"), (req, res) => {
  const sesi = db.prepare("SELECT * FROM sesi_tes WHERE sesites_id = ?").get(req.params.sesiId);
  if (!sesi || sesi.siswa_id !== req.user.users_id) return j(res, 404, { error: "Sesi tidak ditemukan." });
  if (sesi.status !== "ongoing") return j(res, 400, { error: "Sesi ini sudah selesai." });

  const tes = db.prepare("SELECT * FROM tes WHERE tes_id = ?").get(sesi.tes_id);

  // Waktu habis: jawaban ini tidak dihitung; sesi ditutup dan hasilnya dikembalikan.
  if (timer.sisaDetik(sesi.mulai, tes.durasi_menit) < -timer.GRACE_DETIK) {
    return j(res, 200, { selesai: true, hasil: finalisasiSesi(sesi, tes, { karenaWaktu: true }) });
  }

  const { soalId, jawabanHuruf } = req.body || {};
  const soal = db.prepare("SELECT * FROM soal WHERE soal_id = ?").get(soalId);
  if (!soal) return j(res, 400, { error: "Soal tidak ditemukan." });

  const jsSebelum = jawabanSesi(sesi.sesites_id);
  if (jsSebelum.some((r) => r.soal_id === soal.soal_id)) {
    return j(res, 400, { error: "Soal ini sudah dijawab pada sesi ini." });
  }

  const urutan = jsSebelum.length + 1;
  const levelSaatIni = levelDariJawaban(jsSebelum);
  const benar = jawabanHuruf === soal.kunci;
  db.prepare(`
    INSERT INTO jawaban (sesi_id, soal_id, jawaban, benar, level_saat_itu, urutan) VALUES (?,?,?,?,?,?)
  `).run(sesi.sesites_id, soal.soal_id, jawabanHuruf, benar ? 1 : 0, levelSaatIni, urutan);

  if (urutan >= tes.jumlah_soal) {
    return j(res, 200, { selesai: true, hasil: finalisasiSesi(sesi, tes, { karenaWaktu: false }) });
  }

  const pool = db.prepare("SELECT * FROM soal WHERE mapel_id = ?").all(tes.mapel_id);
  const usedIds = new Set([...jsSebelum.map((r) => r.soal_id), soal.soal_id]);
  const soalBerikut = cat.pickByLevel(pool, usedIds, cat.nextLevel(levelSaatIni, benar));
  if (!soalBerikut) {
    return j(res, 200, {
      selesai: true, hasil: finalisasiSesi(sesi, tes, { karenaWaktu: false }),
      catatan: "Bank soal habis sebelum jumlah target tercapai.",
    });
  }

  j(res, 200, {
    selesai: false,
    soal: cat.publicSoal(soalBerikut),
    progress: { jumlah: urutan, total: tes.jumlah_soal },
    sisaDetik: timer.sisaDetik(sesi.mulai, tes.durasi_menit),
  });
});

// Dipanggil peramban saat hitung mundur mencapai nol. Server yang memutuskan:
// kalau waktu memang sudah habis, sesi ditutup; kalau belum (jam perangkat
// tidak sinkron), kembalikan sisa waktu yang benar.
app.post("/api/siswa/sesi/:sesiId/selesai", auth.requireRole("siswa"), (req, res) => {
  const sesi = db.prepare("SELECT * FROM sesi_tes WHERE sesites_id = ?").get(req.params.sesiId);
  if (!sesi || sesi.siswa_id !== req.user.users_id) return j(res, 404, { error: "Sesi tidak ditemukan." });
  const tes = db.prepare("SELECT * FROM tes WHERE tes_id = ?").get(sesi.tes_id);

  if (sesi.status === "selesai") return j(res, 200, { selesai: true, hasil: hasilDariSesiSelesai(sesi, tes) });

  const sisa = timer.sisaDetik(sesi.mulai, tes.durasi_menit);
  if (sisa > 0) return j(res, 200, { selesai: false, sisaDetik: sisa });
  j(res, 200, { selesai: true, hasil: finalisasiSesi(sesi, tes, { karenaWaktu: true }) });
});

app.get("/api/siswa/kuesioner/:tesId", auth.requireRole("siswa"), (req, res) => {
  const kuesioner = db.prepare("SELECT * FROM kuesioner WHERE tes_id = ?").get(req.params.tesId);
  if (!kuesioner) return j(res, 200, null);
  const pertanyaan = db.prepare("SELECT * FROM pertanyaan_kuesioner WHERE kuesioner_id = ?").all(kuesioner.kuesioner_id);
  j(res, 200, { kuesioner_id: kuesioner.kuesioner_id, judul: kuesioner.judul, pertanyaan });
});

app.post("/api/siswa/kuesioner/submit", auth.requireRole("siswa"), (req, res) => {
  const { sesiId, jawaban, komentar } = req.body || {};
  if (!Array.isArray(jawaban) || jawaban.length === 0) return j(res, 400, { error: "Jawaban kuesioner kosong." });
  const ins = db.prepare(
    "INSERT INTO respon_kuesioner (pertanyaan_id, siswa_id, sesi_id, skor, komentar) VALUES (?,?,?,?,?)"
  );
  const trx = db.transaction(() => {
    jawaban.forEach((jw, idx) => {
      ins.run(jw.pertanyaanId, req.user.users_id, sesiId || null, jw.skor, idx === 0 ? (komentar || null) : null);
    });
  });
  trx();
  j(res, 200, { ok: true });
});

app.get("/api/siswa/hasil", auth.requireRole("siswa"), (req, res) => {
  const rows = db.prepare(`
    SELECT st.sesites_id, t.judul AS judul_tes, m.nama_mapel, st.nilai, st.level_akhir, st.selesai
    FROM sesi_tes st
    JOIN tes t ON t.tes_id = st.tes_id
    JOIN mapel m ON m.mapel_id = t.mapel_id
    WHERE st.siswa_id = ? AND st.status = 'selesai'
    ORDER BY st.selesai DESC
  `).all(req.user.users_id);
  j(res, 200, rows);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SIEP SMK (mode lokal, SQLite) berjalan di http://localhost:${PORT}`);
});
