// lib/soalImport.js — validasi impor soal dari Excel/CSV.
// Satu sumber aturan untuk mode lokal dan Netlify Functions. Peramban hanya
// membaca file menjadi daftar objek; semua pemeriksaan dilakukan di sini.

const KOLOM_WAJIB = ["mapel", "pertanyaan", "opsi_a", "opsi_b", "opsi_c", "opsi_d", "kunci", "tingkat_kesulitan"];
const MAKS_BARIS = 500;

// Nama kolom alternatif yang umum dipakai guru
const ALIAS = {
  mata_pelajaran: "mapel", nama_mapel: "mapel",
  soal: "pertanyaan",
  a: "opsi_a", b: "opsi_b", c: "opsi_c", d: "opsi_d",
  jawaban: "kunci", kunci_jawaban: "kunci",
  level: "tingkat_kesulitan", kesulitan: "tingkat_kesulitan", tingkat: "tingkat_kesulitan",
};

function normKunci(k) {
  const n = String(k).trim().toLowerCase().replace(/[\s.\-]+/g, "_");
  return ALIAS[n] || n;
}
function normNamaMapel(s) {
  return String(s).trim().replace(/\s+/g, " ").toLowerCase();
}
function normPertanyaan(s) {
  return String(s).trim().replace(/\s+/g, " ").toLowerCase();
}

function normalisasiBaris(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    out[normKunci(k)] = v === null || v === undefined ? "" : String(v).trim();
  }
  return out;
}
function barisKosong(b) {
  return Object.values(b).every((v) => v === "");
}

// mapelRows: [{mapel_id, nama_mapel}], existingRows: [{mapel_id, pertanyaan}]
function bangunPeta(mapelRows, existingRows) {
  const mapelMap = new Map(mapelRows.map((m) => [normNamaMapel(m.nama_mapel), m.mapel_id]));
  const sudahAda = new Set(existingRows.map((s) => `${s.mapel_id}|${normPertanyaan(s.pertanyaan)}`));
  return { mapelMap, sudahAda };
}

// Hasil: { error } jika kolom wajib hilang / terlalu banyak baris,
// atau { total, valid:[{baris, soal}], galat:[{baris, alasan}], ringkas:[...] }
function validasiSemua(rowsMentah, mapelRows, existingRows) {
  if (!Array.isArray(rowsMentah) || rowsMentah.length === 0) return { error: "File kosong atau tidak terbaca." };
  if (rowsMentah.length > MAKS_BARIS) return { error: `Maksimal ${MAKS_BARIS} baris per impor (file ini ${rowsMentah.length} baris). Bagi menjadi beberapa file.` };

  const rows = rowsMentah.map(normalisasiBaris);
  const kolomAda = new Set(rows.flatMap((r) => Object.keys(r)));
  const hilang = KOLOM_WAJIB.filter((k) => !kolomAda.has(k));
  if (hilang.length) {
    return { error: `Kolom wajib tidak ditemukan: ${hilang.join(", ")}. Baris pertama file harus berisi nama kolom (gunakan template).` };
  }

  const { mapelMap, sudahAda } = bangunPeta(mapelRows, existingRows);
  const valid = [];
  const galat = [];
  const ringkas = [];

  rows.forEach((r, i) => {
    const baris = i + 2; // baris 1 = header
    if (barisKosong(r)) return;

    const alasan = [];
    const mapelId = mapelMap.get(normNamaMapel(r.mapel));
    if (!r.mapel) alasan.push("mapel kosong");
    else if (!mapelId) alasan.push(`mapel "${r.mapel}" tidak terdaftar`);

    if (!r.pertanyaan) alasan.push("pertanyaan kosong");
    else if (r.pertanyaan.length > 2000) alasan.push("pertanyaan lebih dari 2000 karakter");
    ["opsi_a", "opsi_b", "opsi_c", "opsi_d"].forEach((k) => {
      if (!r[k]) alasan.push(`${k} kosong`);
      else if (r[k].length > 500) alasan.push(`${k} lebih dari 500 karakter`);
    });

    const kunci = r.kunci.toUpperCase();
    if (!["A", "B", "C", "D"].includes(kunci)) alasan.push(`kunci "${r.kunci}" harus A, B, C, atau D`);

    const level = Number(String(r.tingkat_kesulitan).replace(",", "."));
    if (!Number.isInteger(level) || level < 1 || level > 5) alasan.push(`tingkat_kesulitan "${r.tingkat_kesulitan}" harus bilangan bulat 1-5`);

    if (!alasan.length) {
      const kunciDup = `${mapelId}|${normPertanyaan(r.pertanyaan)}`;
      if (sudahAda.has(kunciDup)) alasan.push("soal ini sudah ada di bank soal (pertanyaan sama)");
      else sudahAda.add(kunciDup); // juga menangkap duplikat di dalam file yang sama
    }

    const potong = r.pertanyaan.length > 70 ? r.pertanyaan.slice(0, 70) + "…" : r.pertanyaan;
    if (alasan.length) {
      galat.push({ baris, alasan: alasan.join("; ") });
      ringkas.push({ baris, ok: false, pertanyaan: potong, alasan: alasan.join("; ") });
    } else {
      valid.push({
        baris,
        soal: {
          mapel_id: mapelId, pertanyaan: r.pertanyaan,
          opsi_a: r.opsi_a, opsi_b: r.opsi_b, opsi_c: r.opsi_c, opsi_d: r.opsi_d,
          kunci, tingkat_kesulitan: level,
        },
      });
      ringkas.push({ baris, ok: true, pertanyaan: potong, mapel: r.mapel, kunci, level });
    }
  });

  return { total: valid.length + galat.length, valid, galat, ringkas };
}

module.exports = { KOLOM_WAJIB, MAKS_BARIS, validasiSemua, normalisasiBaris };
