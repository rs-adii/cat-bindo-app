// lib/catEngineLevel.js
// Mesin tes adaptif berbasis LEVEL (bukan model Rasch/IRT), mengikuti flowchart:
//   mulai di level sedang -> jawaban benar? naik level : turun level
//   -> ambil soal sesuai level, belum pernah muncul -> ulangi sampai jumlah
//   soal tercapai -> hitung nilai & level akhir.

const LEVEL_MIN = 1;
const LEVEL_MAX = 5;
const START_LEVEL = 3;

function nextLevel(currentLevel, benar) {
  if (benar) return Math.min(LEVEL_MAX, currentLevel + 1);
  return Math.max(LEVEL_MIN, currentLevel - 1);
}

// Pilih satu soal dari `pool` (daftar seluruh soal mapel terkait) yang levelnya
// sedekat mungkin dengan currentLevel dan id-nya belum ada di usedIds.
// Mengembalikan null jika seluruh pool sudah habis dipakai.
function pickByLevel(pool, usedIds, currentLevel) {
  const belumDipakai = pool.filter((s) => !usedIds.has(s.soal_id));
  if (belumDipakai.length === 0) return null;

  // Cari level yang persis sama dulu; kalau kosong, lebarkan pencarian
  // ke level tetangga (|selisih| makin besar) sampai ketemu.
  let jarak = 0;
  while (jarak <= LEVEL_MAX - LEVEL_MIN) {
    const kandidat = belumDipakai.filter(
      (s) => Math.abs(s.tingkat_kesulitan - currentLevel) === jarak
    );
    if (kandidat.length > 0) {
      return kandidat[Math.floor(Math.random() * kandidat.length)];
    }
    jarak += 1;
  }
  return null;
}

function hitungNilai(jawabanList) {
  if (jawabanList.length === 0) return 0;
  const benar = jawabanList.filter((j) => j.benar).length;
  return Math.round((benar / jawabanList.length) * 100);
}

function kategoriNilai(nilai) {
  if (nilai >= 85) return "Sangat Baik";
  if (nilai >= 70) return "Baik";
  if (nilai >= 55) return "Cukup";
  return "Perlu Bimbingan";
}

function publicSoal(s) {
  if (!s) return null;
  return {
    soal_id: s.soal_id,
    pertanyaan: s.pertanyaan,
    opsi_a: s.opsi_a,
    opsi_b: s.opsi_b,
    opsi_c: s.opsi_c,
    opsi_d: s.opsi_d,
  };
}

module.exports = {
  LEVEL_MIN,
  LEVEL_MAX,
  START_LEVEL,
  nextLevel,
  pickByLevel,
  hitungNilai,
  kategoriNilai,
  publicSoal,
};
