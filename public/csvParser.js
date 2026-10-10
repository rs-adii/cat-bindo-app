// csvParser.js — parser CSV kecil untuk peramban (dan Node, untuk pengujian).
// Menangani: tanda kutip ganda, koma/titik koma/tab sebagai pemisah (Excel
// berbahasa Indonesia biasanya menyimpan CSV dengan titik koma), baris baru
// di dalam sel bertanda kutip, dan BOM UTF-8.
(function (root) {
  function deteksiPemisah(teks) {
    const barisPertama = teks.split(/\r?\n/, 1)[0] || "";
    const hitung = { ",": 0, ";": 0, "\t": 0 };
    let dalamKutip = false;
    for (const ch of barisPertama) {
      if (ch === '"') dalamKutip = !dalamKutip;
      else if (!dalamKutip && ch in hitung) hitung[ch] += 1;
    }
    const [pemisah, jumlah] = Object.entries(hitung).sort((a, b) => b[1] - a[1])[0];
    return jumlah > 0 ? pemisah : ",";
  }

  function parse(teks) {
    teks = String(teks).replace(/^\uFEFF/, "");
    const pemisah = deteksiPemisah(teks);
    const rows = [];
    let row = [];
    let sel = "";
    let dalamKutip = false;
    for (let i = 0; i < teks.length; i++) {
      const ch = teks[i];
      if (dalamKutip) {
        if (ch === '"') {
          if (teks[i + 1] === '"') { sel += '"'; i++; } else dalamKutip = false;
        } else sel += ch;
      } else if (ch === '"') dalamKutip = true;
      else if (ch === pemisah) { row.push(sel); sel = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && teks[i + 1] === "\n") i++;
        row.push(sel); rows.push(row); row = []; sel = "";
      } else sel += ch;
    }
    if (sel !== "" || row.length > 0) { row.push(sel); rows.push(row); }
    return rows;
  }

  // Baris pertama = nama kolom. Baris kosong di akhir dibuang; baris kosong
  // di tengah dipertahankan agar nomor baris di laporan galat tetap cocok
  // dengan nomor baris di Excel.
  function parseToObjects(teks) {
    const rows = parse(teks);
    while (rows.length && rows[rows.length - 1].every((c) => String(c).trim() === "")) rows.pop();
    if (rows.length === 0) return [];
    const header = rows[0].map((h) => String(h).trim());
    return rows.slice(1).map((r) => {
      const obj = {};
      header.forEach((h, i) => { if (h) obj[h] = r[i] === undefined ? "" : r[i]; });
      return obj;
    });
  }

  const api = { parse, parseToObjects, deteksiPemisah };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CsvParser = api;
})(typeof window !== "undefined" ? window : globalThis);
