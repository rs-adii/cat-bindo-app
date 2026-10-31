// lib/acakOpsi.js — urutan opsi A-D yang diacak per siswa per soal.
// Urutannya deterministik dari (sesiId, soalId), jadi server tidak perlu menyimpan
// apa pun: saat jawaban masuk, urutan yang sama dihitung ulang untuk menerjemahkan
// huruf yang dipilih siswa (huruf tampilan) ke huruf asli di bank soal.
const HURUF = ["A", "B", "C", "D"];
const IDENTITAS = [0, 1, 2, 3];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// urutan[i] = indeks opsi asli yang tampil di posisi i
function urutanOpsi(sesiId, soalId) {
  const acak = mulberry32((Number(sesiId) * 2654435761 + Number(soalId) * 40503) >>> 0);
  const u = [...IDENTITAS];
  for (let i = u.length - 1; i > 0; i--) {
    const k = Math.floor(acak() * (i + 1));
    [u[i], u[k]] = [u[k], u[i]];
  }
  return u;
}
// Huruf tampilan -> huruf asli. Mengembalikan null kalau hurufnya tidak valid.
function hurufAsli(hurufTampil, urutan) {
  const i = HURUF.indexOf(String(hurufTampil || "").toUpperCase());
  if (i < 0) return null;
  return HURUF[urutan[i]];
}

// Pembangkit acak tetap untuk memilih soal ke-n di sebuah sesi: dipanggil ulang
// (mis. siswa memuat ulang halaman) menghasilkan pilihan yang sama, jadi siswa
// tidak bisa "mengocok ulang" soal yang sulit.
function pembangkitSoal(sesiId, nomor) {
  return mulberry32((Number(sesiId) * 2246822519 + Number(nomor) * 3266489917 + 374761393) >>> 0);
}

module.exports = { HURUF, IDENTITAS, urutanOpsi, hurufAsli, pembangkitSoal };
