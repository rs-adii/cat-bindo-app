// lib/pengaturan.js — pengaturan sekolah & aturan evaluasi (halaman Pengaturan admin).
// Disimpan di tabel `pengaturan` (kunci, nilai) dengan nilai berupa JSON, sehingga
// kunci baru cukup ditambahkan di SKEMA tanpa mengubah struktur tabel.
const { hariIni } = require("./tanggal");

function tahunAjaranBerjalan(now = new Date()) {
  const [y, m] = hariIni(now).split("-").map(Number);
  return m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

const SKEMA = {
  nama_sekolah:       { tipe: "teks", bawaan: () => "", maks: 150 },
  tahun_ajaran:       { tipe: "teks", bawaan: tahunAjaranBerjalan, pola: /^\d{4}\/\d{4}$/, pesanPola: "Tahun ajaran ditulis seperti 2026/2027." },
  jumlah_soal_bawaan: { tipe: "angka", bawaan: () => 15, min: 1, max: 200 },
  durasi_bawaan:      { tipe: "angka", bawaan: () => 30, min: 1, max: 600 },
  jangan_ulang_soal:  { tipe: "bool", bawaan: () => true },  // utamakan soal yang belum pernah diterima siswa di tes sebelumnya
  bobot_skor:         { tipe: "bool", bawaan: () => true },  // mudah 1, sedang 2, sulit 3
  acak_opsi:          { tipe: "bool", bawaan: () => true },
  kuesioner_anonim:   { tipe: "bool", bawaan: () => true },
  tampilkan_nilai:    { tipe: "bool", bawaan: () => true },
};
const LABEL = {
  nama_sekolah: "Nama sekolah", tahun_ajaran: "Tahun ajaran", jumlah_soal_bawaan: "Jumlah soal bawaan",
  durasi_bawaan: "Durasi bawaan", jangan_ulang_soal: "Jangan ulang soal", bobot_skor: "Bobot skor per level",
  acak_opsi: "Acak urutan pilihan jawaban", kuesioner_anonim: "Kuesioner anonim", tampilkan_nilai: "Tampilkan nilai langsung",
};

function bawaan() {
  return Object.fromEntries(Object.entries(SKEMA).map(([k, s]) => [k, s.bawaan()]));
}
// rows: [{ kunci, nilai }] dari database -> objek lengkap (kunci yang belum tersimpan memakai bawaan)
function gabung(rows) {
  const hasil = bawaan();
  for (const r of rows || []) {
    if (!(r.kunci in SKEMA)) continue;
    try { hasil[r.kunci] = JSON.parse(r.nilai); } catch { /* nilai rusak: pakai bawaan */ }
  }
  return hasil;
}
// Validasi pembaruan sebagian. Mengembalikan { data } atau { error }.
function validasi(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Data pengaturan tidak valid." };
  const data = {};
  for (const [k, v] of Object.entries(input)) {
    const s = SKEMA[k];
    if (!s) return { error: `Pengaturan "${k}" tidak dikenal.` };
    if (s.tipe === "bool") {
      if (typeof v !== "boolean") return { error: `${LABEL[k]} harus bernilai ya/tidak.` };
      data[k] = v;
    } else if (s.tipe === "angka") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < s.min || n > s.max) return { error: `${LABEL[k]} harus bilangan bulat ${s.min}–${s.max}.` };
      data[k] = n;
    } else {
      const t = String(v === null || v === undefined ? "" : v).trim();
      if (s.maks && t.length > s.maks) return { error: `${LABEL[k]} maksimal ${s.maks} karakter.` };
      if (s.pola && t && !s.pola.test(t)) return { error: s.pesanPola };
      data[k] = t;
    }
  }
  return { data };
}
const serialisasi = (data) => Object.entries(data).map(([kunci, nilai]) => ({ kunci, nilai: JSON.stringify(nilai) }));

module.exports = { SKEMA, bawaan, gabung, validasi, serialisasi, tahunAjaranBerjalan };
