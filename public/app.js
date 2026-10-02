// app.js — frontend SPA tanpa framework, berkomunikasi dengan backend via fetch()

const state = {
  screen: "home",
  nama: "",
  kelas: "",
  sessionId: null,
  currentItem: null,
  progress: { jumlah: 0, min: 8, max: 15 },
  selectedOpsi: null,
  hasil: null,
  dimensi: [],
  feedbackJawaban: {},
  error: null,
};

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan pada server.");
  return data;
}

function topbar(roleLabel, onBack) {
  const bar = el(`
    <div class="topbar">
      <div class="mark">SIEP <span>Bahasa Indonesia</span></div>
      <div class="role"></div>
    </div>
  `);
  const roleEl = bar.querySelector(".role");
  if (roleLabel) {
    roleEl.textContent = roleLabel + "  ";
    if (onBack) {
      const back = el(`<button class="link">Keluar</button>`);
      back.addEventListener("click", onBack);
      roleEl.appendChild(back);
    }
  }
  return bar;
}

function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.appendChild(SCREENS[state.screen]());
}

// ---------- HOME ----------
function screenHome() {
  const root = el(`<div></div>`);
  root.appendChild(topbar());
  const wrap = el(`
    <div class="wrap center">
      <p class="eyebrow">Sistem Informasi Evaluasi Pembelajaran</p>
      <h1 class="display">Bahasa Indonesia, diuji secara adaptif.</h1>
      <p class="lead">Tingkat kesulitan soal menyesuaikan kemampuanmu saat tes berjalan, lalu masukanmu tentang pembelajaran dikumpulkan lewat kuesioner singkat untuk gurumu.</p>
      <div class="choice-row">
        <button class="btn btn-primary" id="go-siswa">Mulai sebagai Siswa</button>
        <button class="btn btn-outline" id="go-guru">Masuk sebagai Guru</button>
      </div>
    </div>
  `);
  wrap.querySelector("#go-siswa").addEventListener("click", () => {
    state.screen = "student-start";
    render();
  });
  wrap.querySelector("#go-guru").addEventListener("click", () => {
    state.screen = "teacher-dashboard";
    render();
  });
  root.appendChild(wrap);
  return root;
}

// ---------- SISWA: mulai ----------
function screenStudentStart() {
  const root = el(`<div></div>`);
  root.appendChild(topbar("Siswa", goHome));
  const wrap = el(`
    <div class="wrap">
      <h2 style="margin-bottom:6px;">Sebelum mulai</h2>
      <p class="lead" style="margin-top:0;margin-bottom:28px;">Tes berisi 8–15 soal pilihan ganda yang menyesuaikan tingkat kesulitan dengan jawabanmu.</p>
      <div class="field">
        <label for="in-nama">Nama lengkap</label>
        <input id="in-nama" type="text" placeholder="Tulis namamu" />
      </div>
      <div class="field">
        <label for="in-kelas">Kelas (opsional)</label>
        <input id="in-kelas" type="text" placeholder="Contoh: XI TKJ 2" />
      </div>
      <div id="err"></div>
      <button class="btn btn-primary btn-block" id="mulai">Mulai Tes</button>
    </div>
  `);
  wrap.querySelector("#mulai").addEventListener("click", async () => {
    const nama = wrap.querySelector("#in-nama").value.trim();
    const kelas = wrap.querySelector("#in-kelas").value.trim();
    const errBox = wrap.querySelector("#err");
    errBox.innerHTML = "";
    if (!nama) {
      errBox.appendChild(el(`<p class="notice">Nama wajib diisi.</p>`));
      return;
    }
    try {
      const data = await api("/api/session/start", {
        method: "POST",
        body: JSON.stringify({ nama, kelas }),
      });
      state.nama = nama;
      state.kelas = kelas;
      state.sessionId = data.sessionId;
      state.currentItem = data.item;
      state.progress = data.progress;
      state.selectedOpsi = null;
      state.screen = "student-test";
      render();
    } catch (e) {
      errBox.appendChild(el(`<p class="notice">${e.message}</p>`));
    }
  });
  root.appendChild(wrap);
  return root;
}

// ---------- SISWA: mengerjakan soal ----------
function screenStudentTest() {
  const root = el(`<div></div>`);
  root.appendChild(topbar("Siswa — " + state.nama, goHome));
  const item = state.currentItem;
  const pct = Math.min(100, Math.round((state.progress.jumlah / state.progress.max) * 100));
  const huruf = ["A", "B", "C", "D"];

  const wrap = el(`
    <div class="wrap">
      <div class="progress-row">
        <span>Soal ke-${state.progress.jumlah + 1}</span>
        <span>Minimal ${state.progress.min}, maksimal ${state.progress.max} soal</span>
      </div>
      <div class="progress-bar"><div style="width:${pct}%"></div></div>
      <span class="tag">${item.kompetensi}</span>
      ${item.teks ? `<div class="soal-teks">${item.teks}</div>` : ""}
      <div class="soal-pertanyaan">${item.pertanyaan}</div>
      <div class="opsi-list"></div>
      <div id="err"></div>
      <button class="btn btn-primary btn-block" id="lanjut" disabled>Jawab &amp; Lanjut</button>
    </div>
  `);

  const list = wrap.querySelector(".opsi-list");
  item.opsi.forEach((teks, idx) => {
    const opt = el(`
      <div class="opsi" data-idx="${idx}">
        <span class="huruf">${huruf[idx]}</span>
        <span>${teks}</span>
      </div>
    `);
    opt.addEventListener("click", () => {
      state.selectedOpsi = idx;
      list.querySelectorAll(".opsi").forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      wrap.querySelector("#lanjut").disabled = false;
    });
    list.appendChild(opt);
  });

  wrap.querySelector("#lanjut").addEventListener("click", async () => {
    const btn = wrap.querySelector("#lanjut");
    btn.disabled = true;
    btn.textContent = "Mengirim...";
    try {
      const data = await api(`/api/session/answer`, {
        method: "POST",
        body: JSON.stringify({ sessionId: state.sessionId, itemId: item.id, jawaban: state.selectedOpsi }),
      });
      if (data.selesai) {
        state.hasil = data.hasil;
        state.screen = "student-result";
      } else {
        state.currentItem = data.item;
        state.progress = data.progress;
        state.selectedOpsi = null;
        state.screen = "student-test";
      }
      render();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Jawab & Lanjut";
      wrap.querySelector("#err").innerHTML = "";
      wrap.querySelector("#err").appendChild(el(`<p class="notice">${e.message}</p>`));
    }
  });

  root.appendChild(wrap);
  return root;
}

// ---------- SISWA: hasil ----------
function screenStudentResult() {
  const root = el(`<div></div>`);
  root.appendChild(topbar("Siswa — " + state.nama, goHome));
  const h = state.hasil;
  const wrap = el(`
    <div class="wrap center">
      <p class="eyebrow">Tes selesai</p>
      <div class="hasil-skor">
        <div class="angka">${h.skor}</div>
        <div class="kategori">${h.kategori}</div>
      </div>
      <div class="hasil-meta">
        <span>Estimasi kemampuan (θ): ${h.theta}</span>
        <span>Standard error: ${h.se}</span>
        <span>Jumlah soal: ${h.jumlahButir}</span>
      </div>
      <p class="lead" style="margin-top:28px;">Satu langkah lagi — isi kuesioner singkat tentang pembelajaran Bahasa Indonesia di kelasmu.</p>
      <button class="btn btn-accent btn-block" id="ke-kuesioner">Isi Kuesioner</button>
    </div>
  `);
  wrap.querySelector("#ke-kuesioner").addEventListener("click", async () => {
    if (state.dimensi.length === 0) {
      state.dimensi = await api("/api/meta/dimensi");
    }
    state.feedbackJawaban = {};
    state.screen = "student-feedback";
    render();
  });
  root.appendChild(wrap);
  return root;
}

// ---------- SISWA: kuesioner ----------
function screenStudentFeedback() {
  const root = el(`<div></div>`);
  root.appendChild(topbar("Siswa — " + state.nama, goHome));
  const wrap = el(`
    <div class="wrap">
      <h2 style="margin-bottom:6px;">Bagaimana pembelajarannya?</h2>
      <p class="lead" style="margin-top:0;margin-bottom:10px;">Jawabanmu bersifat anonim untuk guru — hanya ringkasan kelas yang ditampilkan.</p>
      <div id="likerts"></div>
      <div class="field" style="margin-top:22px;">
        <label for="komentar">Saran atau komentar (opsional)</label>
        <textarea id="komentar" placeholder="Tulis masukanmu di sini..."></textarea>
      </div>
      <div id="err"></div>
      <button class="btn btn-primary btn-block" id="kirim">Kirim Kuesioner</button>
    </div>
  `);

  const skala = [1, 2, 3, 4, 5];
  const box = wrap.querySelector("#likerts");
  state.dimensi.forEach((d) => {
    const row = el(`
      <div class="likert-row">
        <div class="pernyataan">${d.pernyataan}</div>
        <div class="likert-scale"></div>
        <div class="likert-caption"><span>Sangat tidak setuju</span><span>Sangat setuju</span></div>
      </div>
    `);
    const scale = row.querySelector(".likert-scale");
    skala.forEach((n) => {
      const opt = el(`<div class="likert-opt">${n}</div>`);
      opt.addEventListener("click", () => {
        state.feedbackJawaban[d.id] = n;
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
    if (Object.keys(state.feedbackJawaban).length < state.dimensi.length) {
      errBox.appendChild(el(`<p class="notice">Isi semua pernyataan sebelum mengirim.</p>`));
      return;
    }
    const komentar = wrap.querySelector("#komentar").value;
    try {
      await api("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.sessionId, jawaban: state.feedbackJawaban, komentar }),
      });
      state.screen = "student-done";
      render();
    } catch (e) {
      errBox.appendChild(el(`<p class="notice">${e.message}</p>`));
    }
  });

  root.appendChild(wrap);
  return root;
}

function screenStudentDone() {
  const root = el(`<div></div>`);
  root.appendChild(topbar("Siswa", goHome));
  const wrap = el(`
    <div class="wrap center">
      <p class="eyebrow">Terima kasih</p>
      <h1 class="display">Selesai, ${state.nama}.</h1>
      <p class="lead">Hasil tes dan kuesionermu sudah tersimpan dan dapat dilihat gurumu di dasbor.</p>
      <button class="btn btn-outline" id="lagi" style="margin-top:24px;">Kembali ke Beranda</button>
    </div>
  `);
  wrap.querySelector("#lagi").addEventListener("click", goHome);
  root.appendChild(wrap);
  return root;
}

// ---------- GURU: dasbor ----------
function badgeFor(kategori) {
  const cls = kategori === "Sangat Baik" || kategori === "Baik" ? "good" : kategori === "Cukup" ? "mid" : "low";
  return `<span class="badge ${cls}">${kategori}</span>`;
}

function screenTeacherDashboard() {
  const root = el(`<div></div>`);
  root.appendChild(topbar("Guru", goHome));
  const wrap = el(`
    <div class="wrap wide">
      <p class="eyebrow">Dasbor Guru</p>
      <h1 class="display" style="font-size:1.7rem;">Hasil tes dan masukan siswa.</h1>

      <h3 class="section-title">Hasil Tes Adaptif</h3>
      <div id="tabel-sesi"><p class="empty">Memuat…</p></div>

      <h3 class="section-title">Ringkasan Kuesioner Feedback</h3>
      <div id="ringkasan-feedback"><p class="empty">Memuat…</p></div>

      <h3 class="section-title">Komentar Siswa</h3>
      <div id="daftar-komentar"><p class="empty">Memuat…</p></div>

      <h3 class="section-title">Statistik Butir Soal</h3>
      <div id="tabel-butir"><p class="empty">Memuat…</p></div>
    </div>
  `);
  root.appendChild(wrap);
  loadTeacherData(wrap);
  return root;
}

async function loadTeacherData(wrap) {
  try {
    const [sesi, fb, butir] = await Promise.all([
      api("/api/teacher/sessions"),
      api("/api/teacher/feedback-summary"),
      api("/api/teacher/item-stats"),
    ]);
    renderSesi(wrap.querySelector("#tabel-sesi"), sesi);
    renderRingkasanFeedback(wrap.querySelector("#ringkasan-feedback"), fb);
    renderKomentar(wrap.querySelector("#daftar-komentar"), fb.komentar);
    renderButir(wrap.querySelector("#tabel-butir"), butir);
  } catch (e) {
    wrap.querySelectorAll(".empty").forEach((n) => (n.textContent = "Gagal memuat data: " + e.message));
  }
}

function renderSesi(box, sesi) {
  box.innerHTML = "";
  if (sesi.length === 0) {
    box.appendChild(el(`<p class="empty">Belum ada siswa yang menyelesaikan tes.</p>`));
    return;
  }
  const rows = sesi
    .map(
      (s) => `<tr>
        <td>${s.nama}</td><td>${s.kelas || "—"}</td>
        <td>${s.skor}</td><td>${badgeFor(s.kategori)}</td>
        <td>${s.jumlahButir}</td>
        <td>${new Date(s.selesai).toLocaleString("id-ID")}</td>
      </tr>`
    )
    .join("");
  box.appendChild(
    el(`<table>
      <thead><tr><th>Nama</th><th>Kelas</th><th>Skor</th><th>Kategori</th><th>Jumlah Soal</th><th>Selesai</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`)
  );
}

function renderRingkasanFeedback(box, fb) {
  box.innerHTML = "";
  if (fb.jumlahResponden === 0) {
    box.appendChild(el(`<p class="empty">Belum ada kuesioner yang masuk.</p>`));
    return;
  }
  const info = el(`<p style="font-size:0.85rem;color:var(--ink-soft);margin-bottom:14px;">${fb.jumlahResponden} responden</p>`);
  box.appendChild(info);
  fb.rataRata.forEach((d) => {
    if (d.rata === null) return;
    const pct = (d.rata / 5) * 100;
    box.appendChild(
      el(`<div class="bar-row">
        <div class="bar-label">${d.dimensi}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-val">${d.rata}</div>
      </div>`)
    );
  });
}

function renderKomentar(box, komentar) {
  box.innerHTML = "";
  if (!komentar || komentar.length === 0) {
    box.appendChild(el(`<p class="empty">Belum ada komentar.</p>`));
    return;
  }
  komentar.forEach((k) => {
    box.appendChild(
      el(`<div class="komentar-item">
        <div class="siapa">${k.nama}${k.kelas ? " · " + k.kelas : ""}</div>
        <div>${k.teks}</div>
      </div>`)
    );
  });
}

function renderButir(box, butir) {
  box.innerHTML = "";
  const rows = butir
    .map(
      (b) => `<tr>
        <td>${b.id}</td><td>${b.kompetensi}</td><td>${b.kesulitan.toFixed(1)}</td>
        <td>${b.dipakai}</td><td>${b.proporsiBenar === null ? "—" : Math.round(b.proporsiBenar * 100) + "%"}</td>
      </tr>`
    )
    .join("");
  box.appendChild(
    el(`<table>
      <thead><tr><th>Kode</th><th>Kompetensi</th><th>Kesulitan (b)</th><th>Dipakai</th><th>% Dijawab Benar</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`)
  );
}

function goHome() {
  state.screen = "home";
  state.sessionId = null;
  state.currentItem = null;
  state.hasil = null;
  render();
}

const SCREENS = {
  home: screenHome,
  "student-start": screenStudentStart,
  "student-test": screenStudentTest,
  "student-result": screenStudentResult,
  "student-feedback": screenStudentFeedback,
  "student-done": screenStudentDone,
  "teacher-dashboard": screenTeacherDashboard,
};

render();
