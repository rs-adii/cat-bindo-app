// app.js — SPA tanpa framework. Semua komunikasi lewat fetch() ke /api/*.

const state = {
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
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.appendChild(SCREENS[state.screen]());
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
    who.appendChild(el(`<span>${state.user.nama} · <span class="badge role">${state.user.role}</span></span>`));
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
         Akun contoh - Admin: <code>admin / admin123</code><br/>
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
      errBox.appendChild(el(`<p class="notice">${e.message}</p>`));
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
    kelasSel.innerHTML = `<option value="">—</option>` + kelas.map((k) => `<option value="${k.kelas_id}">${k.nama_kelas}</option>`).join("");

    const rows = users.map((u) => {
      const tr = el(`<tr>
        ${td(u.nama)}${td(u.username)}${td(`<span class="badge role">${u.role}</span>`)}${td(u.nama_kelas || "—")}
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
      errBox.appendChild(el(`<p class="notice">${e.message}</p>`));
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
      const tr = el(`<tr>${td(k.nama_kelas)}${td(k.jurusan || "—")}
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
      const tr = el(`<tr>${td(m.nama_mapel)}
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
      errBox.appendChild(el(`<p class="notice">${e.message}</p>`));
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

async function renderGuruSoal(wrap) {
  wrap.appendChild(el(`<h2 class="section-title">Kelola Bank Soal</h2>`));
  const listBox = el(`<div><p class="empty">Memuat…</p></div>`);
  wrap.appendChild(listBox);

  const mapel = await api("/api/admin/mapel");
  const mapelOptions = mapel.map((m) => `<option value="${m.mapel_id}">${m.nama_mapel}</option>`).join("");

  const formCard = el(`
    <div class="card">
      <h3>Tambah Soal</h3>
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
      <button class="btn btn-primary" id="s-submit">Simpan Soal</button>
    </div>
  `);
  wrap.appendChild(formCard);

  async function reload() {
    const soal = await api("/api/guru/soal");
    const rows = soal.map((s) => {
      const tr = el(`<tr>
        ${td(s.nama_mapel)}${td(`L${s.tingkat_kesulitan}`)}${td(s.pertanyaan.slice(0, 60) + (s.pertanyaan.length > 60 ? "…" : ""))}${td(s.kunci)}
        <td class="row-actions"><button class="btn btn-sm btn-danger" data-id="${s.soal_id}">Hapus</button></td>
      </tr>`);
      tr.querySelector("button").addEventListener("click", async () => {
        if (!confirm("Hapus soal ini?")) return;
        await api(`/api/guru/soal/${s.soal_id}`, { method: "DELETE" });
        reload();
      });
      return tr;
    });
    listBox.innerHTML = "";
    listBox.appendChild(simpleTable(["Mapel", "Level", "Pertanyaan", "Kunci", ""], rows));
  }

  formCard.querySelector("#s-submit").addEventListener("click", async () => {
    const body = {
      mapel_id: formCard.querySelector("#s-mapel").value,
      tingkat_kesulitan: Number(formCard.querySelector("#s-level").value),
      pertanyaan: formCard.querySelector("#s-pertanyaan").value.trim(),
      opsi_a: formCard.querySelector("#s-a").value.trim(),
      opsi_b: formCard.querySelector("#s-b").value.trim(),
      opsi_c: formCard.querySelector("#s-c").value.trim(),
      opsi_d: formCard.querySelector("#s-d").value.trim(),
      kunci: formCard.querySelector("#s-kunci").value,
    };
    const errBox = formCard.querySelector("#s-err");
    errBox.innerHTML = "";
    try {
      await api("/api/guru/soal", { method: "POST", body: JSON.stringify(body) });
      ["#s-pertanyaan", "#s-a", "#s-b", "#s-c", "#s-d"].forEach((sel) => (formCard.querySelector(sel).value = ""));
      reload();
    } catch (e) {
      errBox.appendChild(el(`<p class="notice">${e.message}</p>`));
    }
  });

  reload();
}

async function renderGuruTes(wrap) {
  wrap.appendChild(el(`<h2 class="section-title">Atur Jadwal Tes</h2>`));
  const listBox = el(`<div><p class="empty">Memuat…</p></div>`);
  wrap.appendChild(listBox);

  const [mapel, kelas] = await Promise.all([api("/api/admin/mapel"), api("/api/admin/kelas")]);
  const mapelOptions = mapel.map((m) => `<option value="${m.mapel_id}">${m.nama_mapel}</option>`).join("");
  const kelasOptions = `<option value="">Semua kelas</option>` + kelas.map((k) => `<option value="${k.kelas_id}">${k.nama_kelas}</option>`).join("");

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
        ${td(t.judul)}${td(t.nama_mapel)}${td(t.nama_kelas || "Semua kelas")}${td(t.jumlah_soal)}${td(t.durasi_menit + " menit")}${td(t.tanggal)}
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
      errBox.appendChild(el(`<p class="notice">${e.message}</p>`));
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
        <select id="kq-tes">${tesList.map((t) => `<option value="${t.tes_id}">${t.judul}</option>`).join("")}</select>
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
      box.appendChild(el(`<div class="card"><h3>${existing.judul}</h3></div>`));
      const rows = existing.pertanyaan.map((p, i) => el(`<tr>${td(i + 1)}${td(p.soal)}</tr>`));
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
        errBox.appendChild(el(`<p class="notice">${e.message}</p>`));
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
      return el(`<tr>${td(h.nama)}${td(h.nama_kelas || "—")}${td(h.judul_tes)}${td(h.nilai)}${td(`<span class="badge ${cls}">Level ${h.level_akhir}</span>`)}${td(fmtTanggal(h.selesai))}</tr>`);
    });
    hasilBox.innerHTML = "";
    hasilBox.appendChild(simpleTable(["Nama", "Kelas", "Tes", "Nilai", "Level Akhir", "Selesai"], rows));
  }

  wrap.appendChild(el(`<h2 class="section-title">Rekap Kuesioner Feedback</h2>`));
  const tesList = await api("/api/guru/tes");
  const selCard = el(`
    <div class="card">
      <div class="field"><label>Pilih Tes</label>
        <select id="fb-tes">${tesList.map((t) => `<option value="${t.tes_id}">${t.judul}</option>`).join("")}</select>
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
        <div class="bar-label">${r.pernyataan}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(r.rata / 5) * 100}%"></div></div>
        <div class="bar-val">${r.rata}</div>
      </div>`));
    });
    if (fb.komentar.length) {
      fbBox.appendChild(el(`<h3 style="margin-top:20px;font-size:0.9rem;">Komentar</h3>`));
      fb.komentar.forEach((k) => {
        fbBox.appendChild(el(`<div class="komentar-item"><div class="siapa">${k.nama}${k.nama_kelas ? " · " + k.nama_kelas : ""}</div><div>${k.komentar}</div></div>`));
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
          <h3 style="margin-bottom:4px;">${t.judul}</h3>
          <p class="lead" style="margin-top:0;margin-bottom:14px;">${t.nama_mapel} · ${t.jumlah_soal} soal · ${t.durasi_menit} menit · ${t.tanggal}</p>
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

async function mulaiTes(tesId) {
  try {
    const data = await api(`/api/siswa/tes/${tesId}/mulai`, { method: "POST" });
    state.sesiId = data.sesiId; state.soalAktif = data.soal; state.progress = data.progress; state.tesAktif = tesId;
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
      <div class="progress-row"><span>Soal ke-${state.progress.jumlah + 1} dari ${state.progress.total}</span></div>
      <div class="progress-bar"><div style="width:${pct}%"></div></div>
      <div class="soal-pertanyaan">${soal.pertanyaan}</div>
      <div class="opsi-list"></div>
      <div id="err"></div>
      <button class="btn btn-primary btn-block" id="lanjut" disabled>Jawab &amp; Lanjut</button>
    </div>
  `);

  let dipilih = null;
  const list = wrap.querySelector(".opsi-list");
  opsi.forEach(([huruf, teks]) => {
    const opt = el(`<div class="opsi"><span class="huruf">${huruf}</span><span>${teks}</span></div>`);
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
      if (data.selesai) {
        state.hasilTes = data.hasil;
        state.screen = "siswa-result";
      } else {
        state.soalAktif = data.soal; state.progress = data.progress;
        state.screen = "siswa-test";
      }
      render();
    } catch (e) {
      btn.disabled = false; btn.textContent = "Jawab & Lanjut";
      wrap.querySelector("#err").appendChild(el(`<p class="notice">${e.message}</p>`));
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
      <h2 style="margin-bottom:6px;">${state.kuesionerAktif.judul}</h2>
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
        <div class="p">${p.soal}</div>
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
      errBox.appendChild(el(`<p class="notice">${e.message}</p>`));
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
    const rows = list.map((h) => el(`<tr>${td(h.judul_tes)}${td(h.nama_mapel)}${td(h.nilai)}${td("Level " + h.level_akhir)}${td(fmtTanggal(h.selesai))}</tr>`));
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
