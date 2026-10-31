// hal-admin.js — Dashboard, Kelola Pengguna, Kelas & Mapel, Pengaturan
(function () {
  "use strict";
  const { h, kosongkan, api, post, put, hapus, kartu, kpi, batang, tabel, memuat, toast, modal, konfirmasi,
    isian, masukan, pilihan, pilLevel, sesi } = window.UI;
  const { daftar, pergi, NAMA_PERAN } = window.Shell;

  // ============================================================ DASHBOARD
  daftar("admin", "dashboard", {
    judul: "Dashboard Admin",
    sub: "Ringkasan data pengguna, kelas, dan mata pelajaran",
    async render(isi) {
      kosongkan(isi, memuat());
      const [users, kelas, mapel, tes] = await Promise.all([
        api("/api/admin/users"), api("/api/admin/kelas"), api("/api/admin/mapel"), api("/api/guru/tes").catch(() => []),
      ]);
      const hitung = (r) => users.filter((u) => u.role === r).length;
      const total = users.length;

      // Aktivitas terbaru: data terakhir yang ditambahkan untuk tiap jenis (ID terbesar = paling baru)
      const terakhir = (arr, kunci) => arr.reduce((a, b) => (!a || Number(b[kunci]) > Number(a[kunci]) ? b : a), null);
      const siswaBaru = terakhir(users.filter((u) => u.role === "siswa"), "users_id");
      const guruBaru = terakhir(users.filter((u) => u.role === "guru"), "users_id");
      const tesBaru = terakhir(tes, "tes_id");
      const kelasBaru = terakhir(kelas, "kelas_id");
      const aktivitas = [
        siswaBaru && ["Akun siswa baru ditambahkan", [siswaBaru.nama, siswaBaru.nama_kelas].filter(Boolean).join(" · ")],
        tesBaru && ["Jadwal tes dibuat oleh guru", tesBaru.judul],
        kelasBaru && ["Kelas baru ditambahkan", kelasBaru.nama_kelas],
        guruBaru && ["Akun guru ditambahkan", guruBaru.nama],
      ].filter(Boolean).slice(0, 4);

      kosongkan(isi,
        h("div.grid.g-kpi-5",
          kpi("Total pengguna", total, "teal"), kpi("Guru", hitung("guru"), "navy"), kpi("Siswa", hitung("siswa"), "teal"),
          kpi("Kelas", kelas.length, "amber"), kpi("Mapel", mapel.length, "navy")),
        h("div.grid.g-3.isi-penuh",
          kartu("Komposisi pengguna", null,
            h("div.batang-daftar",
              batang("Siswa", hitung("siswa"), total), batang("Guru", hitung("guru"), total), batang("Admin", hitung("admin"), total)),
            h("div.info-kotak", "Hak akses berbeda untuk admin, guru, dan siswa.")),
          kartu("Aktivitas terbaru", null,
            aktivitas.length
              ? h("div.daftar-baris", aktivitas.map(([j, s]) => h("div", h("b", j), h("small", s))))
              : h("p.kosong", "Belum ada aktivitas.")),
          kartu("Pintasan", null,
            h("div.tumpuk", { style: { gap: "11px" } },
              h("button.tombol.t-teal.t-penuh", { onclick: () => pergi("admin/pengguna") }, "Kelola pengguna"),
              h("button.tombol.t-oranye.t-penuh", { onclick: () => pergi("admin/kelas") }, "Kelas & mapel")))));
    },
  });

  // ============================================================ KELOLA PENGGUNA
  function formPengguna(kelasList, awal) {
    const baru = !awal;
    const f = {
      nama: masukan({ value: awal ? awal.nama : "", required: true, maxlength: 100 }),
      username: masukan({ value: awal ? awal.username : "", required: baru, disabled: !baru, autocomplete: "off", autocapitalize: "none" }),
      role: pilihan(["siswa", "guru", "admin"].map((r) => ({ nilai: r, teks: NAMA_PERAN[r] })), {}, awal ? awal.role : "siswa"),
      kelas: pilihan([{ nilai: "", teks: "— Pilih kelas —" }, ...kelasList.map((k) => ({ nilai: k.kelas_id, teks: k.nama_kelas }))], {}, awal ? awal.kelas_id || "" : ""),
      sandi: masukan({ type: "password", required: baru, autocomplete: "new-password", minlength: 6 }),
      aktif: h("input.centang", { type: "checkbox", checked: awal ? !!awal.aktif : true, "aria-label": "Akun aktif" }),
    };
    const diriSendiri = !!awal && awal.users_id === sesi.user.users_id;
    if (diriSendiri) { f.role.disabled = true; f.aktif.disabled = true; }
    const isianKelas = isian("Kelas", f.kelas);
    const sinkron = () => { isianKelas.hidden = f.role.value !== "siswa"; };
    f.role.addEventListener("change", sinkron);
    sinkron();
    const el = h("div",
      isian("Nama lengkap", f.nama),
      isian(baru ? "Username / NIS" : "Username (tidak dapat diubah)", f.username),
      h("div.baris-isian", isian("Peran", f.role), isianKelas),
      isian(baru ? "Kata sandi" : "Kata sandi baru (kosongkan jika tidak diganti)", f.sandi, "Minimal 6 karakter."),
      baru ? null : h("div.centang-baris", { style: { borderBottom: 0, paddingBottom: 0 } },
        h("div", h("b", "Akun aktif"), h("small", diriSendiri ? "Akunmu sendiri tidak bisa dinonaktifkan." : "Akun nonaktif tidak bisa masuk; datanya tetap tersimpan.")),
        f.aktif));
    function data() {
      const nama = f.nama.value.trim();
      if (!nama) throw new Error("Nama wajib diisi.");
      if (baru && !f.username.value.trim()) throw new Error("Username wajib diisi.");
      if ((baru || f.sandi.value) && f.sandi.value.length < 6) throw new Error("Kata sandi minimal 6 karakter.");
      if (f.role.value === "siswa" && !f.kelas.value) throw new Error("Pilih kelas untuk akun siswa.");
      const d = { nama, role: f.role.value, kelas_id: f.role.value === "siswa" ? Number(f.kelas.value) : null };
      if (baru) d.username = f.username.value.trim();
      if (f.sandi.value) d.password = f.sandi.value;
      if (!baru && !diriSendiri) d.aktif = f.aktif.checked;
      if (diriSendiri) d.role = awal.role;
      return d;
    }
    return { el, data };
  }

  daftar("admin", "pengguna", {
    judul: "Kelola Pengguna",
    sub: "Atur akun admin, guru, dan siswa",
    async render(isi, _p, ctx) {
      kosongkan(isi, memuat());
      const [users, kelasList] = await Promise.all([api("/api/admin/users"), api("/api/admin/kelas")]);
      let saringPeran = "";
      let saringStatus = "";
      let cari = "";

      const tambah = () => {
        const form = formPengguna(kelasList);
        modal({
          judul: "Tambah pengguna", sub: "Buat akun baru untuk admin, guru, atau siswa.", isi: form.el,
          aksi: [{ teks: "Batal" }, { teks: "Simpan", kelas: "t-teal", submit: true, memuat: "Menyimpan…",
            klik: async () => { await post("/api/admin/users", form.data()); toast("Pengguna ditambahkan."); ctx.muatUlang(); } }],
        });
      };
      const ubah = (u) => {
        const form = formPengguna(kelasList, u);
        modal({
          judul: "Ubah pengguna", sub: u.username, isi: form.el,
          aksi: [{ teks: "Batal" }, { teks: "Simpan perubahan", kelas: "t-teal", submit: true, memuat: "Menyimpan…",
            klik: async () => { await put(`/api/admin/users/${u.users_id}`, form.data()); toast("Perubahan disimpan."); ctx.muatUlang(); } }],
        });
      };
      const buang = async (u) => {
        const ya = await konfirmasi("Hapus pengguna?", `Akun "${u.nama}" (${u.username}) akan dihapus permanen. Akun yang sudah punya soal, hasil tes, atau feedback tidak dapat dihapus; nonaktifkan saja akunnya.`);
        if (!ya) return;
        try { await hapus(`/api/admin/users/${u.users_id}`); toast("Pengguna dihapus."); ctx.muatUlang(); }
        catch (e) { toast(e.message, "galat"); }
      };
      const ubahStatus = async (u) => {
        const aktifkan = !u.aktif;
        if (!aktifkan && !(await konfirmasi("Nonaktifkan akun?", `"${u.nama}" tidak akan bisa masuk sampai diaktifkan lagi. Data tes dan soalnya tetap tersimpan.`, "Nonaktifkan", "t-oranye"))) return;
        try { await put(`/api/admin/users/${u.users_id}`, { aktif: aktifkan }); toast(aktifkan ? "Akun diaktifkan." : "Akun dinonaktifkan."); ctx.muatUlang(); }
        catch (e) { toast(e.message, "galat"); }
      };

      const wadahTabel = h("div");
      function gambar() {
        const q = cari.toLowerCase();
        const baris = users.filter((u) => (!saringPeran || u.role === saringPeran) && (!saringStatus || String(u.aktif ? 1 : 0) === saringStatus) &&
          (!q || u.nama.toLowerCase().includes(q) || String(u.username).toLowerCase().includes(q)));
        kosongkan(wadahTabel, tabel([
          { judul: "Nama", isi: (u) => u.nama, kelas: "tebal", utama: true },
          { judul: "Username", isi: (u) => u.username },
          { judul: "Peran", isi: (u) => NAMA_PERAN[u.role] },
          { judul: "Kelas", isi: (u) => u.nama_kelas || "-" },
          { judul: "Status", isi: (u) => h("span", { class: "pil " + (u.aktif ? "pil-1" : "pil-abu") }, u.aktif ? "Aktif" : "Nonaktif") },
          { judul: "Aksi", kelas: "aksi", isi: (u) => h("span",
            h("button.tautan", { type: "button", onclick: () => ubah(u) }, "Ubah"),
            u.users_id === sesi.user.users_id ? null : h("button.tautan", { type: "button", onclick: () => ubahStatus(u) }, u.aktif ? "Nonaktifkan" : "Aktifkan"),
            u.users_id === sesi.user.users_id ? null : h("button.tautan.bahaya", { type: "button", onclick: () => buang(u) }, "Hapus")) },
        ], baris, { kosong: "Tidak ada pengguna yang cocok." }));
      }
      gambar();

      kosongkan(isi, kartu("Daftar pengguna", { class: "isi-penuh", aksi: h("button.tombol.t-teal", { onclick: tambah }, "Tambah pengguna") },
        h("div.alat-saring",
          h("input.kontrol", { type: "search", placeholder: "Cari nama atau username…", "aria-label": "Cari pengguna", oninput: (e) => { cari = e.target.value; gambar(); } }),
          pilihan([{ nilai: "", teks: "Semua peran" }, { nilai: "admin", teks: "Admin" }, { nilai: "guru", teks: "Guru" }, { nilai: "siswa", teks: "Siswa" }],
            { "aria-label": "Saring peran", onchange: (e) => { saringPeran = e.target.value; gambar(); } }),
          pilihan([{ nilai: "", teks: "Semua status" }, { nilai: "1", teks: "Aktif" }, { nilai: "0", teks: "Nonaktif" }],
            { "aria-label": "Saring status", onchange: (e) => { saringStatus = e.target.value; gambar(); } })),
        wadahTabel));
    },
  });

  // ============================================================ KELAS & MAPEL
  daftar("admin", "kelas", {
    judul: "Kelas & Mata Pelajaran",
    sub: "Master data untuk jadwal tes dan bank soal",
    async render(isi, _p, ctx) {
      kosongkan(isi, memuat());
      const [kelas, mapel] = await Promise.all([api("/api/admin/kelas"), api("/api/admin/mapel")]);

      const formKelas = (awal) => {
        const nama = masukan({ value: awal ? awal.nama_kelas : "", required: true, placeholder: "mis. XI TKJ 1", maxlength: 60 });
        const jurusan = masukan({ value: awal ? awal.jurusan || "" : "", placeholder: "mis. Teknik Komputer & Jaringan", maxlength: 100 });
        modal({
          judul: awal ? "Ubah kelas" : "Tambah kelas",
          isi: h("div", isian("Nama kelas", nama), isian("Jurusan", jurusan)),
          aksi: [{ teks: "Batal" }, { teks: "Simpan", kelas: "t-teal", submit: true, memuat: "Menyimpan…", klik: async () => {
            const body = { nama_kelas: nama.value.trim(), jurusan: jurusan.value.trim() };
            if (!body.nama_kelas) throw new Error("Nama kelas wajib diisi.");
            if (awal) await put(`/api/admin/kelas/${awal.kelas_id}`, body); else await post("/api/admin/kelas", body);
            toast(awal ? "Kelas diperbarui." : "Kelas ditambahkan."); ctx.muatUlang();
          } }],
        });
      };
      const formMapel = (awal) => {
        const nama = masukan({ value: awal ? awal.nama_mapel : "", required: true, placeholder: "mis. Dasar Jaringan Komputer", maxlength: 100 });
        modal({
          judul: awal ? "Ubah mata pelajaran" : "Tambah mata pelajaran", isi: isian("Nama mapel", nama),
          aksi: [{ teks: "Batal" }, { teks: "Simpan", kelas: "t-teal", submit: true, memuat: "Menyimpan…", klik: async () => {
            if (!nama.value.trim()) throw new Error("Nama mapel wajib diisi.");
            if (awal) await put(`/api/admin/mapel/${awal.mapel_id}`, { nama_mapel: nama.value.trim() });
            else await post("/api/admin/mapel", { nama_mapel: nama.value.trim() });
            toast(awal ? "Mapel diperbarui." : "Mapel ditambahkan."); ctx.muatUlang();
          } }],
        });
      };
      const buang = async (jenis, url, label) => {
        const ya = await konfirmasi(`Hapus ${jenis}?`, `"${label}" akan dihapus. ${jenis === "kelas" ? "Kelas yang masih punya siswa atau jadwal tes" : "Mapel yang masih punya soal atau jadwal tes"} tidak dapat dihapus.`);
        if (!ya) return;
        try { await hapus(url); toast(`${jenis[0].toUpperCase() + jenis.slice(1)} dihapus.`); ctx.muatUlang(); }
        catch (e) { toast(e.message, "galat"); }
      };

      kosongkan(isi, h("div.grid.g-2e.isi-penuh",
        kartu("Data kelas", { aksi: h("button.tombol.t-teal", { onclick: () => formKelas() }, "+ Kelas") },
          tabel([
            { judul: "Kelas", isi: (k) => k.nama_kelas, kelas: "tebal", utama: true },
            { judul: "Jurusan", isi: (k) => k.jurusan || "-" },
            { judul: "Aksi", kelas: "aksi", isi: (k) => h("span",
              h("button.tautan", { type: "button", onclick: () => formKelas(k) }, "Ubah"),
              h("button.tautan.bahaya", { type: "button", onclick: () => buang("kelas", `/api/admin/kelas/${k.kelas_id}`, k.nama_kelas) }, "Hapus")) },
          ], kelas, { kosong: "Belum ada kelas." })),
        kartu("Mata pelajaran", { aksi: h("button.tombol.t-oranye", { onclick: () => formMapel() }, "+ Mapel") },
          tabel([
            { judul: "Nama mapel", isi: (m) => m.nama_mapel, kelas: "tebal", utama: true },
            { judul: "Aksi", kelas: "aksi", isi: (m) => h("span",
              h("button.tautan", { type: "button", onclick: () => formMapel(m) }, "Ubah"),
              h("button.tautan.bahaya", { type: "button", onclick: () => buang("mapel", `/api/admin/mapel/${m.mapel_id}`, m.nama_mapel) }, "Hapus")) },
          ], mapel, { kosong: "Belum ada mata pelajaran." }))));
    },
  });

  // ============================================================ PENGATURAN
  // Kotak centang dan angka disimpan otomatis saat diubah; profil sekolah lewat tombol Simpan.
  daftar("admin", "pengaturan", {
    judul: "Pengaturan",
    sub: "Atur profil sekolah dan aturan evaluasi",
    async render(isi) {
      kosongkan(isi, memuat());
      let p = await api("/api/pengaturan");

      async function simpan(perubahan, pesan = "Pengaturan disimpan.") {
        try { p = await put("/api/pengaturan", perubahan); window.UI.pengaturan = p; toast(pesan); return true; }
        catch (e) { toast(e.message, "galat"); return false; }
      }
      function barisCentang(kunci, judul, ket) {
        const c = h("input.centang", { type: "checkbox", checked: !!p[kunci], "aria-label": judul });
        c.addEventListener("change", async () => {
          c.disabled = true;
          if (!(await simpan({ [kunci]: c.checked }))) c.checked = !c.checked;
          c.disabled = false;
        });
        return h("div.centang-baris", h("div", h("b", judul), h("small", ket)), c);
      }
      function angka(kunci, label, min, max) {
        const el = masukan({ type: "number", min, max, value: p[kunci], inputmode: "numeric", style: { width: "142px" } });
        el.addEventListener("change", async () => {
          const n = Number(el.value);
          if (!Number.isInteger(n) || n < min || n > max) { toast(`${label} harus ${min}–${max}.`, "galat"); el.value = p[kunci]; return; }
          if (!(await simpan({ [kunci]: n }))) el.value = p[kunci];
        });
        return h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "8px" } },
          h("label.label-isian", { for: el.id = "p-" + kunci }, label), el);
      }

      const namaSekolah = masukan({ value: p.nama_sekolah, maxlength: 150, placeholder: "mis. SMK Negeri 1 Contoh" });
      const tahunAjaran = masukan({ value: p.tahun_ajaran, maxlength: 9, placeholder: "2026/2027" });
      const tombolProfil = h("button.tombol.t-teal", { type: "submit" }, "Simpan");
      const formProfil = h("form", {
        onsubmit: async (e) => {
          e.preventDefault();
          tombolProfil.disabled = true;
          await simpan({ nama_sekolah: namaSekolah.value.trim(), tahun_ajaran: tahunAjaran.value.trim() }, "Profil sekolah disimpan.");
          tombolProfil.disabled = false;
        },
      }, isian("Nama sekolah", namaSekolah), isian("Tahun ajaran", tahunAjaran), tombolProfil);

      kosongkan(isi, h("div.grid.g-3x.isi-penuh",
        kartu("Profil sekolah", null, formProfil),
        kartu("Aturan tes adaptif (CAT)", null,
          h("div", { style: { display: "flex", alignItems: "center", gap: "10px", color: "var(--redup)", marginBottom: "10px" } }, "Level soal awal", pilLevel(2)),
          angka("jumlah_soal_bawaan", "Jumlah soal bawaan", 1, 200),
          angka("durasi_bawaan", "Durasi (menit)", 1, 600),
          barisCentang("jangan_ulang_soal", "Jangan ulang soal", "Soal yang sudah diterima siswa di tes lain diberikan paling akhir"),
          barisCentang("bobot_skor", "Bobot skor per level", "Soal sulit bernilai lebih tinggi (mudah 1, sedang 2, sulit 3)")),
        kartu("Umum", null,
          barisCentang("acak_opsi", "Acak urutan pilihan jawaban", "Opsi A–D diacak untuk tiap siswa"),
          barisCentang("kuesioner_anonim", "Kuesioner anonim", "Nama siswa tidak ditampilkan ke guru"),
          barisCentang("tampilkan_nilai", "Tampilkan nilai langsung", "Siswa melihat nilai setelah tes selesai"),
          h("button.tombol.t-oranye", { style: { marginTop: "18px" }, onclick: () => window.Shell.ubahSandi() }, "Ubah kata sandi"))));
    },
  });
})();
