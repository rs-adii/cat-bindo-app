// lib/catEngineLevel.js
// Mesin tes adaptif berbasis LEVEL (bukan model Rasch/IRT), sesuai proposal & flowchart:
//   tiga tingkat kesulitan (mudah, sedang, sulit) -> mulai di level sedang ->
//   jawaban benar naik level, salah turun level -> ambil soal sesuai level yang
//   belum pernah muncul -> ulangi sampai jumlah soal / batas waktu tercapai ->
//   hitung nilai (berbobot level) & level akhir.

const LEVEL_MIN = 1;
const LEVEL_MAX = 3;
const START_LEVEL = 2; // sedang

const NAMA_LEVEL = { 1: "Mudah", 2: "Sedang", 3: "Sulit" };
// Soal sulit bernilai lebih tinggi (proposal 2.3 poin 4)
const BOBOT_LEVEL = { 1: 1, 2: 2, 3: 3 };

function namaLevel(level) {
  return NAMA_LEVEL[level] || String(level);
}
function bobotLevel(level) {
  return BOBOT_LEVEL[level] || 1;
}

// Terima 1/2/3 atau kata mudah/sedang/sulit (huruf besar-kecil diabaikan).
// Mengembalikan level (1-3) atau null kalau tidak valid.
function parseLevel(v) {
  const t = String(v === null || v === undefined ? "" : v).trim().toLowerCase();
  if (t === "mudah") return 1;
  if (t === "sedang") return 2;
  if (t === "sulit") return 3;
  const n = Number(t.replace(",", "."));
  return Number.isInteger(n) && n >= LEVEL_MIN && n <= LEVEL_MAX ? n : null;
}

function nextLevel(currentLevel, benar) {
  if (benar) return Math.min(LEVEL_MAX, currentLevel + 1);
  return Math.max(LEVEL_MIN, currentLevel - 1);
}

// Pilih satu soal dari `pool` (daftar seluruh soal mapel terkait) yang levelnya
// sedekat mungkin dengan currentLevel dan id-nya belum ada di usedIds (soal yang
// sudah muncul di sesi ini TIDAK PERNAH diulang).
// hindari (opsional): id soal yang pernah diterima siswa di tes sebelumnya; soal ini
// dipakai hanya kalau soal "segar" sudah habis (pengaturan "Jangan ulang soal").
// Mengembalikan null jika seluruh pool sudah habis dipakai.
// acak (opsional): pembangkit bilangan acak 0..1; berikan yang deterministik supaya
// muat ulang halaman di tengah tes memberi soal yang sama (lihat soalBerikutnya).
function pickByLevel(pool, usedIds, currentLevel, hindari, acak = Math.random) {
  const belumDipakai = pool.filter((s) => !usedIds.has(s.soal_id));
  if (belumDipakai.length === 0) return null;
  if (hindari && hindari.size) {
    const segar = belumDipakai.filter((s) => !hindari.has(s.soal_id));
    const pilih = pilihTerdekat(segar, currentLevel, acak);
    if (pilih) return pilih;
  }
  return pilihTerdekat(belumDipakai, currentLevel, acak);
}
// Cari level yang persis sama dulu; kalau kosong, lebarkan pencarian
// ke level tetangga (|selisih| makin besar) sampai ketemu.
function pilihTerdekat(kandidatAwal, currentLevel, acak) {
  for (let jarak = 0; jarak <= LEVEL_MAX - LEVEL_MIN; jarak++) {
    const kandidat = kandidatAwal.filter((s) => Math.abs(s.tingkat_kesulitan - currentLevel) === jarak);
    if (kandidat.length > 0) return kandidat[Math.floor(acak() * kandidat.length)];
  }
  return null;
}

// Nilai: (jumlah bobot soal yang dijawab benar) / (jumlah bobot semua soal) x 100.
//   jawabanList : [{ benar, level }]  — level = tingkat kesulitan SOAL yang dijawab
//   belumDijawab: jumlah soal yang tidak sempat dijawab (waktu habis); dihitung salah
//                 dengan bobot level siswa saat itu (levelBelumDijawab)
//   berbobot    : false = semua soal bernilai sama (pengaturan "Bobot skor per level" mati)
function hitungNilai(jawabanList, { belumDijawab = 0, levelBelumDijawab = START_LEVEL, berbobot = true } = {}) {
  const bobot = (lv) => (berbobot ? bobotLevel(lv) : 1);
  let total = 0;
  let didapat = 0;
  for (const j of jawabanList) {
    const b = bobot(j.level);
    total += b;
    if (j.benar) didapat += b;
  }
  total += Math.max(0, belumDijawab) * bobot(levelBelumDijawab);
  if (total === 0) return 0;
  return Math.round((didapat / total) * 100);
}

function kategoriNilai(nilai) {
  if (nilai >= 85) return "Sangat Baik";
  if (nilai >= 70) return "Baik";
  if (nilai >= 55) return "Cukup";
  return "Perlu Bimbingan";
}

// Soal untuk peramban: tanpa kunci jawaban. urutan[i] = indeks opsi asli yang
// ditampilkan di posisi i (lihat lib/acakOpsi.js); bawaan tanpa pengacakan.
function publicSoal(s, urutan = [0, 1, 2, 3]) {
  if (!s) return null;
  const asli = [s.opsi_a, s.opsi_b, s.opsi_c, s.opsi_d];
  return {
    soal_id: s.soal_id,
    pertanyaan: s.pertanyaan,
    opsi_a: asli[urutan[0]],
    opsi_b: asli[urutan[1]],
    opsi_c: asli[urutan[2]],
    opsi_d: asli[urutan[3]],
    // tingkat soal ini (1-3), untuk penanda "Tingkat soal saat ini" di layar tes
    level: s.tingkat_kesulitan,
    acak: urutan.some((v, i) => v !== i),
  };
}

module.exports = {
  LEVEL_MIN, LEVEL_MAX, START_LEVEL, NAMA_LEVEL, BOBOT_LEVEL,
  namaLevel, bobotLevel, parseLevel,
  nextLevel, pickByLevel, hitungNilai, kategoriNilai, publicSoal,
};
