// server.js — mode LOKAL untuk pengembangan/demo cepat tanpa Supabase.
// Memakai penyimpanan file JSON (data/db.json) dan mesin CAT dari lib/catEngine.js —
// mesin dan aturan penilaiannya identik dengan versi produksi di netlify/functions/,
// supaya kedua mode tidak pernah berbeda hasil.
//
// Untuk deploy publik yang datanya tahan lama, pakai Netlify + Supabase
// (lihat README.md bagian "Deploy ke Netlify + Supabase").

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const {
  estimateTheta,
  computeSE,
  pickNextItem,
  skorFromTheta,
  kategoriSkor,
  publicItem,
  loadBank,
  loadDimensi,
  MIN_ITEMS,
  MAX_ITEMS,
  SE_STOP,
} = require("./lib/catEngine");

const DB_PATH = path.join(__dirname, "data", "db.json");

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { sessions: {}, feedbacks: [], itemUsage: {} };
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch (e) {
    console.error("Gagal membaca db.json, memulai basis data kosong:", e.message);
    return { sessions: {}, feedbacks: [], itemUsage: {} };
  }
}
function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
let db = loadDB();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/session/start", (req, res) => {
  const { nama, kelas } = req.body || {};
  if (!nama || !nama.trim()) return res.status(400).json({ error: "Nama wajib diisi." });

  const id = crypto.randomUUID();
  const session = {
    id,
    nama: nama.trim(),
    kelas: (kelas || "").trim(),
    theta: 0,
    se: 99,
    administered: [],
    status: "ongoing",
    mulai: new Date().toISOString(),
    selesai: null,
    skor: null,
  };
  const firstItem = pickNextItem(session);
  db.sessions[id] = session;
  saveDB();
  res.json({ sessionId: id, item: publicItem(firstItem), progress: { jumlah: 0, min: MIN_ITEMS, max: MAX_ITEMS } });
});

// Catatan: endpoint ini sengaja menerima sessionId lewat body (bukan path
// param /:id) agar strukturnya identik dengan netlify/functions/session-answer.js.
app.post("/api/session/answer", (req, res) => {
  const { sessionId, itemId, jawaban } = req.body || {};
  const session = db.sessions[sessionId];
  if (!session || session.status !== "ongoing") {
    return res.status(404).json({ error: "Sesi tidak ditemukan atau sudah selesai." });
  }
  const item = loadBank().find((it) => it.id === itemId);
  if (!item) return res.status(400).json({ error: "Soal tidak ditemukan." });
  if (session.administered.some((a) => a.itemId === itemId)) {
    return res.status(400).json({ error: "Soal ini sudah dijawab pada sesi ini." });
  }

  const benar = jawaban === item.kunci;
  session.administered.push({ itemId: item.id, b: item.b, x: benar ? 1 : 0, kompetensi: item.kompetensi });
  db.itemUsage[item.id] = (db.itemUsage[item.id] || 0) + 1;

  session.theta = estimateTheta(session.administered, session.theta);
  session.se = computeSE(session.administered, session.theta);

  const jumlah = session.administered.length;
  const selesai = jumlah >= MAX_ITEMS || (jumlah >= MIN_ITEMS && session.se <= SE_STOP);

  if (selesai) {
    session.status = "selesai";
    session.selesai = new Date().toISOString();
    session.skor = skorFromTheta(session.theta);
    saveDB();
    return res.json({
      selesai: true,
      hasil: {
        sessionId: session.id,
        skor: session.skor,
        kategori: kategoriSkor(session.skor),
        theta: Number(session.theta.toFixed(2)),
        se: Number(session.se.toFixed(2)),
        jumlahButir: jumlah,
      },
    });
  }

  const nextItem = pickNextItem(session);
  saveDB();
  res.json({ selesai: false, item: publicItem(nextItem), progress: { jumlah, min: MIN_ITEMS, max: MAX_ITEMS } });
});

app.get("/api/meta/dimensi", (req, res) => res.json(loadDimensi()));

app.post("/api/feedback", (req, res) => {
  const { sessionId, jawaban, komentar } = req.body || {};
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan." });
  db.feedbacks.push({
    sessionId,
    nama: session.nama,
    kelas: session.kelas,
    jawaban: jawaban || {},
    komentar: (komentar || "").trim(),
    waktu: new Date().toISOString(),
  });
  saveDB();
  res.json({ ok: true });
});

app.get("/api/teacher/sessions", (req, res) => {
  const list = Object.values(db.sessions)
    .filter((s) => s.status === "selesai")
    .map((s) => ({
      id: s.id,
      nama: s.nama,
      kelas: s.kelas,
      skor: s.skor,
      kategori: kategoriSkor(s.skor),
      theta: Number(s.theta.toFixed(2)),
      se: Number(s.se.toFixed(2)),
      jumlahButir: s.administered.length,
      mulai: s.mulai,
      selesai: s.selesai,
    }))
    .sort((a, b) => new Date(b.selesai) - new Date(a.selesai));
  res.json(list);
});

app.get("/api/teacher/feedback-summary", (req, res) => {
  const dims = loadDimensi();
  const totals = {};
  const counts = {};
  dims.forEach((d) => {
    totals[d.id] = 0;
    counts[d.id] = 0;
  });
  const komentar = [];
  for (const fb of db.feedbacks) {
    for (const d of dims) {
      const v = fb.jawaban ? fb.jawaban[d.id] : null;
      if (typeof v === "number") {
        totals[d.id] += v;
        counts[d.id] += 1;
      }
    }
    if (fb.komentar) komentar.push({ nama: fb.nama, kelas: fb.kelas, teks: fb.komentar, waktu: fb.waktu });
  }
  const rataRata = dims.map((d) => ({
    id: d.id,
    dimensi: d.label,
    rata: counts[d.id] ? Number((totals[d.id] / counts[d.id]).toFixed(2)) : null,
    n: counts[d.id],
  }));
  res.json({ jumlahResponden: db.feedbacks.length, rataRata, komentar: komentar.slice(-20).reverse() });
});

app.get("/api/teacher/item-stats", (req, res) => {
  const stats = loadBank()
    .map((it) => {
      const dipakai = db.itemUsage[it.id] || 0;
      let benar = 0;
      let total = 0;
      for (const s of Object.values(db.sessions)) {
        const a = s.administered.find((x) => x.itemId === it.id);
        if (a) {
          total += 1;
          benar += a.x;
        }
      }
      return {
        id: it.id,
        kompetensi: it.kompetensi,
        kesulitan: it.b,
        dipakai,
        proporsiBenar: total ? Number((benar / total).toFixed(2)) : null,
      };
    })
    .sort((a, b) => a.kesulitan - b.kesulitan);
  res.json(stats);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server SIEP Bahasa Indonesia (mode lokal) berjalan di http://localhost:${PORT}`);
});
