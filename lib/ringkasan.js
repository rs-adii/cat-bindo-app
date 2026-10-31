// lib/ringkasan.js — perhitungan bersama mode lokal & Netlify untuk halaman hasil.
const cat = require("./catEngineLevel");

// jawabanList: baris tabel jawaban urut `urutan`, dengan level_soal (tingkat soal yang dijawab)
function rincianJawaban(jawabanList) {
  const perLevel = { 1: { benar: 0, total: 0 }, 2: { benar: 0, total: 0 }, 3: { benar: 0, total: 0 } };
  const alur = jawabanList.map((j) => {
    const level = Number(j.level_soal || j.level_saat_itu);
    const benar = !!Number(j.benar);
    if (perLevel[level]) { perLevel[level].total += 1; if (benar) perLevel[level].benar += 1; }
    return { level, benar };
  });
  return { perLevel, alur, jumlahDijawab: jawabanList.length };
}

// Siswa tidak boleh melihat nilai kalau pengaturan "Tampilkan nilai langsung" mati.
function saringHasilSiswa(hasil, peng) {
  if (!hasil || peng.tampilkan_nilai) return hasil;
  return { ...hasil, nilai: null, kategori: null, nilaiDisembunyikan: true };
}

function opsiNilai(peng) {
  return { berbobot: !!peng.bobot_skor };
}

module.exports = { rincianJawaban, saringHasilSiswa, opsiNilai, NAMA_LEVEL: cat.NAMA_LEVEL };
