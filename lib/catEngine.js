// lib/catEngine.js
// Logika inti CAT (Computerized Adaptive Testing) berbasis model Rasch (IRT 1PL).
// Dipakai bersama oleh server.js (mode lokal, penyimpanan JSON) dan
// netlify/functions/*.js (mode produksi, penyimpanan Supabase/PostgreSQL),
// supaya aturan pengujian hanya ditulis satu kali di satu tempat.

const fs = require("fs");
const path = require("path");

const MIN_ITEMS = 8; // jumlah butir minimum sebelum tes boleh berhenti
const MAX_ITEMS = 15; // jumlah butir maksimum
const SE_STOP = 0.3; // tes berhenti jika standard error estimasi kemampuan <= nilai ini

let _bank = null;
let _dimensi = null;

function loadBank() {
  if (!_bank) {
    _bank = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "questionBank.json"), "utf-8"));
  }
  return _bank;
}

function loadDimensi() {
  if (!_dimensi) {
    _dimensi = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "questionnaire.json"), "utf-8"));
  }
  return _dimensi;
}

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
  const used = new Set((session.administered || []).map((a) => a.itemId));
  const candidates = loadBank().filter((it) => !used.has(it.id));
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
  if (!it) return null;
  return {
    id: it.id,
    kompetensi: it.kompetensi,
    teks: it.teks || null,
    pertanyaan: it.pertanyaan,
    opsi: it.opsi,
  };
}

module.exports = {
  MIN_ITEMS,
  MAX_ITEMS,
  SE_STOP,
  loadBank,
  loadDimensi,
  prob,
  info,
  estimateTheta,
  computeSE,
  pickNextItem,
  skorFromTheta,
  kategoriSkor,
  publicItem,
};
