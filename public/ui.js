// ui.js — alat bersama untuk semua halaman EvalSMK.
// Semua teks dari pengguna/server dimasukkan sebagai text node (bukan innerHTML),
// jadi isi soal, nama, atau komentar tidak bisa menyisipkan skrip.
(function (global) {
  "use strict";

  // ------------------------------------------------------------------ elemen
  // h("div.kartu#id", { onclick, class, ...atribut }, anak1, anak2, ...)
  function h(sel, props, ...anak) {
    if (props === null || typeof props !== "object" || props instanceof Node || Array.isArray(props)) {
      anak.unshift(props);
      props = {};
    }
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel);
    const el = document.createElement((m && m[1]) || "div");
    if (m && m[2]) {
      for (const bagian of m[2].match(/[.#][\w-]+/g)) {
        if (bagian[0] === ".") el.classList.add(bagian.slice(1));
        else el.id = bagian.slice(1);
      }
    }
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "class") String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "value") el.value = v;
      else if (k === "checked" || k === "disabled" || k === "selected") el[k] = !!v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    tambahAnak(el, anak);
    return el;
  }
  function tambahAnak(el, anak) {
    for (const a of anak.flat(Infinity)) {
      if (a === null || a === undefined || a === false) continue;
      el.appendChild(a instanceof Node ? a : document.createTextNode(String(a)));
    }
  }
  function kosongkan(el, ...anak) {
    el.replaceChildren();
    tambahAnak(el, anak);
    return el;
  }

  // ------------------------------------------------------------------ penyimpanan lokal (aman)
  const lokal = {
    ambil(k, bawaan = null) {
      try { const v = localStorage.getItem(k); return v === null ? bawaan : JSON.parse(v); } catch { return bawaan; }
    },
    simpan(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* abaikan */ } },
    hapus(k) { try { localStorage.removeItem(k); } catch { /* abaikan */ } },
  };

  // ------------------------------------------------------------------ API
  const sesi = { token: null, user: null, onBerakhir: null };
  async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    if (sesi.token) headers.Authorization = "Bearer " + sesi.token;
    let res;
    try {
      res = await fetch(path, { ...opts, headers });
    } catch {
      throw new Error("Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.");
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && sesi.token && sesi.onBerakhir) {
      sesi.onBerakhir();
      throw new Error("Sesi login berakhir. Silakan masuk lagi.");
    }
    if (!res.ok) throw new Error((data && data.error) || "Terjadi kesalahan pada server.");
    return data;
  }
  const kirim = (method) => (path, body) => api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const post = kirim("POST");
  const put = kirim("PUT");
  const hapus = kirim("DELETE");

  // ------------------------------------------------------------------ format
  const NAMA_LEVEL = { 1: "Mudah", 2: "Sedang", 3: "Sulit" };
  const namaLevel = (n) => NAMA_LEVEL[n] || "-";
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  // Tanggal hari ini di zona WIB (sekolah di Indonesia), format YYYY-MM-DD
  function hariIni() {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }
  function formatTanggal(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
    if (!m) return s || "-";
    return `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}`;
  }
  function labelTanggal(s) {
    const t = String(s || "").slice(0, 10);
    return t === hariIni() ? "Hari ini" : formatTanggal(t);
  }
  // Status tes berdasarkan tanggal (WIB): sebelum hari-H = Terjadwal, hari-H = Berjalan, sesudahnya = Selesai
  function statusTes(tanggal) {
    const t = String(tanggal || "").slice(0, 10);
    const kini = hariIni();
    if (t > kini) return "Terjadwal";
    if (t === kini) return "Berjalan";
    return "Selesai";
  }
  const bulat1 = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? "-" : Number(n).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const bulat = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? "-" : String(Math.round(Number(n))));
  const inisial = (nama) => (String(nama || "?").trim().replace(/^(bu|pak|ibu|bapak)\s+/i, "")[0] || "?").toUpperCase();
  const rata = (arr) => (arr.length ? arr.reduce((a, b) => a + Number(b || 0), 0) / arr.length : null);

  // ------------------------------------------------------------------ komponen
  const pilLevel = (lv) => h("span", { class: "pil pil-" + (lv || "abu") }, namaLevel(lv));

  function kartu(judul, opsi, ...isi) {
    opsi = opsi || {};
    const kepala = judul || opsi.aksi || opsi.catatan
      ? h("div.kartu-kepala", h("h3", judul || ""), opsi.aksi || (opsi.catatan ? h("span.catatan-kanan", opsi.catatan) : null))
      : null;
    return h("section", { class: "kartu " + (opsi.class || "") }, kepala, ...isi);
  }
  function kpi(label, nilai, warna = "teal", akhiran) {
    return h("div.kartu.kpi", h("div.label", label), h("div", { class: "angka w-" + warna }, String(nilai), akhiran ? h("small", akhiran) : null));
  }
  function batang(label, nilai, maks, teks) {
    const persen = maks > 0 ? Math.max(0, Math.min(100, (Number(nilai) / maks) * 100)) : 0;
    return h("div.batang-baris", h("span", label), h("div.batang", h("i", { style: { width: persen + "%" } })), h("span.nilai", teks !== undefined ? teks : String(nilai)));
  }
  // kolom: [{ judul, isi: (baris) => Node|string, kelas, utama }]
  function tabel(kolom, baris, opsi = {}) {
    if (!baris.length) return h("p.kosong", opsi.kosong || "Belum ada data.");
    return h("div.tabel-bungkus",
      h("table", { class: "tabel " + (opsi.hp === false ? "" : "kartu-hp") },
        h("thead", h("tr", kolom.map((k) => h("th", { style: k.lebar ? { width: k.lebar } : null }, k.judul)))),
        h("tbody", baris.map((b) => h("tr", kolom.map((k) => {
          const v = k.isi(b);
          return h("td", { class: [k.kelas, k.utama ? "utama" : ""].filter(Boolean).join(" ") || null, "data-label": k.utama ? null : k.judul }, v === null || v === undefined || v === "" ? "-" : v);
        }))))
      )
    );
  }
  const memuat = (teks = "Memuat…") => h("div.memuat", teks);
  function galatKotak(err, ulang) {
    return h("div.kartu", h("p.galat-teks", { style: { marginTop: 0 } }, err.message || String(err)),
      ulang ? h("button.tombol.t-garis.t-kecil", { onclick: ulang, style: { marginTop: "12px" } }, "Coba lagi") : null);
  }

  // ------------------------------------------------------------------ toast & modal
  function toast(pesan, jenis) {
    const wadah = document.getElementById("toast-wadah");
    if (!wadah) return;
    const t = h("div", { class: "toast " + (jenis === "galat" ? "galat" : "") }, pesan);
    wadah.appendChild(t);
    setTimeout(() => t.remove(), jenis === "galat" ? 5200 : 3200);
  }

  // modal({ judul, sub, isi: Node, aksi: [{ teks, kelas, klik: async (tutup) => {} }], lebar })
  function modal({ judul, sub, isi, aksi = [], lebar = false, onTutup }) {
    const sebelumnya = document.activeElement;
    const galat = h("p.galat-teks", { hidden: true });
    function tutup() {
      if (!latar.isConnected) return;
      latar.remove();
      if (onTutup) onTutup();
      document.removeEventListener("keydown", tekan);
      if (sebelumnya && sebelumnya.focus) sebelumnya.focus();
    }
    function tekan(e) { if (e.key === "Escape") tutup(); }
    const tombol = aksi.map((a) => {
      const b = h("button", { class: "tombol " + (a.kelas || "t-garis"), type: a.submit ? "submit" : "button" }, a.teks);
      if (!a.submit) b.addEventListener("click", () => jalankan(a, b));
      return b;
    });
    async function jalankan(a, b) {
      if (!a.klik) return tutup();
      galat.hidden = true;
      const teksAsli = b.textContent;
      b.disabled = true;
      if (a.memuat) b.textContent = a.memuat;
      try {
        const hasil = await a.klik(tutup);
        if (hasil !== false && document.body.contains(latar)) tutup();
      } catch (e) {
        galat.textContent = e.message;
        galat.hidden = false;
      } finally {
        b.disabled = false;
        b.textContent = teksAsli;
      }
    }
    const kirimAksi = aksi.find((a) => a.submit);
    const form = h("form", {
      onsubmit: (e) => { e.preventDefault(); if (kirimAksi) jalankan(kirimAksi, tombol[aksi.indexOf(kirimAksi)]); },
    }, isi, galat, aksi.length ? h("div.modal-aksi", tombol) : null);
    const kotak = h("div", { class: "modal " + (lebar ? "lebar" : ""), role: "dialog", "aria-modal": "true", "aria-label": judul },
      h("h3", judul), sub ? h("p.sub", sub) : null, form);
    const latar = h("div.modal-latar", { onmousedown: (e) => { if (e.target === latar) tutup(); } }, kotak);
    document.body.appendChild(latar);
    document.addEventListener("keydown", tekan);
    const pertama = kotak.querySelector("input, select, textarea, button");
    if (pertama) pertama.focus();
    return { tutup, galat };
  }
  function konfirmasi(judul, pesan, teksYa = "Hapus", kelas = "t-bahaya") {
    return new Promise((selesai) => {
      let dipilih = false;
      modal({
        judul,
        isi: h("p", { style: { margin: "4px 0 0", color: "var(--redup)" } }, pesan),
        aksi: [{ teks: "Batal" }, { teks: teksYa, kelas, klik: () => { dipilih = true; } }],
        onTutup: () => selesai(dipilih),
      });
    });
  }

  // ------------------------------------------------------------------ isian form
  function isian(label, kontrol, bantuan) {
    const id = kontrol.id || "f" + Math.random().toString(36).slice(2, 9);
    kontrol.id = id;
    return h("div.isian", h("label", { for: id }, label), kontrol, bantuan ? h("small", { style: { color: "var(--redup)", fontSize: "12.5px" } }, bantuan) : null);
  }
  const masukan = (props = {}) => h("input.kontrol", { type: "text", ...props });
  const areaTeks = (props = {}) => h("textarea.kontrol", props);
  function pilihan(opsi, props = {}, nilaiTerpilih) {
    // opsi: [{ nilai, teks }]
    return h("select.kontrol", props, opsi.map((o) => h("option", { value: o.nilai, selected: String(o.nilai) === String(nilaiTerpilih) }, o.teks)));
  }

  // Tombol pilihan tunggal (kunci A-D, tingkat kesulitan)
  function grupTombol(nilaiList, { terpilih, render, kelas, onUbah }) {
    let nilai = terpilih;
    const wadah = h("div", { class: kelas, role: "group" });
    const tombol = nilaiList.map((v) => {
      const b = render(v);
      b.type = "button";
      b.setAttribute("aria-pressed", String(v === nilai));
      b.addEventListener("click", () => { atur(v); if (onUbah) onUbah(v); });
      return b;
    });
    function atur(v) {
      nilai = v;
      tombol.forEach((b, i) => b.setAttribute("aria-pressed", String(nilaiList[i] === v)));
    }
    tambahAnak(wadah, tombol);
    return { el: wadah, ambil: () => nilai, atur };
  }

  global.UI = {
    h, kosongkan, lokal, sesi, api, post, put, hapus,
    NAMA_LEVEL, namaLevel, hariIni, formatTanggal, labelTanggal, statusTes, bulat1, bulat, inisial, rata,
    pilLevel, kartu, kpi, batang, tabel, memuat, galatKotak,
    toast, modal, konfirmasi, isian, masukan, areaTeks, pilihan, grupTombol,
  };
})(window);
