// app.js — SPA tanpa framework. Semua komunikasi lewat fetch() ke /api/*.

const state = {
  timerId: null,
  deadlineMs: 0,
  token: null,
  user: null, // { users_id, nama, role, kelas_id }
  screen: "login",
  adminTab: "pengguna",
  guruTab: "soal",
  // data cache ringan per layar
  kelasList: [],
  mapelList: [],
  // siswa test-taking
  tesAktif: null,
  sesiId: null,
  soalAktif: null,
  progress: null,
  hasilTes: null,
  kuesionerAktif: null,
  jawabanKuesioner: {},
};

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function fmtTanggal(s) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("id-ID"); } catch { return s; }
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = "Bearer " + state.token;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan pada server.");
  return data;
}

function render() {
  clearInterval(state.timerId); // hitung mundur hanya hidup di layar tes
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.appendChild(SCREENS[state.screen]());
  if (state.screen === "siswa-test") mulaiTimer();
}

// Escape teks dari pengguna (soal, komentar, nama) sebelum disisipkan ke HTML,
// supaya karakter seperti < atau & tidak merusak tampilan dan tidak bisa
// dipakai menyisipkan skrip.
function esc(v) {
  return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function topbar(tabsEl) {
  const bar = el(`
    <div>
      <div class="topbar">
        <div class="mark">SIEP <span>SMK</span></div>
        <div class="who"></div>
      </div>
    </div>
  `);
  const who = bar.querySelector(".who");
  if (state.user) {
    who.appendChild(el(`<span>${esc(state.user.nama)} · <span class="badge role">${state.user.role}</span></span>`));
    const out = el(`<button class="link">Keluar</button>`);
    out.addEventListener("click", logout);
    who.appendChild(out);
  }
  if (tabsEl) bar.appendChild(tabsEl);
  return bar;
}

function tabs(items, activeKey, onChange) {
  const wrap = el(`<div class="tabs"></div>`);
  items.forEach(([key, label]) => {
    const t = el(`<button class="tab${key === activeKey ? " active" : ""}">${label}</button>`);
    t.addEventListener("click", () => onChange(key));
    wrap.appendChild(t);
  });
  return wrap;
}

async function logout() {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  state.token = null; state.user = null; state.screen = "login";
  render();
}

// ============================================================ LOGIN ============================================================
function screenLogin() {
  const root = el(`
    <div class="login-wrap">
      <span class="eyebrow">Sistem Evaluasi Pembelajaran</span>
      <h1 class="display">SIEP SMK</h1>
      <p class="lead">Masuk sesuai peranmu untuk mengelola atau mengerjakan tes adaptif.</p>
      <div class="login-card" style="margin-top:22px;">
        <div class="field"><label>Username</label><input id="lg-user" type="text" /></div>
        <div class="field"><label>Password</label><input id="lg-pass" type="password" /></div>
        <div id="lg-err"></div>
        <button class="btn btn-primary btn-block" id="lg-submit">Masuk</button>
      </div>
      <div class="demo-accounts">
        Akun contoh — Admin: <code>admin / admin123</code><br/>
        Guru: <code>guru1 / guru123</code><br/>
        Siswa: <code>siswa1 / siswa123</code>
      </div>
    </div>
  `);
  const submit = async () => {
    const username = root.querySelector("#lg-user").value.trim();
    const password = root.querySelector("#lg-pass").value;
    const errBox = root.querySelector("#lg-err");
    errBox.innerHTML = "";
    if (!username || !password) {
      errBox.appendChild(el(`<p class="notice">Username dan password wajib diisi.</p>`));
      return;
    }
    try {
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      state.token = data.token; state.user = data.user;
      if (data.user.role === "admin") state.screen = "admin";
      else if (data.user.role === "guru") state.screen = "guru";
      else state.screen = "siswa-tes-list";
      render();
    } catch (e) {
      errBox.appendChild(el(`<p class="notice">${esc(e.message)}</p>`));
    }
  };
  root.querySelector("#lg-submit").addEventListener("click", submit);
  root.querySelector("#lg-pass").addEventListener("keydown", (ev) => { if (ev.key === "Enter") submit(); });
  return root;
}

// ============================================================ HELPERS CRUD ============================================================
function simpleTable(headers, rows) {
  if (rows.length === 0) return el(`<p class="empty">Belum ada data.</p>`);
  const thead = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const wrap = el(`<div class="table-wrap"><table><thead>${thead}</thead><tbody></tbody></table></div>`);
  const tbody = wrap.querySelector("tbody");
  rows.forEach((r) => tbody.appendChild(r));
  return wrap;
}
function td(html) { return `<td>${html}</td>`; }

// ============================================================ ADMIN ============================================================
function screenAdmin() {
  const root = el(`<div></div>`);
  const tabBar = tabs(
    [["pengguna", "Kelola Data Pengguna"], ["kelas-mapel", "Kelola Kelas & Mapel"]],
    state.adminTab,
    (key) => { state.adminTab = key; render(); }
  );
  root.appendChild(topbar(tabBar));
  const wrap = el(`<div class="wrap wide"></div>`);
  root.appendChild(wrap);
  if (state.adminTab === "pengguna") renderAdminPengguna(wrap);
  else renderAdminKelasMapel(wrap);
  return root;
}

async function renderAdminPengguna(wrap) {
  wrap.appendChild(el(`<h2 class="section-title">Kelola Data Pengguna</h2>`));
  const listBox = el(`<div><p class="empty">Memuat…</p></div>`);
  wrap.appendChild(listBox);

  const formCard = el(`
    <div class="card">
      <h3>Tambah Pengguna</h3>
      <div class="field-row">
        <div class="field"><label>Nama</label><input id="u-nama" /></div>
        <div class="field"><label>Username</label><input id="u-username" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Password</label><input id="u-password" type="password" /></div>
        <div class="field"><label>Peran</label>
          <select id="u-role"><option value="siswa">Siswa</option><option value="guru">Guru</option><option value="admin">Admin</option></select>
        </div>
      </div>
      <div class="field"><label>Kelas (khusus siswa)</label><select id="u-kelas"><option value="">—</option></select></div>
      <div id="u-err"></div>
      <button class="btn btn-primary" id="u-submit">Simpan Pengguna</button>
    </div>
  `);
  wrap.appendChild(formCard);

  async function reload() {
    const [users, kelas] = await Promise.all([api("/api/admin/users"), api("/api/admin/kelas")]);
    state.kelasList = kelas;
    const kelasSel = formCard.querySelector("#u-kelas");
    kelasSel.innerHTML = `<option value="">—</option>` + kelas.map((k) => `<option value="${k.kelas_id}">${esc(k.nama_kelas)}</option>`).join("");

    const rows = users.map((u) => {
      const tr = el(`<tr>
        ${td(esc(u.nama))}${td(esc(u.username))}${td(`<span class="badge role">${u.role}</span>`)}${td(esc(u.nama_kelas || "—"))}
        <td class="row-actions"><button class="btn btn-sm btn-danger" data-id="${u.users_id}">Hapus</button></td>
      </tr>`);
      tr.querySelector("button").addEventListener("click", async () => {
        if (!confirm(`Hapus pengguna ${u.nama}?`)) return;
        await api(`/api/admin/users/${u.users_id}`, { method: "DELETE" });
        reload();
      });
      return tr;
    });
    listBox.innerHTML = "";
    listBox.appendChild(simpleTable(["Nama", "Username", "Peran", "Kelas", ""], rows));
  }

  formCard.querySelector("#u-submit").addEventListener("click", async () => {
    const body = {
      nama: formCard.querySelector("#u-nama").value.trim(),
      username: formCard.querySelector("#u-username").value.trim(),
      password: formCard.querySelector("#u-password").value,
      role: formCard.querySelector("#u-role").value,
      kelas_id: formCard.querySelector("#u-kelas").value || null,
    };
    const errBox = formCard.querySelector("#u-err");
    errBox.innerHTML = "";
    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify(body) });
      formCard.querySelector("#u-nama").value = "";
      formCard.querySelector("#u-username").value = "";
      formCard.querySelector("#u-password").value = "";
      reload();
    } catch (e) {
      errBox.appendChild(el(`<p class="notice">${esc(e.message)}</p>`));
    }
  });

  reload();
}

async function renderAdminKelasMapel(wrap) {
  wrap.appendChild(el(`<h2 class="section-title">Kelola Kelas</h2>`));
  const kelasBox = el(`<div><p class="empty">Memuat…</p></div>`);
  wrap.appendChild(kelasBox);
  const kelasForm = el(`
    <div class="card">
      <h3>Tambah Kelas</h3>
      <div class="field-row">
        <div class="field"><label>Nama Kelas</label><input id="k-nama" placeholder="XI Bahasa 1" /></div>
        <div class="field"><label>Jurusan</label><input id="k-jurusan" placeholder="Bahasa" /></div>
      </div>
      <button class="btn btn-primary" id="k-submit">Simpan Kelas</button>
    </div>
  `);
  wrap.appendChild(kelasForm);

  wrap.appendChild(el(`<h2 class="section-title">Kelola Mata Pelajaran</h2>`));
  const mapelBox = el(`<div><p class="empty">Memuat…</p></div>`);
  wrap.appendChild(mapelBox);
  const mapelForm = el(`
    <div class="card">
      <h3>Tambah Mata Pelajaran</h3>
      <div class="field"><label>Nama Mapel</label><input id="m-nama" placeholder="Matematika" /></div>
      <div id="m-err"></div>
      <button class="btn btn-primary" id="m-submit">Simpan Mapel</button>
    </div>
  `);
  wrap.appendChild(mapelForm);

  async function reloadKelas() {
    const kelas = await api("/api/admin/kelas");
    const rows = kelas.map((k) => {
      const tr = el(`<tr>${td(esc(k.nama_kelas))}${td(esc(k.jurusan || "—"))}
        <td class="row-actions"><button class="btn btn-sm btn-danger" data-id="${k.kelas_id}">Hapus</button></td></tr>`);
      tr.querySelector("button").addEventListener("click", async () => {
        if (!confirm(`Hapus kelas ${k.nama_kelas}?`)) return;
        await api(`/api/admin/kelas/${k.kelas_id}`, { method: "DELETE" });
        reloadKelas();
      });
      return tr;
    });
    kelasBox.innerHTML = "";
    kelasBox.appendChild(simpleTable(["Nama Kelas", "Jurusan", ""], rows));
  }
  async function reloadMapel() {
    const mapel = await api("/api/admin/mapel");
    const rows = mapel.map((m) => {
      const tr = el(`<tr>${td(esc(m.nama_mapel))}
        <td class="row-actions"><button class="btn btn-sm btn-danger" data-id="${m.mapel_id}">Hapus</button></td></tr>`);
      tr.querySelector("button").addEventListener("click", async () => {
        if (!confirm(`Hapus mapel ${m.nama_mapel}?`)) return;
        await api(`/api/admin/mapel/${m.mapel_id}`, { method: "DELETE" });
        reloadMapel();
      });
      return tr;
    });
    mapelBox.innerHTML = "";
    mapelBox.appendChild(simpleTable(["Nama Mapel", ""], rows));
  }

  kelasForm.querySelector("#k-submit").addEventListener("click", async () => {
    const nama_kelas = kelasForm.querySelector("#k-nama").value.trim();
    const jurusan = kelasForm.querySelector("#k-jurusan").value.trim();
    if (!nama_kelas) return;
    await api("/api/admin/kelas", { method: "POST", body: JSON.stringify({ nama_kelas, jurusan }) });
    kelasForm.querySelector("#k-nama").value = ""; kelasForm.querySelector("#k-jurusan").value = "";
    reloadKelas();
  });
  mapelForm.querySelector("#m-submit").addEventListener("click", async () => {
    const nama_mapel = mapelForm.querySelector("#m-nama").value.trim();
    const errBox = mapelForm.querySelector("#m-err");
    errBox.innerHTML = "";
    try {
      await api("/api/admin/mapel", { method: "POST", body: JSON.stringify({ nama_mapel }) });
      mapelForm.querySelector("#m-nama").value = "";
      reloadMapel();
    } catch (e) {
      errBox.appendChild(el(`<p class="notice">${esc(e.message)}</p>`));
    }
  });

  reloadKelas(); reloadMapel();
}

// ============================================================ GURU ============================================================
function screenGuru() {
  const root = el(`<div></div>`);
  const tabBar = tabs(
    [["soal", "Bank Soal"], ["tes", "Jadwal Tes"], ["kuesioner", "Kuesioner"], ["hasil", "Hasil & Feedback"]],
    state.guruTab,
    (key) => { state.guruTab = key; render(); }
  );
  root.appendChild(topbar(tabBar));
  const wrap = el(`<div class="wrap wide"></div>`);
  root.appendChild(wrap);
  if (state.guruTab === "soal") renderGuruSoal(wrap);
  else if (state.guruTab === "tes") renderGuruTes(wrap);
  else if (state.guruTab === "kuesioner") renderGuruKuesioner(wrap);
  else renderGuruHasil(wrap);
  return root;
}

// ---------- Impor soal dari Excel/CSV ----------
const KOLOM_TEMPLATE = ["mapel", "pertanyaan", "opsi_a", "opsi_b", "opsi_c", "opsi_d", "kunci", "tingkat_kesulitan"];
const TEMPLATE_SOAL = [
  KOLOM_TEMPLATE,
  ["Bahasa Indonesia", "(Contoh, hapus baris ini) Penulisan kata baku yang benar adalah...", "Apotik", "Apotek", "Apotheek", "Apotic", "B", 1],
  ["Bahasa Indonesia", "(Contoh, hapus baris ini) Antonim kata 'optimis' adalah...", "Yakin", "Percaya diri", "Pesimis", "Ragu-ragu", "C", 2],
];

function unduhBerkas(nama, isi, tipe) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([isi], { type: tipe }));
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function unduhTemplateCsv() {
  // Titik koma + BOM: terbuka rapi di Excel berbahasa Indonesia
  const csv = TEMPLATE_SOAL.map((r) => r.map((c) => {
    const t = String(c);
    return /[";\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }).join(";")).join("\r\n");
  unduhBerkas("template-soal.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
}
function unduhTemplateXlsx() {
  if (typeof XLSX === "undefined") return alert("Pembuat file Excel tidak termuat. Gunakan template CSV.");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(TEMPLATE_SOAL), "Soal");
  XLSX.writeFile(wb, "template-soal.xlsx");
}

// File -> daftar objek (baris pertama = nama kolom). Pemeriksaan isi dilakukan server.
async function bacaFileSoal(file) {
  const nama = file.name.toLowerCase();
  if (nama.endsWith(".csv")) return CsvParser.parseToObjects(await file.text());
  if (typeof XLSX === "undefined") throw new Error("Pembaca Excel tidak termuat. Simpan file sebagai CSV lalu coba lagi.");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  // blankrows:true menjaga nomor baris di laporan galat tetap sama dengan nomor baris di Excel
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false, blankrows: true });
}

// Tahap 1: periksa (dryRun) dan tampilkan ringkasan. Tahap 2: tombol "Impor" menyimpan.
async function pratinjauImpor(rows, box, selesaiDiimpor) {
  box.innerHTML = `<p class="empty">Memeriksa file…</p>`;
  let hasil;
  try {
    hasil = await api("/api/guru/soal/impor", { method: "POST", body: JSON.stringify({ rows, dryRun: true }) });
  } catch (e) {
    box.innerHTML = `<p class="notice">${esc(e.message)}</p>`;
    return;
  }
  box.innerHTML = "";
  box.appendChild(el(`<p style="font-size:0.9rem;margin:4px 0 12px;"><strong>${hasil.jumlahValid}</strong> soal siap diimpor, <strong style="color:var(--danger)">${hasil.galat.length}</strong> baris bermasalah (dari ${hasil.totalBaris} baris terbaca).</p>`));

  if (hasil.galat.length) {
    const rowsGalat = hasil.galat.map((g) => el(`<tr>${td(g.baris)}${td(esc(g.alasan))}</tr>`));
    box.appendChild(el(`<p style="font-size:0.82rem;color:var(--ink-soft);margin:0 0 6px;">Baris bermasalah akan dilewati. Perbaiki di file lalu pilih ulang jika ingin ikut diimpor.</p>`));
    box.appendChild(simpleTable(["Baris", "Masalah"], rowsGalat));
  }
  if (hasil.jumlahValid > 0) {
    const btn = el(`<button class="btn btn-accent">Impor ${hasil.jumlahValid} Soal</button>`);
    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "Mengimpor…";
      try {
        const r = await api("/api/guru/soal/impor", { method: "POST", body: JSON.stringify({ rows }) });
        box.innerHTML = `<p class="notice ok">Berhasil mengimpor ${r.jumlahDiimpor} soal.</p>`;
        selesaiDiimpor();
      } catch (e) {
        btn.disabled = false; btn.textContent = `Impor ${hasil.jumlahValid} Soal`;
        box.appendChild(el(`<p class="notice">${esc(e.message)}</p>`));
      }
    });
    box.appendChild(btn);
  }
}

async function renderGuruSoal(wrap) {
  wrap.appendChild(el(`<h2 class="section-title">Kelola Bank Soal</h2>`));
  const listBox = el(`<div><p class="empty">Memuat…</p></div>`);
  wrap.appendChild(listBox);

  const mapel = await api("/api/admin/mapel");
  const mapelOptions = mapel.map((m) => `<option value="${m.mapel_id}">${esc(m.nama_mapel)}</option>`).join("");

  const formCard = el(`
    <div class="card">
      <h3 id="s-judul">Tambah Soal</h3>
      <div class="field-row">
        <div class="field"><label>Mata Pelajaran</label><select id="s-mapel">${mapelOptions}</select></div>
        <div class="field"><label>Tingkat Kesulitan</label>
          <select id="s-level"><option value="1">1 — Sangat Mudah</option><option value="2">2 — Mudah</option><option value="3" selected>3 — Sedang</option><option value="4">4 — Sulit</option><option value="5">5 — Sangat Sulit</option></select>
        </div>
      </div>
      <div class="field"><label>Pertanyaan</label><textarea id="s-pertanyaan"></textarea></div>
      <div class="field-row">
        <div class="field"><label>Opsi A</label><input id="s-a" /></div>
        <div class="field"><label>Opsi B</label><input id="s-b" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Opsi C</label><input id="s-c" /></div>
        <div class="field"><label>Opsi D</label><input id="s-d" /></div>
      </div>
      <div class="field"><label>Kunci Jawaban</label><select id="s-kunci"><option>A</option><option>B</option><option>C</option><option>D</option></select></div>
      <div id="s-err"></div>
      <div class="row-actions">
        <button class="btn btn-primary" id="s-submit">Simpan Soal</button>
        <button class="btn btn-outline" id="s-batal" style="display:none;">Batal</button>
      </div>
    </div>
  `);
  wrap.appendChild(formCard);

  const importCard = el(`
    <div class="card">
      <h3>Impor Soal dari Excel / CSV</h3>
      <p class="lead" style="margin-top:0;margin-bottom:12px;">Baris pertama berisi nama kolom: <code>mapel, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, kunci, tingkat_kesulitan</code>. Nama mapel harus sudah terdaftar. Maksimal 500 baris per file. Soal yang diimpor menjadi milikmu.</p>
      <div class="row-actions" style="margin-bottom:14px;">
        <button class="btn btn-outline btn-sm" id="im-tpl-xlsx">Unduh template Excel</button>
        <button class="btn btn-outline btn-sm" id="im-tpl-csv">Unduh template CSV</button>
      </div>
      <div class="field"><label>Pilih file (.xlsx, .xls, atau .csv)</label><input type="file" id="im-file" accept=".xlsx,.xls,.csv" /></div>
      <div id="im-hasil"></div>
    </div>
  `);
  wrap.appendChild(importCard);

  let editId = null;
  const f = (id) => formCard.querySelector(id);
  function resetForm() {
    editId = null;
    f("#s-judul").textContent = "Tambah Soal";
    f("#s-submit").textContent = "Simpan Soal";
    f("#s-batal").style.display = "none";
    f("#s-mapel").disabled = false;
    ["#s-pertanyaan", "#s-a", "#s-b", "#s-c", "#s-d"].forEach((sel) => (f(sel).value = ""));
    f("#s-err").innerHTML = "";
  }
  function mulaiUbah(s) {
    editId = s.soal_id;
    f("#s-judul").textContent = "Ubah Soal";
    f("#s-submit").textContent = "Simpan Perubahan";
    f("#s-batal").style.display = "";
    f("#s-mapel").value = s.mapel_id; f("#s-mapel").disabled = true; // mapel tidak diubah di sini
    f("#s-level").value = s.tingkat_kesulitan;
    f("#s-pertanyaan").value = s.pertanyaan;
    f("#s-a").value = s.opsi_a; f("#s-b").value = s.opsi_b; f("#s-c").value = s.opsi_c; f("#s-d").value = s.opsi_d;
    f("#s-kunci").value = s.kunci;
    formCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function reload() {
    const soal = await api("/api/guru/soal");
    const saya = state.user.users_id;
    const rows = soal.map((s) => {
      const milikSaya = s.guru_id === saya;
      const tr = el(`<tr>
        ${td(esc(s.nama_mapel))}${td(`L${s.tingkat_kesulitan}`)}
        ${td(esc(s.pertanyaan.length > 60 ? s.pertanyaan.slice(0, 60) + "…" : s.pertanyaan))}${td(s.kunci)}
        ${td(milikSaya ? `<span class="badge good">Kamu</span>` : esc(s.nama_guru || "—"))}
        <td class="row-actions"></td>
      </tr>`);
      const aksi = tr.querySelector(".row-actions");
      if (milikSaya) {
        const ubah = el(`<button class="btn btn-sm btn-outline">Ubah</button>`);
        ubah.addEventListener("click", () => mulaiUbah(s));
        const hapus = el(`<button class="btn btn-sm btn-danger">Hapus</button>`);
        hapus.addEventListener("click", async () => {
          if (!confirm("Hapus soal ini?")) return;
          try {
            await api(`/api/guru/soal/${s.soal_id}`, { method: "DELETE" });
            if (editId === s.soal_id) resetForm();
            reload();
          } catch (e) { alert(e.message); }
        });
        aksi.appendChild(ubah); aksi.appendChild(hapus);
      } else {
        aksi.appendChild(el(`<span style="font-size:0.74rem;color:var(--ink-soft);">Milik guru lain</span>`));
      }
      return tr;
    });
    listBox.innerHTML = "";
    listBox.appendChild(simpleTable(["Mapel", "Level", "Pertanyaan", "Kunci", "Pembuat", ""], rows));
  }

  f("#s-batal").addEventListener("click", resetForm);
  f("#s-submit").addEventListener("click", async () => {
    const body = {
      mapel_id: f("#s-mapel").value,
      tingkat_kesulitan: Number(f("#s-level").value),
      pertanyaan: f("#s-pertanyaan").value.trim(),
      opsi_a: f("#s-a").value.trim(), opsi_b: f("#s-b").value.trim(),
      opsi_c: f("#s-c").value.trim(), opsi_d: f("#s-d").value.trim(),
      kunci: f("#s-kunci").value,
    };
    const errBox = f("#s-err");
    errBox.innerHTML = "";
    try {
      if (editId) await api(`/api/guru/soal/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/api/guru/soal", { method: "POST", body: JSON.stringify(body) });
      resetForm();
      reload();
    } catch (e) {
      errBox.appendChild(el(`<p class="notice">${esc(e.message)}</p>`));
    }
  });

  importCard.querySelector("#im-tpl-xlsx").addEventListener("click", unduhTemplateXlsx);
  importCard.querySelector("#im-tpl-csv").addEventListener("click", unduhTemplateCsv);
  const hasilBox = importCard.querySelector("#im-hasil");
  importCard.querySelector("#im-file").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const rows = await bacaFileSoal(file);
      await pratinjauImpor(rows, hasilBox, () => { ev.target.value = ""; reload(); });
    } catch (e) {
      hasilBox.innerHTML = `<p class="notice">${esc(e.message)}</p>`;
    }
  });

  reload();
}

async function renderGuruTes(wrap) {
  wrap.appendChild(el(`<h2 class="section-title">Atur Jadwal Tes</h2>`));
  const listBox = el(`<div><p class="empty">Memuat…</p></div>`);
  wrap.appendChild(listBox);

  const [mapel, kelas] = await Promise.all([api("/api/admin/mapel"), api("/api/admin/kelas")]);
  const mapelOptions = mapel.map((m) => `<option value="${m.mapel_id}">${esc(m.nama_mapel)}</option>`).join("");
  const kelasOptions = `<option value="">Semua kelas</option>` + kelas.map((k) => `<option value="${k.kelas_id}">${esc(k.nama_kelas)}</option>`).join("");

  const formCard = el(`
    <div class="card">
      <h3>Jadwalkan Tes Baru</h3>
      <div class="field"><label>Judul Tes</label><input id="t-judul" /></div>
      <div class="field-row">
        <div class="field"><label>Mata Pelajaran</label><select id="t-mapel">${mapelOptions}</select></div>
        <div class="field"><label>Kelas</label><select id="t-kelas">${kelasOptions}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Jumlah Soal</label><input id="t-jumlah" type="number" value="10" min="1" /></div>
        <div class="field"><label>Durasi (menit)</label><input id="t-durasi" type="number" value="30" min="1" /></div>
        <div class="field"><label>Tanggal</label><input id="t-tanggal" type="date" /></div>
      </div>
      <div id="t-err"></div>
      <button class="btn btn-primary" id="t-submit">Simpan Jadwal</button>
    </div>
  `);
  wrap.appendChild(formCard);
  formCard.querySelector("#t-tanggal").value = new Date().toISOString().slice(0, 10);

  async function reload() {
    const tes = await api("/api/guru/tes");
    const rows = tes.map((t) => {
      const tr = el(`<tr>
        ${td(esc(t.judul))}${td(esc(t.nama_mapel))}${td(esc(t.nama_kelas || "Semua kelas"))}${td(t.jumlah_soal)}${td(t.durasi_menit + " menit")}${td(t.tanggal)}
        <td class="row-actions"><button class="btn btn-sm btn-danger" data-id="${t.tes_id}">Hapus</button></td>
      </tr>`);
      tr.querySelector("button").addEventListener("click", async () => {
        if (!confirm(`Hapus tes "${t.judul}"?`)) return;
        await api(`/api/guru/tes/${t.tes_id}`, { method: "DELETE" });
        reload();
      });
      return tr;
    });
    listBox.innerHTML = "";
    listBox.appendChild(simpleTable(["Judul", "Mapel", "Kelas", "Jml Soal", "Durasi", "Tanggal", ""], rows));
  }

  formCard.querySelector("#t-submit").addEventListener("click", async () => {
    const body = {
      judul: formCard.querySelector("#t-judul").value.trim(),
      mapel_id: formCard.querySelector("#t-mapel").value,
      kelas_id: formCard.querySelector("#t-kelas").value || null,
      jumlah_soal: Number(formCard.querySelector("#t-jumlah").value),
      durasi_menit: Number(formCard.querySelector("#t-durasi").value),
      tanggal: formCard.querySelector("#t-tanggal").value,
    };
    const errBox = formCard.querySelector("#t-err");
    errBox.innerHTML = "";
    try {
      await api("/api/guru/tes", { method: "POST", body: JSON.stringify(body) });
      formCard.querySelector("#t-judul").value = "";
      reload();
    } catch (e) {
      errBox.appendChild(el(`<p class="notice">${esc(e.message)}</p>`));
    }
  });

  reload();
}

async function renderGuruKuesioner(wrap) {
  wrap.appendChild(el(`<h2 class="section-title">Kelola Kuesioner</h2>`));
  const tesList = await api("/api/guru/tes");
  const selCard = el(`
    <div class="card">
      <div class="field"><label>Pilih Tes</label>
        <select id="kq-tes">${tesList.map((t) => `<option value="${t.tes_id}">${esc(t.judul)}</option>`).join("")}</select>
      </div>
    </div>
  `);
  wrap.appendChild(selCard);
  const box = el(`<div></div>`);
  wrap.appendChild(box);

  async function loadFor(tesId) {
    box.innerHTML = "";
    if (!tesId) return;
    const existing = await api(`/api/guru/kuesioner/${tesId}`);
    if (existing) {
      box.appendChild(el(`<div class="card"><h3>${esc(existing.judul)}</h3></div>`));
      const rows = existing.pertanyaan.map((p, i) => el(`<tr>${td(i + 1)}${td(esc(p.soal))}</tr>`));
      box.appendChild(simpleTable(["No", "Pernyataan"], rows));
      box.appendChild(el(`<p class="lead">Kuesioner untuk tes ini sudah dibuat.</p>`));
      return;
    }
    const formCard = el(`
      <div class="card">
        <h3>Buat Kuesioner Baru</h3>
        <div class="field"><label>Judul Kuesioner</label><input id="kq-judul" value="Kuesioner Feedback Pembelajaran" /></div>
        <div id="kq-pertanyaan-list"></div>
        <button class="btn btn-outline btn-sm" id="kq-add-row" style="margin-bottom:14px;">+ Tambah Pernyataan</button>
        <div id="kq-err"></div>
        <button class="btn btn-primary" id="kq-submit">Simpan Kuesioner</button>
      </div>
    `);
    const listDiv = formCard.querySelector("#kq-pertanyaan-list");
    function addRow(value = "") {
      const row = el(`<div class="field"><input placeholder="Pernyataan kuesioner" value="${value}" /></div>`);
      listDiv.appendChild(row);
    }
    ["Penjelasan materi mudah saya pahami.", "Guru membuat saya aktif belajar.", "Media pembelajaran membantu saya memahami materi.", "Saya nyaman bertanya di kelas.", "Soal tes sesuai materi yang diajarkan."].forEach(addRow);
    formCard.querySelector("#kq-add-row").addEventListener("click", () => addRow());
    formCard.querySelector("#kq-submit").addEventListener("click", async () => {
      const pertanyaan = Array.from(listDiv.querySelectorAll("input")).map((i) => i.value.trim()).filter(Boolean);
      const errBox = formCard.querySelector("#kq-err");
      errBox.innerHTML = "";
      try {
        await api("/api/guru/kuesioner", {
          method: "POST",
          body: JSON.stringify({ tes_id: tesId, judul: formCard.querySelector("#kq-judul").value.trim(), pertanyaan }),
        });
        loadFor(tesId);
      } catch (e) {
        errBox.appendChild(el(`<p class="notice">${esc(e.message)}</p>`));
      }
    });
    box.appendChild(formCard);
  }

  selCard.querySelector("#kq-tes").addEventListener("change", (e) => loadFor(e.target.value));
  if (tesList.length) loadFor(tesList[0].tes_id);
}

async function renderGuruHasil(wrap) {
  wrap.appendChild(el(`<h2 class="section-title">Hasil Tes Siswa</h2>`));
  const hasilBox = el(`<div><p class="empty">Memuat…</p></div>`);
  wrap.appendChild(hasilBox);

  const hasil = await api("/api/guru/hasil");
  if (hasil.length === 0) {
    hasilBox.innerHTML = "";
    hasilBox.appendChild(el(`<p class="empty">Belum ada siswa yang menyelesaikan tes.</p>`));
  } else {
    const rows = hasil.map((h) => {
      const cls = h.nilai >= 70 ? "good" : h.nilai >= 55 ? "mid" : "low";
      return el(`<tr>${td(esc(h.nama))}${td(esc(h.nama_kelas || "—"))}${td(esc(h.judul_tes))}${td(h.nilai)}${td(`<span class="badge ${cls}">Level ${h.level_akhir}</span>`)}${td(fmtTanggal(h.selesai))}</tr>`);
    });
    hasilBox.innerHTML = "";
    hasilBox.appendChild(simpleTable(["Nama", "Kelas", "Tes", "Nilai", "Level Akhir", "Selesai"], rows));
  }

  wrap.appendChild(el(`<h2 class="section-title">Rekap Kuesioner Feedback</h2>`));
  const tesList = await api("/api/guru/tes");
  const selCard = el(`
    <div class="card">
      <div class="field"><label>Pilih Tes</label>
        <select id="fb-tes">${tesList.map((t) => `<option value="${t.tes_id}">${esc(t.judul)}</option>`).join("")}</select>
      </div>
    </div>
  `);
  wrap.appendChild(selCard);
  const fbBox = el(`<div></div>`);
  wrap.appendChild(fbBox);

  async function loadFeedback(tesId) {
    fbBox.innerHTML = "";
    if (!tesId) return;
    const fb = await api(`/api/guru/feedback-summary/${tesId}`);
    if (fb.jumlahResponden === 0) {
      fbBox.appendChild(el(`<p class="empty">Belum ada kuesioner yang masuk untuk tes ini.</p>`));
      return;
    }
    fbBox.appendChild(el(`<p style="font-size:0.85rem;color:var(--ink-soft);margin-bottom:12px;">${fb.jumlahResponden} responden</p>`));
    fb.rataRata.forEach((r) => {
      if (r.rata === null) return;
      fbBox.appendChild(el(`<div class="bar-row">
        <div class="bar-label">${esc(r.pernyataan)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(r.rata / 5) * 100}%"></div></div>
        <div class="bar-val">${r.rata}</div>
      </div>`));
    });
    if (fb.komentar.length) {
      fbBox.appendChild(el(`<h3 style="margin-top:20px;font-size:0.9rem;">Komentar</h3>`));
      fb.komentar.forEach((k) => {
        fbBox.appendChild(el(`<div class="komentar-item"><div class="siapa">${esc(k.nama)}${k.nama_kelas ? " · " + esc(k.nama_kelas) : ""}</div><div>${esc(k.komentar)}</div></div>`));
      });
    }
  }
  selCard.querySelector("#fb-tes").addEventListener("change", (e) => loadFeedback(e.target.value));
  if (tesList.length) loadFeedback(tesList[0].tes_id);
}

// ============================================================ SISWA ============================================================
function siswaNav() {
  return tabs(
    [["siswa-tes-list", "Tes Tersedia"], ["siswa-riwayat", "Riwayat Hasil"]],
    state.screen === "siswa-riwayat" ? "siswa-riwayat" : "siswa-tes-list",
    (key) => { state.screen = key; render(); }
  );
}

function screenSiswaTesList() {
  const root = el(`<div></div>`);
  root.appendChild(topbar(siswaNav()));
  const wrap = el(`<div class="wrap"><h2 class="section-title">Tes Tersedia</h2><div id="box"><p class="empty">Memuat…</p></div></div>`);
  root.appendChild(wrap);

  api("/api/siswa/tes-tersedia").then((list) => {
    const box = wrap.querySelector("#box");
    box.innerHTML = "";
    if (list.length === 0) {
      box.appendChild(el(`<p class="empty">Belum ada tes yang dijadwalkan untuk kelasmu.</p>`));
      return;
    }
    list.forEach((t) => {
      const card = el(`
        <div class="card">
          <h3 style="margin-bottom:4px;">${esc(t.judul)}</h3>
          <p class="lead" style="margin-top:0;margin-bottom:14px;">${esc(t.nama_mapel)} · ${t.jumlah_soal} soal · ${t.durasi_menit} menit · ${t.tanggal}</p>
        </div>
      `);
      if (t.status_saya === "selesai") {
        card.appendChild(el(`<span class="badge good">Selesai — Nilai ${t.nilai_saya}</span>`));
      } else {
        const btn = el(`<button class="btn btn-primary">${t.status_saya === "ongoing" ? "Lanjutkan Tes" : "Mulai Tes"}</button>`);
        btn.addEventListener("click", () => mulaiTes(t.tes_id));
        card.appendChild(btn);
      }
      box.appendChild(card);
    });
  });

  return root;
}

// ---------- Timer tes: server = sumber kebenaran, peramban hanya menampilkan ----------
function setDeadline(sisaDetik) {
  if (typeof sisaDetik === "number") state.deadlineMs = Date.now() + sisaDetik * 1000;
}
function fmtWaktu(detik) {
  const d = Math.max(0, detik);
  return String(Math.floor(d / 60)).padStart(2, "0") + ":" + String(d % 60).padStart(2, "0");
}
function mulaiTimer() {
  clearInterval(state.timerId);
  const tick = () => {
    const sisa = Math.ceil((state.deadlineMs - Date.now()) / 1000);
    const t = document.getElementById("timer");
    if (t) { t.textContent = fmtWaktu(sisa); t.classList.toggle("warn", sisa <= 60); }
    if (sisa <= 0) { clearInterval(state.timerId); waktuHabis(); }
  };
  tick();
  state.timerId = setInterval(tick, 1000);
}
function tampilkanHasil(hasil) {
  state.hasilTes = hasil;
  state.sesiId = hasil.sesiId;
  state.screen = "siswa-result";
  render();
}
// Hitung mundur mencapai nol: minta server menutup sesi. Server yang menentukan;
// kalau jam perangkat meleset dan waktu sebenarnya belum habis, lanjutkan tes.
async function waktuHabis() {
  const btn = document.getElementById("lanjut");
  const err = document.getElementById("err");
  if (btn) btn.disabled = true;
  if (err) err.innerHTML = `<p class="notice">Waktu habis. Menyimpan hasilmu…</p>`;
  try {
    const data = await api(`/api/siswa/sesi/${state.sesiId}/selesai`, { method: "POST" });
    if (data.selesai) return tampilkanHasil(data.hasil);
    setDeadline(data.sisaDetik);
    mulaiTimer();
    if (err) err.innerHTML = "";
    if (btn && document.querySelector(".opsi.selected")) btn.disabled = false;
  } catch (e) {
    if (err) err.innerHTML = `<p class="notice">${esc(e.message)}</p>`;
  }
}

async function mulaiTes(tesId) {
  try {
    const data = await api(`/api/siswa/tes/${tesId}/mulai`, { method: "POST" });
    state.tesAktif = tesId;
    if (data.selesai) return tampilkanHasil(data.hasil); // sesi lama yang waktunya sudah habis
    state.sesiId = data.sesiId; state.soalAktif = data.soal; state.progress = data.progress;
    setDeadline(data.sisaDetik);
    state.screen = "siswa-test";
    render();
  } catch (e) {
    alert(e.message);
  }
}

function screenSiswaTest() {
  const root = el(`<div></div>`);
  root.appendChild(topbar());
  const soal = state.soalAktif;
  const pct = Math.round((state.progress.jumlah / state.progress.total) * 100);
  const opsi = [["A", soal.opsi_a], ["B", soal.opsi_b], ["C", soal.opsi_c], ["D", soal.opsi_d]];

  const wrap = el(`
    <div class="wrap">
      <div class="progress-row"><span>Soal ke-${state.progress.jumlah + 1} dari ${state.progress.total}</span><span class="timer" id="timer">--:--</span></div>
      <div class="progress-bar"><div style="width:${pct}%"></div></div>
      <div class="soal-pertanyaan">${esc(soal.pertanyaan)}</div>
      <div class="opsi-list"></div>
      <div id="err"></div>
      <button class="btn btn-primary btn-block" id="lanjut" disabled>Jawab &amp; Lanjut</button>
    </div>
  `);

  let dipilih = null;
  const list = wrap.querySelector(".opsi-list");
  opsi.forEach(([huruf, teks]) => {
    const opt = el(`<div class="opsi"><span class="huruf">${huruf}</span><span>${esc(teks)}</span></div>`);
    opt.addEventListener("click", () => {
      dipilih = huruf;
      list.querySelectorAll(".opsi").forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      wrap.querySelector("#lanjut").disabled = false;
    });
    list.appendChild(opt);
  });

  wrap.querySelector("#lanjut").addEventListener("click", async () => {
    const btn = wrap.querySelector("#lanjut");
    btn.disabled = true; btn.textContent = "Mengirim...";
    try {
      const data = await api(`/api/siswa/sesi/${state.sesiId}/jawab`, {
        method: "POST", body: JSON.stringify({ soalId: soal.soal_id, jawabanHuruf: dipilih }),
      });
      if (data.selesai) return tampilkanHasil(data.hasil);
      state.soalAktif = data.soal; state.progress = data.progress;
      setDeadline(data.sisaDetik);
      state.screen = "siswa-test";
      render();
    } catch (e) {
      if (/sudah selesai/i.test(e.message)) return waktuHabis(); // sesi ditutup server (mis. waktu habis)
      btn.disabled = false; btn.textContent = "Jawab & Lanjut";
      wrap.querySelector("#err").appendChild(el(`<p class="notice">${esc(e.message)}</p>`));
    }
  });

  root.appendChild(wrap);
  return root;
}

function screenSiswaResult() {
  const root = el(`<div></div>`);
  root.appendChild(topbar());
  const h = state.hasilTes;
  const wrap = el(`
    <div class="wrap">
      <div class="hasil-skor">
        <div class="angka">${h.nilai}</div>
        <div class="kategori">${h.kategori}</div>
      </div>
      <div class="hasil-meta"><span>Level akhir: ${h.levelAkhir}</span><span>${h.jumlahSoal} soal dijawab</span></div>
      ${h.waktuHabis ? `<p class="notice" style="text-align:center;margin-top:16px;">Waktu habis. Nilai dihitung dari ${h.jumlahSoal} soal yang sempat dijawab, dari total ${h.jumlahTarget} soal.</p>` : ""}
      <button class="btn btn-accent btn-block" id="next" style="margin-top:28px;">Lanjutkan</button>
    </div>
  `);
  wrap.querySelector("#next").addEventListener("click", async () => {
    const kuesioner = await api(`/api/siswa/kuesioner/${state.tesAktif}`);
    if (!kuesioner) { state.screen = "siswa-tes-list"; render(); return; }
    state.kuesionerAktif = kuesioner; state.jawabanKuesioner = {};
    state.screen = "siswa-kuesioner";
    render();
  });
  root.appendChild(wrap);
  return root;
}

function screenSiswaKuesioner() {
  const root = el(`<div></div>`);
  root.appendChild(topbar());
  const wrap = el(`
    <div class="wrap">
      <h2 style="margin-bottom:6px;">${esc(state.kuesionerAktif.judul)}</h2>
      <p class="lead" style="margin-top:0;margin-bottom:10px;">Jawabanmu membantu guru meningkatkan pembelajaran.</p>
      <div id="likerts"></div>
      <div class="field" style="margin-top:20px;"><label>Saran atau komentar (opsional)</label><textarea id="komentar"></textarea></div>
      <div id="err"></div>
      <button class="btn btn-primary btn-block" id="kirim">Kirim Kuesioner</button>
    </div>
  `);
  const box = wrap.querySelector("#likerts");
  state.kuesionerAktif.pertanyaan.forEach((p) => {
    const row = el(`
      <div class="likert-row">
        <div class="p">${esc(p.soal)}</div>
        <div class="likert-scale"></div>
      </div>
    `);
    const scale = row.querySelector(".likert-scale");
    [1, 2, 3, 4, 5].forEach((n) => {
      const opt = el(`<div class="likert-opt">${n}</div>`);
      opt.addEventListener("click", () => {
        state.jawabanKuesioner[p.pertanyaan_kuesioner_id] = n;
        scale.querySelectorAll(".likert-opt").forEach((o) => o.classList.remove("selected"));
        opt.classList.add("selected");
      });
      scale.appendChild(opt);
    });
    box.appendChild(row);
  });

  wrap.querySelector("#kirim").addEventListener("click", async () => {
    const errBox = wrap.querySelector("#err");
    errBox.innerHTML = "";
    const jawaban = Object.entries(state.jawabanKuesioner).map(([pertanyaanId, skor]) => ({ pertanyaanId: Number(pertanyaanId), skor }));
    if (jawaban.length < state.kuesionerAktif.pertanyaan.length) {
      errBox.appendChild(el(`<p class="notice">Isi semua pernyataan sebelum mengirim.</p>`));
      return;
    }
    try {
      await api("/api/siswa/kuesioner/submit", {
        method: "POST",
        body: JSON.stringify({ sesiId: state.sesiId, jawaban, komentar: wrap.querySelector("#komentar").value }),
      });
      state.screen = "siswa-done";
      render();
    } catch (e) {
      errBox.appendChild(el(`<p class="notice">${esc(e.message)}</p>`));
    }
  });

  root.appendChild(wrap);
  return root;
}

function screenSiswaDone() {
  const root = el(`<div></div>`);
  root.appendChild(topbar());
  const wrap = el(`
    <div class="wrap">
      <span class="eyebrow">Terima kasih</span>
      <h1 class="display">Tes dan kuesioner selesai.</h1>
      <p class="lead">Hasilmu sudah tersimpan dan bisa dilihat gurumu.</p>
      <button class="btn btn-outline" id="kembali" style="margin-top:22px;">Kembali ke Daftar Tes</button>
    </div>
  `);
  wrap.querySelector("#kembali").addEventListener("click", () => { state.screen = "siswa-tes-list"; render(); });
  root.appendChild(wrap);
  return root;
}

function screenSiswaRiwayat() {
  const root = el(`<div></div>`);
  root.appendChild(topbar(siswaNav()));
  const wrap = el(`<div class="wrap"><h2 class="section-title">Riwayat Hasil</h2><div id="box"><p class="empty">Memuat…</p></div></div>`);
  root.appendChild(wrap);
  api("/api/siswa/hasil").then((list) => {
    const box = wrap.querySelector("#box");
    box.innerHTML = "";
    if (list.length === 0) { box.appendChild(el(`<p class="empty">Belum ada tes yang diselesaikan.</p>`)); return; }
    const rows = list.map((h) => el(`<tr>${td(esc(h.judul_tes))}${td(esc(h.nama_mapel))}${td(h.nilai)}${td("Level " + h.level_akhir)}${td(fmtTanggal(h.selesai))}</tr>`));
    box.appendChild(simpleTable(["Tes", "Mapel", "Nilai", "Level Akhir", "Selesai"], rows));
  });
  return root;
}

const SCREENS = {
  login: screenLogin,
  admin: screenAdmin,
  guru: screenGuru,
  "siswa-tes-list": screenSiswaTesList,
  "siswa-test": screenSiswaTest,
  "siswa-result": screenSiswaResult,
  "siswa-kuesioner": screenSiswaKuesioner,
  "siswa-done": screenSiswaDone,
  "siswa-riwayat": screenSiswaRiwayat,
};

render();
