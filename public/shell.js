// shell.js — halaman login, kerangka aplikasi (sidebar + kepala), dan router hash.
// Alamat halaman: #/<peran>/<halaman>[/<param>], mis. #/guru/soal atau #/siswa/tes/3
(function (global) {
  "use strict";
  const { h, kosongkan, sesi, lokal, post, inisial } = global.UI;

  const KUNCI_SESI = "evalsmk.sesi";
  const NAMA_PERAN = { admin: "Admin", guru: "Guru", siswa: "Siswa" };
  const MENU = {
    admin: [["dashboard", "Dashboard"], ["pengguna", "Kelola Pengguna"], ["kelas", "Kelas & Mapel"], ["pengaturan", "Pengaturan"]],
    guru: [["dashboard", "Dashboard"], ["soal", "Bank Soal"], ["jadwal", "Jadwal Evaluasi"], ["kuesioner", "Kuesioner"], ["hasil", "Hasil Siswa"], ["feedback", "Rekap Feedback"]],
    siswa: [["beranda", "Beranda"], ["evaluasi", "Evaluasi Saya"], ["hasil", "Hasil"], ["kuesioner", "Kuesioner"]],
  };
  // Halaman yang tidak punya menu sendiri disorot di bawah menu induknya
  const INDUK = { "siswa/tes": "evaluasi" };

  const RUTE = { admin: {}, guru: {}, siswa: {} };
  // def: { judul, sub, render(wadah, param, ctx), penuh? }
  function daftar(peran, kunci, def) { RUTE[peran][kunci] = def; }

  let pembersih = [];
  function saatKeluar(fn) { pembersih.push(fn); }
  function bersihkan() { pembersih.forEach((fn) => { try { fn(); } catch { /* abaikan */ } }); pembersih = []; }

  // ------------------------------------------------------------------ sesi login
  function pulihSesi() {
    const s = lokal.ambil(KUNCI_SESI);
    if (s && s.token && s.user) { sesi.token = s.token; sesi.user = s.user; }
  }
  function simpanSesi(token, user) {
    sesi.token = token; sesi.user = user;
    lokal.simpan(KUNCI_SESI, { token, user });
  }
  function hapusSesi() {
    sesi.token = null; sesi.user = null;
    lokal.hapus(KUNCI_SESI);
  }
  async function keluar() {
    try { await post("/api/auth/logout"); } catch { /* token stateless, cukup dibuang */ }
    hapusSesi();
    pergi("");
  }
  sesi.onBerakhir = () => {
    hapusSesi();
    global.UI.toast("Sesi login berakhir. Silakan masuk lagi.", "galat");
    tampilkan();
  };

  // ------------------------------------------------------------------ navigasi
  function pergi(alamat) {
    const tujuan = "#/" + alamat.replace(/^#?\/?/, "");
    if (location.hash === tujuan) tampilkan();
    else location.hash = tujuan;
  }
  function bacaHash() {
    const bagian = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    return { peran: bagian[0], halaman: bagian[1], param: bagian[2] };
  }

  // ------------------------------------------------------------------ login
  function layarLogin() {
    let peran = lokal.ambil("evalsmk.peranTerakhir", "siswa");
    if (!NAMA_PERAN[peran]) peran = "siswa";
    const labelUser = h("label", { for: "login-user" });
    const inputUser = h("input.kontrol#login-user", { autocomplete: "username", required: true, autocapitalize: "none", spellcheck: "false" });
    const inputSandi = h("input.kontrol#login-sandi", { type: "password", autocomplete: "current-password", required: true });
    const galat = h("p.galat-teks", { role: "alert", hidden: true });
    const tombol = h("button.tombol.t-navy.t-penuh", { type: "submit", style: { marginTop: "10px" } }, "Masuk");

    const tab = h("div.tab-peran", { role: "group", "aria-label": "Pilih peran" },
      ["admin", "guru", "siswa"].map((p) => h("button", {
        type: "button", "data-peran": p, "aria-pressed": String(p === peran),
        onclick: () => { peran = p; perbaruiTab(); inputUser.focus(); },
      }, NAMA_PERAN[p])));
    function perbaruiTab() {
      tab.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.peran === peran)));
      labelUser.textContent = peran === "siswa" ? "NIS / Username" : "Username";
      galat.hidden = true;
    }
    perbaruiTab();

    async function masuk(e) {
      e.preventDefault();
      galat.hidden = true;
      tombol.disabled = true; tombol.textContent = "Memeriksa…";
      try {
        // Server memeriksa tab peran (role); pemeriksaan di bawah hanya cadangan
        const data = await post("/api/auth/login", { username: inputUser.value.trim(), password: inputSandi.value, role: peran });
        if (data.user.role !== peran) {
          throw new Error(`Akun ini terdaftar sebagai ${NAMA_PERAN[data.user.role] || data.user.role}. Pilih tab ${NAMA_PERAN[data.user.role] || "yang sesuai"} lalu masuk lagi.`);
        }
        lokal.simpan("evalsmk.peranTerakhir", peran);
        simpanSesi(data.token, data.user);
        pergi(peran + "/" + MENU[peran][0][0]);
      } catch (err) {
        galat.textContent = err.message;
        galat.hidden = false;
        tombol.disabled = false; tombol.textContent = "Masuk";
      }
    }

    return h("main.login",
      h("section.login-kiri",
        h("div.merek", h("span.merek-ikon", "E"), "EvalSMK"),
        h("div.login-isi",
          h("h1", "Evaluasi yang menyesuaikan kemampuan setiap siswa."),
          h("p", "Bank soal, tes adaptif CAT, dan kuesioner feedback dalam satu sistem untuk SMK.")),
        h("p.login-kaki", "Capstone Project · Sistem Informasi · Universitas Terbuka")),
      h("section.login-kanan",
        h("form.login-form", { onsubmit: masuk, novalidate: false },
          h("h2", "Masuk"),
          h("p.sub", "Pilih peran lalu masuk ke akun Anda."),
          tab,
          h("div.isian", labelUser, inputUser),
          h("div.isian", h("label", { for: "login-sandi" }, "Kata sandi"), inputSandi),
          galat,
          tombol)));
  }

  // ------------------------------------------------------------------ ubah kata sandi
  function ubahSandi() {
    const { masukan, isian, modal, toast } = global.UI;
    const lama = masukan({ type: "password", autocomplete: "current-password", required: true });
    const baru = masukan({ type: "password", autocomplete: "new-password", required: true, minlength: 6 });
    const ulang = masukan({ type: "password", autocomplete: "new-password", required: true });
    modal({
      judul: "Ubah kata sandi", sub: "Gunakan minimal 6 karakter.",
      isi: h("div", isian("Kata sandi lama", lama), isian("Kata sandi baru", baru), isian("Ulangi kata sandi baru", ulang)),
      aksi: [{ teks: "Batal" }, { teks: "Simpan", kelas: "t-teal", submit: true, memuat: "Menyimpan…", klik: async () => {
        if (baru.value.length < 6) throw new Error("Kata sandi baru minimal 6 karakter.");
        if (baru.value !== ulang.value) throw new Error("Ulangan kata sandi baru tidak sama.");
        await post("/api/auth/ubah-sandi", { sandiLama: lama.value, sandiBaru: baru.value });
        toast("Kata sandi berhasil diubah.");
      } }],
    });
  }

  // ------------------------------------------------------------------ kerangka
  function menuPengguna(user) {
    let terbuka = false;
    const daftarMenu = h("div.pengguna-menu", { hidden: true, role: "menu" },
      h("div.info", "Masuk sebagai ", h("b", NAMA_PERAN[user.role])),
      h("button", { type: "button", role: "menuitem", onclick: () => { atur(false); ubahSandi(); } }, "Ubah kata sandi"),
      h("button", { type: "button", role: "menuitem", onclick: keluar }, "Keluar"));
    const tombol = h("button.pengguna-tombol", {
      type: "button", "aria-haspopup": "menu", "aria-expanded": "false",
      onclick: (e) => { e.stopPropagation(); atur(!terbuka); },
    }, h("span.avatar", inisial(user.nama)), h("span.nama", user.nama));
    function atur(v) { terbuka = v; daftarMenu.hidden = !v; tombol.setAttribute("aria-expanded", String(v)); }
    const tutupLuar = () => atur(false);
    document.addEventListener("click", tutupLuar);
    saatKeluar(() => document.removeEventListener("click", tutupLuar));
    return h("div.pengguna", tombol, daftarMenu);
  }

  function kerangka(user, aktif, def, param) {
    const peran = user.role;
    const judul = h("h1", typeof def.judul === "function" ? def.judul(user) : def.judul);
    const sub = h("p", typeof def.sub === "function" ? def.sub(user) : def.sub || "");
    const isi = h("div.isi");
    const app = h("div.app");
    const menuAktif = INDUK[peran + "/" + aktif] || aktif;
    const sidebar = h("aside.sidebar", { "aria-label": "Navigasi utama" },
      h("div.merek", h("span.merek-ikon", "E"), "EvalSMK"),
      h("nav.menu", MENU[peran].map(([k, label]) => h("a", {
        href: `#/${peran}/${k}`, "aria-current": k === menuAktif ? "page" : null,
        onclick: () => app.classList.remove("menu-buka"),
      }, label))),
      h("div.sidebar-kaki", h("small", "Masuk sebagai"), h("b", NAMA_PERAN[peran])));
    const tombolMenu = h("button.tombol-menu", { type: "button", "aria-label": "Buka menu", onclick: (e) => { e.stopPropagation(); app.classList.toggle("menu-buka"); } },
      h("span", { "aria-hidden": "true" }, "☰"));
    app.addEventListener("click", (e) => { if (app.classList.contains("menu-buka") && !sidebar.contains(e.target)) app.classList.remove("menu-buka"); });
    kosongkan(app, sidebar,
      h("main.main",
        h("header.kepala", h("div.kepala-kiri", tombolMenu, h("div", judul, sub)), menuPengguna(user)),
        isi));
    const ctx = {
      user, param,
      aturJudul: (t) => { judul.textContent = t; document.title = t + " — EvalSMK"; },
      aturSub: (t) => { sub.textContent = t; },
      muatUlang: () => tampilkan(),
    };
    document.title = judul.textContent + " — EvalSMK";
    return { app, isi, ctx };
  }

  // ------------------------------------------------------------------ tampilkan halaman
  function tampilkan() {
    bersihkan();
    const akar = document.getElementById("app");
    const user = sesi.user;
    if (!user) {
      document.title = "Masuk — EvalSMK";
      kosongkan(akar, layarLogin());
      const u = document.getElementById("login-user");
      if (u) u.focus();
      return;
    }
    const { peran, halaman, param } = bacaHash();
    if (peran !== user.role || !RUTE[user.role][halaman]) {
      // Alamat tidak cocok dengan peran yang sedang login: arahkan ke halaman awal peran tsb.
      history.replaceState(null, "", `#/${user.role}/${MENU[user.role][0][0]}`);
      return tampilkan();
    }
    const def = RUTE[user.role][halaman];
    if (def.penuh) {
      const wadah = h("div");
      kosongkan(akar, wadah);
      def.render(wadah, param, { user, param, muatUlang: tampilkan });
      return;
    }
    const { app, isi, ctx } = kerangka(user, halaman, def, param);
    kosongkan(akar, app);
    window.scrollTo(0, 0);
    Promise.resolve(def.render(isi, param, ctx)).catch((e) => {
      kosongkan(isi, global.UI.galatKotak(e, tampilkan));
    });
  }

  global.Shell = { daftar, pergi, tampilkan, pulihSesi, saatKeluar, keluar, ubahSandi, NAMA_PERAN, MENU };
})(window);
