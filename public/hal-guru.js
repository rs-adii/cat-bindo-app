// hal-guru.js — Dashboard, Bank Soal (+impor Excel/CSV), Jadwal Evaluasi, Kuesioner, Hasil Siswa, Rekap Feedback
(function () {
  "use strict";
  const { h, kosongkan, api, post, put, hapus, kartu, kpi, batang, tabel, memuat, toast, modal, konfirmasi,
    isian, masukan, areaTeks, pilihan, grupTombol, pilLevel, namaLevel, formatTanggal, statusTes, hariIni,
    bulat, bulat1, rata, sesi } = window.UI;
  const { daftar, pergi } = window.Shell;

  const ringkasTes = (t) => [t.nama_kelas || "Semua kelas", `${t.jumlah_soal} soal`, `${t.durasi_menit} menit`, formatTanggal(t.tanggal)].join(" · ");
  const pilStatus = (s) => h("span", { class: "pil " + (s === "Berjalan" ? "pil-2" : s === "Terjadwal" ? "pil-teal" : "pil-abu") }, s);
  const urutTes = (list) => [...list].sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)) || b.tes_id - a.tes_id);
  const hasilUntuk = (hasil, t) => hasil.filter((r) => Number(r.tes_id) === Number(t.tes_id));
  const selesaiSaja = (hasil) => hasil.filter((r) => r.status === "selesai");

  // ============================================================ DASHBOARD
  daftar("guru", "dashboard", {
    judul: "Dashboard Guru",
    sub: "Ringkasan evaluasi dan aktivitas siswa",
    async render(isi) {
      kosongkan(isi, memuat());
      const [soal, tes, hasil] = await Promise.all([api("/api/guru/soal"), api("/api/guru/tes"), api("/api/guru/hasil")]);
      const kini = hariIni();
      const aktif = tes.filter((t) => String(t.tanggal).slice(0, 10) >= kini).length;
      const ringkasFb = await Promise.all(tes.map((t) => api(`/api/guru/feedback-summary/${t.tes_id}`).catch(() => ({ jumlahResponden: 0 }))));
      const respon = ringkasFb.reduce((a, f) => a + (f.jumlahResponden || 0), 0);

      const selesai = selesaiSaja(hasil);
      const perKelas = {};
      selesai.forEach((r) => { const k = r.nama_kelas || "Tanpa kelas"; (perKelas[k] = perKelas[k] || []).push(r.nilai); });
      const kelasRata = Object.entries(perKelas).map(([k, v]) => [k, rata(v)]).sort((a, b) => a[0].localeCompare(b[0]));

      kosongkan(isi,
        h("div.grid.g-kpi-4",
          kpi("Total soal", soal.length, "teal"), kpi("Evaluasi aktif", aktif, "navy"),
          kpi("Siswa mengerjakan", hasil.length, "teal"), kpi("Respon feedback", respon, "amber")),
        h("div.grid.g-2a.isi-penuh",
          kartu("Evaluasi terbaru", { aksi: h("button.tautan", { type: "button", onclick: () => pergi("guru/jadwal") }, "Atur jadwal") },
            tabel([
              { judul: "Evaluasi", isi: (t) => t.judul, kelas: "tebal", utama: true },
              { judul: "Kelas", isi: (t) => t.nama_kelas || "Semua" },
              { judul: "Selesai", isi: (t) => String(hasilUntuk(selesai, t).length) },
              { judul: "Status", isi: (t) => statusTes(t.tanggal) },
            ], urutTes(tes).slice(0, 6), { kosong: "Belum ada jadwal evaluasi." })),
          kartu("Rata-rata nilai per kelas", null,
            kelasRata.length
              ? h("div.batang-daftar", kelasRata.map(([k, v]) => batang(k, v, 100, bulat(v))))
              : h("p.kosong", "Belum ada siswa yang menyelesaikan tes."),
            h("div.info-kotak", "Nilai dihitung dari jawaban benar dengan bobot sesuai tingkat kesulitan soal."))));
    },
  });

  // ============================================================ BANK SOAL
  const KOLOM_TEMPLATE = ["mapel", "materi", "pertanyaan", "opsi_a", "opsi_b", "opsi_c", "opsi_d", "kunci", "tingkat_kesulitan"];
  const TEMPLATE_SOAL = [
    KOLOM_TEMPLATE,
    ["Bahasa Indonesia", "Ejaan", "(Contoh, hapus baris ini) Penulisan kata baku yang benar adalah...", "Apotik", "Apotek", "Apotheek", "Apotic", "B", "Mudah"],
    ["Bahasa Indonesia", "Kosakata", "(Contoh, hapus baris ini) Antonim kata 'optimis' adalah...", "Yakin", "Percaya diri", "Pesimis", "Ragu-ragu", "C", "Sedang"],
  ];
  function unduhBerkas(nama, isi, tipe) {
    const a = h("a", { href: URL.createObjectURL(new Blob([isi], { type: tipe })), download: nama });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function unduhTemplateCsv() {
    const csv = TEMPLATE_SOAL.map((r) => r.map((c) => (/[";\r\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : String(c))).join(";")).join("\r\n");
    unduhBerkas("template-soal.csv", "﻿" + csv, "text/csv;charset=utf-8");
  }
  function unduhTemplateXlsx() {
    if (typeof XLSX === "undefined") return toast("Pembuat file Excel tidak termuat. Gunakan template CSV.", "galat");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(TEMPLATE_SOAL), "Soal");
    XLSX.writeFile(wb, "template-soal.xlsx");
  }
  async function bacaFileSoal(file) {
    if (file.name.toLowerCase().endsWith(".csv")) return CsvParser.parseToObjects(await file.text());
    if (typeof XLSX === "undefined") throw new Error("Pembaca Excel tidak termuat. Simpan file sebagai CSV lalu coba lagi.");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    // blankrows:true menjaga nomor baris di laporan galat sama dengan nomor baris di Excel
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false, blankrows: true });
  }

  function bukaImpor(selesai) {
    const hasilBox = h("div");
    const inputFile = h("input", { type: "file", accept: ".xlsx,.xls,.csv", class: "kontrol", style: { paddingTop: "9px" } });
    let rows = null;
    let tombolImpor = null;
    inputFile.addEventListener("change", async () => {
      const file = inputFile.files[0];
      if (!file) return;
      kosongkan(hasilBox, memuat("Memeriksa file…"));
      try {
        rows = await bacaFileSoal(file);
        const cek = await post("/api/guru/soal/impor", { rows, dryRun: true });
        kosongkan(hasilBox,
          h("p", { style: { margin: "6px 0 10px" } }, h("b", String(cek.jumlahValid)), " soal siap diimpor, ",
            h("b", { style: { color: "var(--merah)" } }, String(cek.galat.length)), ` baris bermasalah (dari ${cek.totalBaris} baris terbaca).`),
          cek.galat.length ? h("div", { style: { maxHeight: "220px", overflow: "auto" } },
            tabel([{ judul: "Baris", isi: (g) => String(g.baris), lebar: "70px" }, { judul: "Masalah", isi: (g) => g.alasan }], cek.galat, { hp: false })) : null,
          cek.galat.length ? h("small", { style: { color: "var(--redup)" } }, "Baris bermasalah dilewati. Perbaiki di file lalu pilih ulang jika ingin ikut diimpor.") : null);
        tombolImpor.disabled = cek.jumlahValid === 0;
        tombolImpor.textContent = cek.jumlahValid ? `Impor ${cek.jumlahValid} soal` : "Impor";
      } catch (e) {
        rows = null;
        tombolImpor.disabled = true;
        kosongkan(hasilBox, h("p.galat-teks", e.message));
      }
    });
    const m = modal({
      judul: "Impor soal dari Excel/CSV", lebar: true,
      sub: "Satu baris = satu soal. Kolom tingkat_kesulitan boleh berisi Mudah/Sedang/Sulit atau 1-3; kolom materi opsional.",
      isi: h("div",
        h("div.tombol-deret", { style: { marginBottom: "14px" } },
          h("button.tombol.t-garis.t-kecil", { type: "button", onclick: unduhTemplateXlsx }, "Unduh template Excel"),
          h("button.tombol.t-garis.t-kecil", { type: "button", onclick: unduhTemplateCsv }, "Unduh template CSV")),
        isian("Pilih file (.xlsx atau .csv)", inputFile),
        hasilBox),
      aksi: [{ teks: "Tutup" }, { teks: "Impor", kelas: "t-teal", memuat: "Mengimpor…", klik: async () => {
        if (!rows) throw new Error("Pilih file terlebih dahulu.");
        const r = await post("/api/guru/soal/impor", { rows });
        toast(`Berhasil mengimpor ${r.jumlahDiimpor} soal.`);
        selesai();
      } }],
    });
    tombolImpor = m.galat.parentElement.querySelector(".modal-aksi .t-teal");
    tombolImpor.disabled = true;
  }

  daftar("guru", "soal", {
    judul: "Kelola Bank Soal",
    sub: "Soal dikelompokkan per mapel dan tingkat kesulitan",
    async render(isi, _p, ctx) {
      kosongkan(isi, memuat());
      const [mapel, soalAwal] = await Promise.all([api("/api/admin/mapel"), api("/api/guru/soal")]);
      let soal = soalAwal;
      const saring = { mapel: "", level: "", cari: "", milikSaya: false };
      let batas = 40;
      let editId = null;

      // ---------- form (kanan)
      const judulForm = h("h3", "Tambah soal");
      const f = {
        mapel: pilihan(mapel.map((m) => ({ nilai: m.mapel_id, teks: m.nama_mapel }))),
        materi: masukan({ list: "daftar-materi", maxlength: 100, placeholder: "mis. Ejaan (opsional)" }),
        pertanyaan: areaTeks({ rows: 3, maxlength: 2000, style: { minHeight: "74px" } }),
        opsi: ["a", "b", "c", "d"].map(() => masukan({ maxlength: 500 })),
      };
      const datalist = h("datalist#daftar-materi");
      const kunci = grupTombol(["A", "B", "C", "D"], { terpilih: "A", kelas: "pilih-kunci", render: (v) => h("button", { "aria-label": "Kunci " + v }, v) });
      const level = grupTombol([1, 2, 3], { terpilih: 2, kelas: "pilih-level", render: (v) => h("button", { class: "pil pil-" + v }, namaLevel(v)) });
      const galatForm = h("p.galat-teks", { hidden: true });
      const tombolSimpan = h("button.tombol.t-teal", { type: "submit" }, "Simpan soal");
      const tombolBatal = h("button.tombol.t-garis", { type: "button", hidden: true, onclick: () => aturForm(null) }, "Batal ubah");

      function aturForm(s) {
        editId = s ? s.soal_id : null;
        judulForm.textContent = s ? "Ubah soal" : "Tambah soal";
        f.mapel.disabled = !!s; // server tidak memindahkan soal antar-mapel
        if (s) f.mapel.value = s.mapel_id;
        f.materi.value = s ? s.materi || "" : "";
        f.pertanyaan.value = s ? s.pertanyaan : "";
        ["a", "b", "c", "d"].forEach((k, i) => { f.opsi[i].value = s ? s["opsi_" + k] : ""; });
        kunci.atur(s ? s.kunci : "A");
        level.atur(s ? s.tingkat_kesulitan : 2);
        tombolSimpan.textContent = s ? "Simpan perubahan" : "Simpan soal";
        tombolBatal.hidden = !s;
        galatForm.hidden = true;
        if (s) {
          // Gulir ke form hanya kalau form tidak terlihat (mis. di layar HP form ada di bawah daftar)
          const r = formKartu.getBoundingClientRect();
          if (r.top < 0 || r.top > window.innerHeight - 120) formKartu.scrollIntoView({ behavior: "smooth", block: "start" });
          f.pertanyaan.focus({ preventScroll: true });
        }
      }
      async function simpan(e) {
        e.preventDefault();
        galatForm.hidden = true;
        const body = {
          mapel_id: Number(f.mapel.value), materi: f.materi.value.trim(), pertanyaan: f.pertanyaan.value.trim(),
          opsi_a: f.opsi[0].value.trim(), opsi_b: f.opsi[1].value.trim(), opsi_c: f.opsi[2].value.trim(), opsi_d: f.opsi[3].value.trim(),
          kunci: kunci.ambil(), tingkat_kesulitan: level.ambil(),
        };
        if (!body.mapel_id) { galatForm.textContent = "Admin perlu menambahkan mata pelajaran terlebih dahulu."; galatForm.hidden = false; return; }
        if (!body.pertanyaan || !body.opsi_a || !body.opsi_b || !body.opsi_c || !body.opsi_d) {
          galatForm.textContent = "Pertanyaan dan keempat opsi wajib diisi."; galatForm.hidden = false; return;
        }
        tombolSimpan.disabled = true;
        try {
          if (editId) await put(`/api/guru/soal/${editId}`, body); else await post("/api/guru/soal", body);
          toast(editId ? "Perubahan soal disimpan." : "Soal ditambahkan ke bank soal.");
          const mapelTerakhir = f.mapel.value;
          aturForm(null);
          f.mapel.value = mapelTerakhir;
          await muatSoal();
        } catch (err) {
          galatForm.textContent = err.message; galatForm.hidden = false;
        } finally {
          tombolSimpan.disabled = false;
        }
      }
      const formKartu = h("section.kartu", { style: { alignSelf: "start" } },
        h("div.kartu-kepala", judulForm),
        h("form", { onsubmit: simpan },
          isian("Mata pelajaran", f.mapel),
          isian("Materi", f.materi), datalist,
          isian("Pertanyaan", f.pertanyaan),
          ["A", "B", "C", "D"].map((L, i) => { f.opsi[i].id = "opsi-" + L; return h("div.opsi-isian", h("label", { for: "opsi-" + L }, "Opsi " + L), f.opsi[i]); }),
          h("div.isian", { style: { marginTop: "12px" } }, h("span.label-isian", "Kunci jawaban"), kunci.el),
          h("div.isian", h("span.label-isian", "Tingkat kesulitan"), level.el),
          galatForm,
          h("div.tombol-deret", { style: { marginTop: "6px" } }, tombolSimpan, tombolBatal)));

      // ---------- daftar (kiri)
      const wadahDaftar = h("div");
      const infoJumlah = h("span.catatan-kanan");
      async function muatSoal() { soal = await api("/api/guru/soal"); gambar(); }
      function perbaruiMateri() {
        const set = [...new Set(soal.map((s) => s.materi).filter(Boolean))].sort();
        kosongkan(datalist, set.map((m) => h("option", { value: m })));
      }
      async function buang(s) {
        if (!(await konfirmasi("Hapus soal?", "Soal ini akan dihapus dari bank soal. Soal yang sudah pernah muncul di tes siswa tidak dapat dihapus."))) return;
        try { await hapus(`/api/guru/soal/${s.soal_id}`); toast("Soal dihapus."); if (editId === s.soal_id) aturForm(null); await muatSoal(); }
        catch (e) { toast(e.message, "galat"); }
      }
      function gambar() {
        perbaruiMateri();
        const q = saring.cari.toLowerCase();
        const cocok = soal.filter((s) => (!saring.mapel || String(s.mapel_id) === saring.mapel) &&
          (!saring.level || String(s.tingkat_kesulitan) === saring.level) &&
          (!saring.milikSaya || s.guru_id === sesi.user.users_id) &&
          (!q || s.pertanyaan.toLowerCase().includes(q) || String(s.materi || "").toLowerCase().includes(q)));
        infoJumlah.textContent = `${cocok.length} soal`;
        const tampil = cocok.slice(0, batas);
        kosongkan(wadahDaftar,
          tabel([
            { judul: "Pertanyaan", utama: true, isi: (s) => h("div", { title: s.pertanyaan, style: { display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" } }, s.pertanyaan) },
            { judul: "Materi", isi: (s) => h("span", { title: s.nama_mapel }, s.materi || s.nama_mapel) },
            { judul: "Kunci", isi: (s) => s.kunci, kelas: "tebal" },
            { judul: "Tingkat", isi: (s) => pilLevel(s.tingkat_kesulitan) },
            { judul: "Aksi", kelas: "aksi", isi: (s) => (s.guru_id === sesi.user.users_id
              ? h("span", h("button.tautan", { type: "button", onclick: () => aturForm(s) }, "Ubah"),
                  h("button.tautan.bahaya", { type: "button", onclick: () => buang(s) }, "Hapus"))
              : h("small", { style: { color: "var(--redup)" }, title: "Dibuat oleh " + (s.nama_guru || "guru lain") }, s.nama_guru || "Guru lain")) },
          ], tampil, { kosong: soal.length ? "Tidak ada soal yang cocok dengan saringan." : "Bank soal masih kosong. Tambahkan soal atau impor dari Excel." }),
          cocok.length > batas ? h("button.tombol.t-garis.t-kecil", { style: { marginTop: "14px" }, onclick: () => { batas += 40; gambar(); } }, `Tampilkan lebih banyak (${cocok.length - batas} lagi)`) : null);
      }
      const ubahSaring = (k) => (e) => { saring[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value; batas = 40; gambar(); };

      const daftarKartu = kartu("Daftar soal pilihan ganda", {
        aksi: h("div.tombol-deret", infoJumlah, h("button.tombol.t-oranye.t-kecil", { onclick: () => bukaImpor(muatSoal) }, "Impor Excel/CSV")),
      },
      h("div.alat-saring",
        h("input.kontrol", { type: "search", placeholder: "Cari pertanyaan atau materi…", "aria-label": "Cari soal", oninput: ubahSaring("cari") }),
        pilihan([{ nilai: "", teks: "Semua mapel" }, ...mapel.map((m) => ({ nilai: m.mapel_id, teks: m.nama_mapel }))], { "aria-label": "Saring mapel", onchange: ubahSaring("mapel") }),
        pilihan([{ nilai: "", teks: "Semua tingkat" }, { nilai: 1, teks: "Mudah" }, { nilai: 2, teks: "Sedang" }, { nilai: 3, teks: "Sulit" }], { "aria-label": "Saring tingkat", onchange: ubahSaring("level") }),
        h("label", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", whiteSpace: "nowrap" } },
          h("input.centang", { type: "checkbox", onchange: ubahSaring("milikSaya"), style: { width: "20px", height: "20px" } }), "Soal saya")),
      wadahDaftar);

      gambar();
      kosongkan(isi, h("div.grid.g-2c.isi-penuh", daftarKartu, formKartu));
      void ctx;
    },
  });

  // ============================================================ JADWAL EVALUASI
  daftar("guru", "jadwal", {
    judul: "Atur Jadwal Tes",
    sub: "Tentukan kelas, jumlah soal, durasi, dan tanggal",
    async render(isi, _p, ctx) {
      kosongkan(isi, memuat());
      const [mapel, kelas, tes, soal, peng] = await Promise.all([api("/api/admin/mapel"), api("/api/admin/kelas"), api("/api/guru/tes"), api("/api/guru/soal"), api("/api/pengaturan").catch(() => ({}))]);
      const jumlahPerMapel = {};
      soal.forEach((s) => { jumlahPerMapel[s.mapel_id] = (jumlahPerMapel[s.mapel_id] || 0) + 1; });

      const f = {
        judul: masukan({ required: true, maxlength: 150, placeholder: "mis. PTS Bahasa Indonesia" }),
        mapel: pilihan(mapel.map((m) => ({ nilai: m.mapel_id, teks: m.nama_mapel }))),
        kelas: pilihan([...kelas.map((k) => ({ nilai: k.kelas_id, teks: k.nama_kelas })), { nilai: "", teks: "Semua kelas" }]),
        jumlah: masukan({ type: "number", min: 1, max: 200, value: peng.jumlah_soal_bawaan || 15, inputmode: "numeric" }),
        durasi: masukan({ type: "number", min: 1, max: 600, value: peng.durasi_bawaan || 30, inputmode: "numeric" }),
        tanggal: masukan({ type: "date", value: hariIni(), required: true }),
      };
      const infoBank = h("small", { style: { color: "var(--redup)", fontSize: "12.5px" } });
      const perbaruiInfo = () => {
        const n = jumlahPerMapel[f.mapel.value] || 0;
        infoBank.textContent = `Bank soal mapel ini: ${n} soal.`;
        infoBank.style.color = n < Number(f.jumlah.value || 0) ? "var(--merah)" : "var(--redup)";
      };
      f.mapel.addEventListener("change", perbaruiInfo);
      f.jumlah.addEventListener("input", perbaruiInfo);
      perbaruiInfo();
      const galat = h("p.galat-teks", { hidden: true });
      const tombol = h("button.tombol.t-teal", { type: "submit" }, "Simpan jadwal");

      async function simpan(e) {
        e.preventDefault();
        galat.hidden = true;
        const body = {
          judul: f.judul.value.trim(), mapel_id: Number(f.mapel.value), kelas_id: f.kelas.value ? Number(f.kelas.value) : null,
          jumlah_soal: Number(f.jumlah.value), durasi_menit: Number(f.durasi.value), tanggal: f.tanggal.value,
        };
        const salah = !body.judul ? "Judul tes wajib diisi." : !body.mapel_id ? "Pilih mata pelajaran." :
          !(body.jumlah_soal >= 1) ? "Jumlah soal minimal 1." : !(body.durasi_menit >= 1) ? "Durasi minimal 1 menit." :
          !body.tanggal ? "Tanggal wajib diisi." :
          (jumlahPerMapel[body.mapel_id] || 0) < body.jumlah_soal ? `Bank soal mapel ini baru berisi ${jumlahPerMapel[body.mapel_id] || 0} soal. Kurangi jumlah soal atau tambah soal dulu.` : null;
        if (salah) { galat.textContent = salah; galat.hidden = false; return; }
        tombol.disabled = true;
        try { await post("/api/guru/tes", body); toast("Jadwal tes disimpan."); ctx.muatUlang(); }
        catch (err) { galat.textContent = err.message; galat.hidden = false; tombol.disabled = false; }
      }
      async function buang(t) {
        if (!(await konfirmasi("Hapus jadwal tes?", `"${t.judul}" akan dihapus. Tes yang sudah dikerjakan siswa atau punya kuesioner tidak dapat dihapus.`))) return;
        try { await hapus(`/api/guru/tes/${t.tes_id}`); toast("Jadwal dihapus."); ctx.muatUlang(); }
        catch (e) { toast(e.message, "galat"); }
      }

      kosongkan(isi, h("div.grid.g-2d.isi-penuh", { style: { gridTemplateColumns: "1fr 1.27fr" } },
        kartu("Atur jadwal tes", { class: "", },
          h("form", { onsubmit: simpan },
            isian("Judul tes", f.judul),
            isian("Mata pelajaran", f.mapel), infoBank,
            h("div", { style: { height: "12px" } }),
            isian("Kelas", f.kelas),
            h("div.baris-isian", isian("Jumlah soal", f.jumlah), isian("Durasi (menit)", f.durasi)),
            isian("Tanggal", f.tanggal),
            galat,
            tombol)),
        kartu("Tes terjadwal", null,
          tes.length
            ? h("div.tumpuk", { style: { gap: "12px" } }, urutTes(tes).map((t) => h("div.kartu", { style: { padding: "16px 18px", borderRadius: "14px", boxShadow: "none" } },
                h("div", { style: { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" } },
                  h("div", h("b", { style: { fontSize: "17px" } }, t.judul), h("div", { style: { color: "var(--redup)", fontSize: "14px", marginTop: "2px" } }, t.nama_mapel + " · " + ringkasTes(t))),
                  pilStatus(statusTes(t.tanggal))),
                h("div", { style: { marginTop: "8px" } }, h("button.tautan.bahaya", { type: "button", onclick: () => buang(t) }, "Hapus")))))
            : h("p.kosong", "Belum ada jadwal tes."))));
    },
  });

  // ============================================================ KUESIONER
  const PERTANYAAN_BAWAAN = [
    "Guru menguasai materi yang diajarkan",
    "Penyampaian materi mudah dipahami",
    "Media pembelajaran membantu saya belajar",
    "Suasana kelas nyaman untuk belajar",
  ];
  daftar("guru", "kuesioner", {
    judul: "Kelola Kuesioner",
    sub: "Siapkan pertanyaan feedback untuk setiap tes",
    async render(isi, _p, ctx) {
      kosongkan(isi, memuat());
      const tes = urutTes(await api("/api/guru/tes"));
      if (!tes.length) {
        kosongkan(isi, kartu("Belum ada tes", null, h("p.kosong", "Kuesioner ditautkan ke tes. Buat jadwal tes terlebih dahulu."),
          h("button.tombol.t-teal", { onclick: () => pergi("guru/jadwal") }, "Atur jadwal tes")));
        return;
      }
      let draf = [...PERTANYAAN_BAWAAN];
      let ada = null; // kuesioner yang sudah tersimpan untuk tes terpilih
      const pilihTes = pilihan(tes.map((t) => ({ nilai: t.tes_id, teks: `${t.judul} — ${t.nama_kelas || "Semua kelas"}` })));
      const judulK = masukan({ value: "Feedback Pembelajaran", maxlength: 150 });
      const daftarEl = h("div.daftar-pertanyaan");
      const catatan = h("div");
      const tombolTambah = h("button.tombol.t-teal", { type: "button" }, "+ Pertanyaan");
      const tombolSimpan = h("button.tombol.t-teal", { type: "button" }, "Simpan kuesioner");
      const galat = h("p.galat-teks", { hidden: true });

      function formPertanyaan(awal, simpanFn) {
        const t = areaTeks({ value: awal || "", rows: 3, maxlength: 300, required: true, style: { minHeight: "80px" } });
        modal({
          judul: awal ? "Ubah pertanyaan" : "Tambah pertanyaan", sub: "Siswa menjawab dengan skala 1 (sangat tidak setuju) sampai 5 (sangat setuju).",
          isi: isian("Pernyataan", t),
          aksi: [{ teks: "Batal" }, { teks: "Simpan", kelas: "t-teal", submit: true, klik: () => {
            if (!t.value.trim()) throw new Error("Pernyataan tidak boleh kosong.");
            simpanFn(t.value.trim());
          } }],
        });
      }
      // terkunci = kuesioner sudah diisi siswa: pertanyaan tidak bisa diubah, judul masih bisa
      const terkunci = () => !!(ada && ada.jumlahRespon > 0);
      function gambar() {
        const list = draf;
        kosongkan(daftarEl, list.length ? list.map((teks, i) => h("div", h("b", String(i + 1)), h("span", teks),
          terkunci() ? h("span") : h("span.aksi", { style: { whiteSpace: "nowrap" } },
            h("button.tautan", { type: "button", onclick: () => formPertanyaan(teks, (v) => { draf[i] = v; gambar(); }) }, "Ubah"),
            h("button.tautan.bahaya", { type: "button", style: { marginLeft: "14px" }, onclick: () => { draf.splice(i, 1); gambar(); } }, "Hapus"))))
          : h("p.kosong", "Belum ada pertanyaan. Tambahkan minimal satu."));
        tombolTambah.hidden = terkunci();
        tombolSimpan.disabled = false;
        tombolSimpan.textContent = ada ? "Simpan perubahan" : "Simpan kuesioner";
        kosongkan(catatan, terkunci()
          ? h("div.info-kotak", `Sudah diisi ${ada.jumlahRespon} siswa, jadi pertanyaannya dikunci agar rekap feedback tetap konsisten. Judul masih bisa diubah.`)
          : ada ? h("div.info-kotak", "Kuesioner ini sudah tertaut ke tes dan bisa diisi siswa setelah tes. Pertanyaan masih bisa diubah selama belum ada yang mengisi.") : null);
      }
      async function muat() {
        galat.hidden = true;
        kosongkan(daftarEl, memuat());
        ada = await api(`/api/guru/kuesioner/${pilihTes.value}`);
        judulK.value = ada ? ada.judul : "Feedback Pembelajaran";
        draf = ada ? ada.pertanyaan.map((p) => p.soal) : [...PERTANYAAN_BAWAAN];
        gambar();
      }
      tombolTambah.addEventListener("click", () => formPertanyaan("", (v) => { draf.push(v); gambar(); }));
      pilihTes.addEventListener("change", muat);
      tombolSimpan.addEventListener("click", async () => {
        galat.hidden = true;
        if (!judulK.value.trim()) { galat.textContent = "Judul kuesioner wajib diisi."; galat.hidden = false; return; }
        if (!draf.length) { galat.textContent = "Tambahkan minimal satu pertanyaan."; galat.hidden = false; return; }
        tombolSimpan.disabled = true;
        try {
          const body = { judul: judulK.value.trim(), pertanyaan: draf };
          if (ada) await put(`/api/guru/kuesioner/${pilihTes.value}`, body);
          else await post("/api/guru/kuesioner", { tes_id: Number(pilihTes.value), ...body });
          toast(ada ? "Perubahan kuesioner disimpan." : "Kuesioner disimpan dan ditautkan ke tes.");
          await muat();
        } catch (e) { galat.textContent = e.message; galat.hidden = false; tombolSimpan.disabled = false; }
      });

      kosongkan(isi, h("div.grid.g-2c.isi-penuh",
        kartu("Pertanyaan kuesioner", { aksi: tombolTambah },
          h("p", { style: { margin: "-6px 0 8px", color: "var(--redup)", fontSize: "14px" } }, "Skala jawaban siswa 1–5 dan komentar"),
          daftarEl, catatan),
        kartu("Tautkan ke tes", { class: "" }, isian("Pilih tes", pilihTes), isian("Judul kuesioner", judulK), galat, tombolSimpan)));
      await muat();
      void ctx;
    },
  });

  // ============================================================ PILIH TES (dipakai Hasil & Feedback)
  function pemilihTes(tes, { semua }, onUbah) {
    const opsi = [...(semua ? [{ nilai: "", teks: "Semua tes" }] : []), ...tes.map((t) => ({ nilai: t.tes_id, teks: `${t.judul} — ${t.nama_kelas || "Semua kelas"}` }))];
    const p = pilihan(opsi, { "aria-label": "Pilih tes", style: { maxWidth: "380px" } });
    p.addEventListener("change", () => onUbah(p.value));
    return p;
  }

  // ============================================================ HASIL SISWA
  daftar("guru", "hasil", {
    judul: "Hasil Tes Siswa",
    sub: "Nilai dan level akhir setiap siswa",
    async render(isi) {
      kosongkan(isi, memuat());
      const [tesAwal, hasil] = await Promise.all([api("/api/guru/tes"), api("/api/guru/hasil")]);
      const tes = urutTes(tesAwal);
      const wadah = h("div.isi");
      function gambar(tesId) {
        const t = tes.find((x) => String(x.tes_id) === String(tesId));
        const baris = t ? hasilUntuk(hasil, t) : hasil;
        const selesai = selesaiSaja(baris);
        const berjalan = baris.filter((r) => r.status !== "selesai");
        const nilai = selesai.map((r) => r.nilai);
        const judul = t ? `${t.judul} · ${t.nama_kelas || "Semua kelas"}` : "Semua tes";
        const unduh = () => {
          const kepala = ["Siswa", "Kelas", "Tes", "Level akhir", "Nilai", "Selesai"];
          const csv = [kepala, ...selesai.map((r) => [r.nama, r.nama_kelas || "", r.judul_tes, namaLevel(r.level_akhir), r.nilai, r.selesai || ""])]
            .map((r) => r.map((c) => (/[";\r\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : String(c))).join(";")).join("\r\n");
          unduhBerkas(`hasil-${(t ? t.judul : "semua-tes").replace(/[^\w-]+/g, "-").toLowerCase()}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
        };
        kosongkan(wadah,
          h("div.grid.g-kpi-3",
            kpi("Rata-rata nilai", nilai.length ? bulat(rata(nilai)) : "-", "teal"),
            kpi("Selesai", selesai.length, "navy"),
            kpi("Sedang mengerjakan", berjalan.length, "amber")),
          kartu(judul, { class: "isi-penuh", aksi: h("div.tombol-deret", h("span.catatan-kanan", "Level akhir ditentukan dari alur jawaban CAT"),
            selesai.length ? h("button.tombol.t-garis.t-kecil", { onclick: unduh }, "Unduh CSV") : null) },
            tabel([
              { judul: "Siswa", isi: (r) => r.nama, kelas: "tebal", utama: true },
              { judul: "Kelas", isi: (r) => r.nama_kelas || "-" },
              ...(t ? [] : [{ judul: "Tes", isi: (r) => r.judul_tes }]),
              { judul: "Level akhir", isi: (r) => (r.status === "selesai" && r.level_akhir ? pilLevel(r.level_akhir) : "-") },
              { judul: "Nilai", isi: (r) => (r.status === "selesai" ? bulat(r.nilai) : "-") },
              { judul: "Status", isi: (r) => (r.status === "selesai" ? "Selesai" : `Berjalan (${r.jumlah_soal_dijawab}/${r.jumlah_soal || "?"} soal)`) },
            ], [...baris].sort((a, b) => (a.status === b.status ? a.nama.localeCompare(b.nama) : a.status === "selesai" ? -1 : 1)),
            { kosong: "Belum ada siswa yang mengerjakan tes ini." })));
      }
      const pemilih = pemilihTes(tes, { semua: true }, gambar);
      kosongkan(isi, h("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } },
        h("label.label-isian", { for: "pilih-tes-hasil" }, "Tes:"), Object.assign(pemilih, { id: "pilih-tes-hasil" })), wadah);
      gambar("");
    },
  });

  // ============================================================ REKAP FEEDBACK
  daftar("guru", "feedback", {
    judul: "Rekap Feedback",
    sub: "Ringkasan umpan balik siswa terhadap pembelajaran",
    async render(isi) {
      kosongkan(isi, memuat());
      const tes = urutTes(await api("/api/guru/tes"));
      if (!tes.length) { kosongkan(isi, kartu(null, null, h("p.kosong", "Belum ada tes, jadi belum ada feedback."))); return; }
      const wadah = h("div.isi");
      async function gambar(tesId) {
        kosongkan(wadah, memuat());
        try {
          const fb = await api(`/api/guru/feedback-summary/${tesId}`);
          const terisi = fb.rataRata.filter((r) => r.rata !== null);
          const total = terisi.length ? rata(terisi.map((r) => r.rata)) : null;
          kosongkan(wadah,
            h("div.grid.g-kpi-2",
              kpi("Rata-rata keseluruhan", total === null ? "-" : bulat1(total) + "/5", "teal"),
              kpi("Jumlah responden", fb.jumlahResponden, "navy")),
            h("div.grid.g-2b.isi-penuh", { style: { gridTemplateColumns: "1.18fr 1fr" } },
              kartu("Rata-rata per aspek (skala 1–5)", null,
                fb.rataRata.length
                  ? h("div.batang-daftar", { style: { gap: "12px" } }, fb.rataRata.map((r) => {
                    const b = batang(r.pernyataan, r.rata || 0, 5, r.rata === null ? "-" : bulat1(r.rata));
                    b.classList.add("atas");
                    return b;
                  }))
                  : h("p.kosong", fb.ada === false ? "Tes ini belum punya kuesioner." : "Belum ada pertanyaan.")),
              kartu("Masukan terbuka", { catatan: fb.komentar.length ? `${fb.komentar.length} komentar` : null },
                fb.komentar.length
                  ? h("div", fb.komentar.map((k) => h("div.komentar-kotak",
                      k.nama ? h("b", { style: { display: "block", fontSize: "13px", marginBottom: "2px" } }, [k.nama, k.nama_kelas].filter(Boolean).join(" · ")) : null,
                      k.komentar)))
                  : h("p.kosong", "Belum ada komentar dari siswa."),
                h("small", { style: { color: "var(--redup)" } }, fb.anonim
                  ? "Komentar ditampilkan tanpa nama dan dalam urutan acak (kuesioner anonim)."
                  : "Kuesioner tidak anonim: nama siswa ditampilkan. Ubah di Pengaturan admin."))));
        } catch (e) { kosongkan(wadah, h("p.galat-teks", e.message)); }
      }
      const pemilih = pemilihTes(tes, { semua: false }, gambar);
      kosongkan(isi, h("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } },
        h("label.label-isian", { for: "pilih-tes-fb" }, "Tes:"), Object.assign(pemilih, { id: "pilih-tes-fb" })), wadah);
      // Bawaan: tes terbaru yang sudah punya responden (kalau belum ada, tes terbaru)
      const ringkas = await Promise.all(tes.map((t) => api(`/api/guru/feedback-summary/${t.tes_id}`).catch(() => ({ jumlahResponden: 0 }))));
      const i = Math.max(0, ringkas.findIndex((f) => f.jumlahResponden > 0));
      pemilih.value = String(tes[i].tes_id);
      await gambar(tes[i].tes_id);
    },
  });
})();
