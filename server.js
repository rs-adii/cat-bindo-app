// server.js
// Backend sistem evaluasi pembelajaran adaptif (CAT) mata pelajaran Bahasa Indonesia
// Arsitektur: Express (API) + penyimpanan JSON lokal (pengganti sementara PostgreSQL
// pada proposal, mudah diganti dengan modul database nyata tanpa mengubah rute di bawah).

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const BANK = require("./data/questionBank.json");
const DIMENSI = require("./data/questionnaire.json");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

// ---------- Penyimpanan sederhana (JSON file sebagai "database") ----------
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    return { sessions: {}, feedbacks: [], itemUsage: {} };
  }
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

// ---------- Mesin CAT: model Rasch (IRT 1PL) ----------
const MIN_ITEMS = 8; // jumlah butir minimum sebelum tes boleh berhenti
const MAX_ITEMS = 15; // jumlah butir maksimum
const SE_STOP = 0.3; // tes berhenti jika standard error estimasi kemampuan <= nilai ini

function prob(theta, b) {
  return 1 / (1 + Math.exp(-(theta - b)));
}
function info(theta, b) {
  const p = prob(theta, b);
  return p * (1 - p);
}

// Estimasi kemampuan (theta) dengan Newton-Raphson (maximum likelihood)
function estimateTheta(responses, prevTheta) {
  let theta = prevTheta;
  for (let iter = 0; iter < 15; iter++) {
    let num = 0;
    let den = 0;
    for (const r of responses) {
      const p = prob(theta, r.b);
      num += r.x - p;
      den += p * (1 - p);
    }
    if (den < 1e-6) break;
    const step = num / den;
    theta += step;
    if (Math.abs(step) < 1e-4) break;
  }
  // Batasi rentang theta agar tidak divergen pada pola jawaban ekstrem
  return Math.max(-4, Math.min(4, theta));
}

function computeSE(responses, theta) {
  let sumInfo = 0;
  for (const r of responses) sumInfo += info(theta, r.b);
  if (sumInfo < 1e-6) return 99;
  return 1 / Math.sqrt(sumInfo);
}

// Pilih butir berikutnya: informasi maksimum pada theta saat ini,
// dengan sedikit keacakan di antara 3 kandidat teratas (kontrol keterpaparan butir).
function pickNextItem(session) {
  const used = new Set(session.administered.map((a) => a.itemId));
  const candidates = BANK.filter((it) => !used.has(it.id));
  if (candidates.length === 0) return null;
  const scored = candidates
    .map((it) => ({ it, inf: info(session.theta, it.b) }))
    .sort((a, b) => b.inf - a.inf);
  const top = scored.slice(0, Math.min(3, scored.length));
  return top[Math.floor(Math.random() * top.length)].it;
}

function skorFromTheta(theta) {
  return Math.max(0, Math.min(100, Math.round(((theta + 4) / 8) * 100)));
}
function kategoriSkor(skor) {
  if (skor >= 85) return "Sangat Baik";
  if (skor >= 70) return "Baik";
  if (skor >= 55) return "Cukup";
  return "Perlu Bimbingan";
}

// Jangan pernah mengirim kunci jawaban / parameter b ke klien saat tes berlangsung
function publicItem(it) {
  return {
    id: it.id,
    kompetensi: it.kompetensi,
    teks: it.teks || null,
    pertanyaan: it.pertanyaan,
    opsi: it.opsi,
  };
}

// ---------- API ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Mulai sesi tes adaptif baru
app.post("/api/session/start", (req, res) => {
  const { nama, kelas } = req.body || {};
  if (!nama || !nama.trim()) {
    return res.status(400).json({ error: "Nama wajib diisi." });
  }
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
  res.json({
    sessionId: id,
    item: publicItem(firstItem),
    progress: { jumlah: 0, min: MIN_ITEMS, max: MAX_ITEMS },
  });
});

// Kirim jawaban satu butir, terima butir berikutnya atau hasil akhir
app.post("/api/session/:id/answer", (req, res) => {
  const session = db.sessions[req.params.id];
  if (!session || session.status !== "ongoing") {
    return res.status(404).json({ error: "Sesi tidak ditemukan atau sudah selesai." });
  }
  const { itemId, jawaban } = req.body || {};
  const item = BANK.find((it) => it.id === itemId);
  if (!item) return res.status(400).json({ error: "Soal tidak ditemukan." });
  if (session.administered.some((a) => a.itemId === itemId)) {
    return res.status(400).json({ error: "Soal ini sudah dijawab pada sesi ini." });
  }

  const benar = jawaban === item.kunci;
  session.administered.push({
    itemId: item.id,
    b: item.b,
    x: benar ? 1 : 0,
    kompetensi: item.kompetensi,
  });
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
  res.json({
    selesai: false,
    item: publicItem(nextItem),
    progress: { jumlah, min: MIN_ITEMS, max: MAX_ITEMS },
  });
});

// Daftar pernyataan kuesioner (untuk ditampilkan di frontend)
app.get("/api/meta/dimensi", (req, res) => res.json(DIMENSI));

// Simpan hasil kuesioner feedback siswa
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

// ---------- Dasbor guru ----------
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
  const totals = {};
  const counts = {};
  DIMENSI.forEach((d) => {
    totals[d.id] = 0;
    counts[d.id] = 0;
  });
  const komentar = [];
  for (const fb of db.feedbacks) {
    for (const d of DIMENSI) {
      const v = fb.jawaban ? fb.jawaban[d.id] : null;
      if (typeof v === "number") {
        totals[d.id] += v;
        counts[d.id] += 1;
      }
    }
    if (fb.komentar) {
      komentar.push({ nama: fb.nama, kelas: fb.kelas, teks: fb.komentar, waktu: fb.waktu });
    }
  }
  const rataRata = DIMENSI.map((d) => ({
    id: d.id,
    dimensi: d.label,
    rata: counts[d.id] ? Number((totals[d.id] / counts[d.id]).toFixed(2)) : null,
    n: counts[d.id],
  }));
  res.json({
    jumlahResponden: db.feedbacks.length,
    rataRata,
    komentar: komentar.slice(-20).reverse(),
  });
});

app.get("/api/teacher/item-stats", (req, res) => {
  const stats = BANK.map((it) => {
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
  }).sort((a, b) => a.kesulitan - b.kesulitan);
  res.json(stats);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server SIEP Bahasa Indonesia berjalan di http://localhost:${PORT}`);
});
