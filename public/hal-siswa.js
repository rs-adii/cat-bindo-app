// hal-siswa.js — Beranda, Evaluasi Saya, Layar Tes (CAT), Hasil, Kuesioner
(function () {
  "use strict";
  const { h, kosongkan, api, post, kartu, kpi, batang, memuat, toast, modal, pilLevel, namaLevel,
    labelTanggal, bulat, rata } = window.UI;
  const { daftar, pergi, saatKeluar } = window.Shell;

  // `dibuka` dihitung server (tanggal WIB); server juga menolak tes yang belum dibuka.
  const belumDibuka = (t) => t.dibuka === false;
  const adaNilai = (n) => n !== null && n !== undefined;

  function mulaiTes(t) {
    if (t.status_saya === "ongoing") return pergi(`siswa/tes/${t.tes_id}`);
    modal({
      judul: "Mulai tes?",
      sub: t.judul,
      isi: h("div",
        h("p", { style: { margin: "0 0 10px" } }, `${t.jumlah_soal} soal · ${t.durasi_menit} menit. Waktu mulai berjalan saat tes dibuka dan tidak bisa dijeda.`),
        h("div.info-kotak", { style: { marginTop: 0 } }, "Soal dimulai dari tingkat sedang. Jawaban benar menaikkan tingkat soal berikutnya, jawaban salah menurunkannya. Jawaban yang sudah dikirim tidak bisa diubah.")),
      aksi: [{ teks: "Batal" }, { teks: "Mulai sekarang", kelas: "t-teal", klik: () => pergi(`siswa/tes/${t.tes_id}`) }],
    });
  }
  function tombolTes(t, kelasMulai = "t-teal") {
    if (t.status_saya === "selesai") {
      return h("button.tombol.t-garis", { onclick: () => pergi(t.sesi_saya ? `siswa/hasil/${t.sesi_saya}` : "siswa/hasil") },
        adaNilai(t.nilai_saya) ? `Selesai · nilai ${bulat(t.nilai_saya)}` : "Selesai · lihat hasil");
    }
    if (belumDibuka(t)) return h("button.tombol.t-abu", { disabled: true, title: "Tes dibuka pada tanggalnya" }, "Belum dibuka");
    return h("button", { class: "tombol " + kelasMulai, onclick: () => mulaiTes(t) }, t.status_saya === "ongoing" ? "Lanjutkan tes" : "Mulai tes");
  }

  // ============================================================ BERANDA
  daftar("siswa", "beranda", {
    judul: (u) => `Halo, ${String(u.nama).split(/\s+/)[0]}`,
    sub: "Ringkasan tes dan hasil belajarmu",
    async render(isi) {
      kosongkan(isi, memuat());
      const [tes, hasil, kuesioner] = await Promise.all([
        api("/api/siswa/tes-tersedia"), api("/api/siswa/hasil"), api("/api/siswa/kuesioner-saya"),
      ]);
      const menunggu = kuesioner.filter((k) => !k.sudahDiisi);
      const belum = tes.filter((t) => t.status_saya !== "selesai");
      // Tes berikutnya: yang sedang dikerjakan, lalu yang sudah dibuka, lalu terjadwal terdekat
      const berikut = [...belum].sort((a, b) => {
        const skor = (t) => (t.status_saya === "ongoing" ? 0 : belumDibuka(t) ? 2 : 1);
        return skor(a) - skor(b) || String(a.tanggal).localeCompare(String(b.tanggal));
      })[0];
      const terakhir = hasil[0];
      const nilaiAda = hasil.filter((r) => adaNilai(r.nilai));

      kosongkan(isi,
        h("div.grid.g-kpi-4",
          kpi("Tes tersedia", belum.length, "teal"), kpi("Tes selesai", hasil.length, "navy"),
          kpi("Rata-rata nilai", nilaiAda.length ? bulat(rata(nilaiAda.map((r) => r.nilai))) : "-", "teal"),
          kpi("Level terakhir", terakhir && terakhir.level_akhir ? namaLevel(terakhir.level_akhir) : "-", "amber")),
        h("div.grid.g-siswa.isi-penuh",
          berikut
            ? h("section.kartu.kartu-gelap.kartu-tes",
                h("div.label-atas", "Tes berikutnya"),
                h("h3", berikut.judul),
                h("p", `${berikut.jumlah_soal} soal · ${berikut.durasi_menit} menit · ${labelTanggal(berikut.tanggal)}`),
                h("p", "Soal menyesuaikan jawabanmu."),
                tombolTes(berikut, "t-oranye"))
            : h("section.kartu.kartu-gelap.kartu-tes", h("div.label-atas", "Tes berikutnya"), h("h3", "Belum ada tes"), h("p", "Semua tes sudah kamu kerjakan. Tes baru akan muncul di sini.")),
          kartu("Riwayat hasil", { aksi: hasil.length ? h("button.tautan", { type: "button", onclick: () => pergi("siswa/hasil") }, "Lihat semua") : null },
            hasil.length
              ? h("div.riwayat-jawaban", hasil.slice(0, 6).map((r) => h("div", { style: { gridTemplateColumns: "1fr auto 40px", cursor: "pointer" }, onclick: () => pergi(`siswa/hasil/${r.sesites_id}`) },
                  h("b", r.judul_tes), r.level_akhir ? pilLevel(r.level_akhir) : h("span"), h("span", { style: { textAlign: "right" } }, adaNilai(r.nilai) ? bulat(r.nilai) : "-"))))
              : h("p.kosong", "Belum ada tes yang selesai.")),
          kartu("Kuesioner menunggu", null,
            menunggu.length
              ? h("div.tumpuk", { style: { gap: "12px" } },
                  h("div.peringatan-kotak", `Kuesioner untuk ${menunggu[0].judul_tes} belum diisi.`, menunggu.length > 1 ? ` (+${menunggu.length - 1} lainnya)` : ""),
                  h("div", h("button.tombol.t-teal", { onclick: () => pergi(`siswa/kuesioner/${menunggu[0].tes_id}`) }, "Isi sekarang")))
              : h("p.kosong", "Tidak ada kuesioner yang menunggu."))));
    },
  });

  // ============================================================ EVALUASI SAYA
  daftar("siswa", "evaluasi", {
    judul: "Tes Tersedia",
    sub: "Pilih tes yang dijadwalkan untuk kelasmu",
    async render(isi) {
      kosongkan(isi, memuat());
      const tes = await api("/api/siswa/tes-tersedia");
      const urut = [...tes].sort((a, b) => {
        const skor = (t) => (t.status_saya === "ongoing" ? 0 : t.status_saya === "selesai" ? 3 : belumDibuka(t) ? 2 : 1);
        return skor(a) - skor(b) || String(a.tanggal).localeCompare(String(b.tanggal));
      });
      kosongkan(isi,
        urut.length
          ? h("div.grid.g-3s", urut.map((t) => h("section.kartu.kartu-tes",
              h("div.label-atas.teal", t.nama_mapel),
              h("h3", t.judul),
              h("p", `${t.jumlah_soal} soal · ${t.durasi_menit} menit`),
              h("p", labelTanggal(t.tanggal)),
              tombolTes(t))))
          : kartu(null, null, h("p.kosong", "Belum ada tes yang dijadwalkan untuk kelasmu.")),
        kartu("Cara kerja tes adaptif", null,
          h("p", { style: { margin: 0, color: "var(--redup)" } }, "Tes dimulai dari soal tingkat sedang. Jawaban benar menaikkan tingkat soal, jawaban salah menurunkannya, sampai jumlah soal tercapai. Soal sulit bernilai lebih tinggi pada skor akhir.")));
    },
  });

  // ============================================================ LAYAR TES
  function fmtWaktu(detik) {
    const d = Math.max(0, detik);
    const j = Math.floor(d / 3600);
    const m = Math.floor((d % 3600) / 60);
    const s = d % 60;
    const dua = (n) => String(n).padStart(2, "0");
    return j ? `${j}:${dua(m)}:${dua(s)}` : `${dua(m)}:${dua(s)}`;
  }

  daftar("siswa", "tes", {
    penuh: true,
    async render(akar, tesId) {
      kosongkan(akar, h("div.tes-layar", h("div.memuat", "Menyiapkan tes…")));
      document.title = "Tes — EvalSMK";
      let info, data;
      try {
        const daftarTes = await api("/api/siswa/tes-tersedia");
        info = daftarTes.find((t) => String(t.tes_id) === String(tesId));
        if (!info) throw new Error("Tes tidak ditemukan untuk kelasmu.");
        data = await post(`/api/siswa/tes/${tesId}/mulai`);
      } catch (e) {
        kosongkan(akar, h("div.tes-layar", h("div", { style: { maxWidth: "560px", margin: "0 auto", padding: "60px 16px" } },
          window.UI.galatKotak(e), h("button.tombol.t-navy", { style: { marginTop: "14px" }, onclick: () => pergi("siswa/evaluasi") }, "Kembali ke daftar tes"))));
        return;
      }
      if (data.selesai) return selesaiTes(data);

      const sesiId = data.sesiId;
      // Riwayat dari server, jadi tetap lengkap setelah muat ulang atau pindah perangkat
      const riwayat = Array.isArray(data.riwayat) ? [...data.riwayat] : [];
      let soal = data.soal;
      let progres = data.progress;
      let pilihan = null;
      let mengirim = false;
      let tenggat = Date.now() + data.sisaDetik * 1000;
      let peringatan5 = data.sisaDetik <= 300;
      let peringatan1 = data.sisaDetik <= 60;
      let memeriksaWaktu = false;

      const timer = h("div.timer", { role: "timer", "aria-label": "Sisa waktu" });
      const teksProgres = h("b");
      const isiProgres = h("i");
      const soalTeks = h("h2.soal-teks", { id: "soal-teks" });
      const opsiEl = h("div.opsi", { role: "radiogroup", "aria-labelledby": "soal-teks" });
      const tombolJawab = h("button.tombol.t-teal", { type: "button", disabled: true }, "Jawab dan lanjut");
      const galat = h("p.galat-teks", { hidden: true, role: "alert" });
      const chip = h("div.chip-level", [1, 2, 3].map((lv) => h("span", { "data-lv": lv }, namaLevel(lv))));
      const riwayatEl = h("div.riwayat-jawaban", { style: { maxHeight: "320px", overflow: "auto" } });

      function gambarSoal() {
        pilihan = null;
        tombolJawab.disabled = true;
        galat.hidden = true;
        teksProgres.textContent = `Soal ${progres.jumlah + 1} dari ${progres.total}`;
        isiProgres.style.width = (progres.jumlah / progres.total) * 100 + "%";
        soalTeks.textContent = soal.pertanyaan;
        kosongkan(opsiEl, ["A", "B", "C", "D"].map((L) => h("button", {
          type: "button", role: "radio", "aria-pressed": "false", "aria-checked": "false", "data-huruf": L,
          onclick: () => pilih(L),
        }, h("span.huruf", L), h("span", soal["opsi_" + L.toLowerCase()]))));
        chip.querySelectorAll("span").forEach((s) => s.classList.toggle("aktif", Number(s.dataset.lv) === Number(soal.level)));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      function gambarRiwayat() {
        kosongkan(riwayatEl, riwayat.length
          ? riwayat.map((r, i) => h("div", h("span", `Soal ${i + 1}`), r.level ? pilLevel(r.level) : h("span"),
              "benar" in r
                ? h("span", { class: r.benar ? "benar" : "salah" }, r.benar ? "Benar" : "Salah")
                : h("span", { style: { color: "var(--redup)", textAlign: "right", fontSize: "13px" } }, "Terkirim")))
          : h("p.kosong", { style: { padding: "4px 0" } }, "Belum ada jawaban."));
        riwayatEl.scrollTop = riwayatEl.scrollHeight;
      }
      function pilih(L) {
        if (mengirim) return;
        pilihan = L;
        opsiEl.querySelectorAll("button").forEach((b) => {
          const ya = b.dataset.huruf === L;
          b.setAttribute("aria-pressed", String(ya));
          b.setAttribute("aria-checked", String(ya));
        });
        tombolJawab.disabled = false;
      }
      async function jawab() {
        if (!pilihan || mengirim) return;
        mengirim = true;
        tombolJawab.disabled = true;
        tombolJawab.textContent = "Mengirim…";
        try {
          // `acak` dikirim balik supaya server menerjemahkan huruf pilihan dengan urutan opsi yang sama
          const r = await post(`/api/siswa/sesi/${sesiId}/jawab`, { soalId: soal.soal_id, jawabanHuruf: pilihan, acak: !!soal.acak });
          if (r.jawabanTadi) riwayat.push(r.jawabanTadi);
          if (r.selesai) return selesaiTes(r);
          soal = r.soal;
          progres = r.progress;
          if (typeof r.sisaDetik === "number") tenggat = Date.now() + r.sisaDetik * 1000;
          gambarSoal();
          gambarRiwayat();
        } catch (e) {
          galat.textContent = e.message;
          galat.hidden = false;
          tombolJawab.disabled = false;
        } finally {
          mengirim = false;
          tombolJawab.textContent = "Jawab dan lanjut";
        }
      }
      async function waktuHabis() {
        if (memeriksaWaktu) return;
        memeriksaWaktu = true;
        try {
          const r = await post(`/api/siswa/sesi/${sesiId}/selesai`);
          if (r.selesai) { toast("Waktu habis. Jawabanmu sudah disimpan."); return selesaiTes(r); }
          tenggat = Date.now() + r.sisaDetik * 1000; // jam perangkat tidak sinkron: ikuti server
        } catch (e) {
          galat.textContent = e.message; galat.hidden = false;
        } finally {
          memeriksaWaktu = false;
        }
      }
      function detak() {
        const sisa = Math.ceil((tenggat - Date.now()) / 1000);
        timer.textContent = fmtWaktu(sisa);
        timer.classList.toggle("kritis", sisa <= 60);
        if (!peringatan5 && sisa <= 300) { peringatan5 = true; toast("Sisa waktu 5 menit."); }
        if (!peringatan1 && sisa <= 60) { peringatan1 = true; toast("Sisa waktu 1 menit!", "galat"); }
        if (sisa <= 0) waktuHabis();
      }
      tombolJawab.addEventListener("click", jawab);
      const tekan = (e) => {
        if (e.target.closest && e.target.closest("input, textarea, select")) return;
        const L = e.key.toUpperCase();
        if (["A", "B", "C", "D"].includes(L)) pilih(L);
        else if (e.key === "Enter" && pilihan) { e.preventDefault(); jawab(); }
      };
      document.addEventListener("keydown", tekan);
      const id = setInterval(detak, 1000);
      saatKeluar(() => { clearInterval(id); document.removeEventListener("keydown", tekan); });

      kosongkan(akar, h("div.tes-layar",
        h("header.tes-atas",
          h("div", h("div.label-atas", "Evaluasi adaptif"), h("h1", info.nama_mapel || info.judul)),
          timer),
        h("main.tes-badan",
          h("div",
            h("div.tes-progres-teks", teksProgres, h("span", "Soal yang sudah muncul tidak diulang")),
            h("div.progres", isiProgres),
            h("section.kartu.soal-kartu", soalTeks, opsiEl),
            galat,
            h("div.tes-aksi", tombolJawab)),
          h("aside.tumpuk",
            kartu("Tingkat soal saat ini", null, chip,
              h("p", { style: { margin: 0, color: "var(--redup)", fontSize: "13.5px" } }, "Jawaban benar menaikkan tingkat soal berikutnya, jawaban salah menurunkannya.")),
            kartu("Riwayat jawaban", null, riwayatEl)))));
      document.title = `${info.judul} — EvalSMK`;
      gambarSoal();
      gambarRiwayat();
      detak();
    },
  });

  function selesaiTes(r) {
    const sesiId = r.hasil && r.hasil.sesiId;
    if (r.catatan) toast(r.catatan);
    pergi(sesiId ? `siswa/hasil/${sesiId}` : "siswa/hasil");
  }

  // ============================================================ HASIL
  function donat(nilai) {
    if (!adaNilai(nilai)) {
      return h("div.donat", { style: { background: "var(--abu)" }, role: "img", "aria-label": "Nilai belum ditampilkan" },
        h("div", h("div", h("b", { style: { fontSize: "34px" } }, "—"), h("small", "NILAI BELUM DITAMPILKAN"))));
    }
    const p = Math.max(0, Math.min(100, Number(nilai) || 0));
    return h("div.donat", { style: { background: `conic-gradient(var(--teal) ${p}%, var(--abu) 0)` }, role: "img", "aria-label": `Skor akhir ${bulat(nilai)} dari 100` },
      h("div", h("div", h("b", bulat(nilai)), h("small", "SKOR AKHIR"))));
  }
  daftar("siswa", "hasil", {
    judul: "Hasil Evaluasi",
    sub: "Ringkasan hasil evaluasimu",
    async render(isi, sesiParam) {
      kosongkan(isi, memuat());
      const hasil = await api("/api/siswa/hasil");
      if (!hasil.length) {
        kosongkan(isi, kartu(null, null, h("p.kosong", "Belum ada tes yang selesai."), h("button.tombol.t-teal", { onclick: () => pergi("siswa/evaluasi") }, "Lihat tes tersedia")));
        return;
      }
      const pilihanSesi = hasil.find((x) => String(x.sesites_id) === String(sesiParam)) || hasil[0];
      const r = await api(`/api/siswa/hasil/${pilihanSesi.sesites_id}`);

      const kuesionerKartu = r.kuesioner && r.kuesioner.ada
        ? h("section.kartu", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" } },
            h("div", h("h3", r.kuesioner.sudahDiisi ? "Terima kasih atas feedbackmu" : "Bagikan pengalamanmu"),
              h("p", { style: { margin: "4px 0 0", color: "var(--redup)" } }, r.kuesioner.sudahDiisi ? "Kuesioner untuk tes ini sudah kamu isi." : "Isi kuesioner feedback tentang pembelajaran.")),
            r.kuesioner.sudahDiisi ? null : h("button.tombol.t-oranye", { onclick: () => pergi(`siswa/kuesioner/${r.tes_id}`) }, "Isi kuesioner"))
        : null;

      const rincian = r.perLevel
        ? h("div.batang-daftar", [1, 2, 3].map((lv) => {
            const x = r.perLevel[lv] || { benar: 0, total: 0 };
            const b = batang(namaLevel(lv), x.benar, x.total || 1, `${x.benar}/${x.total}`);
            b.classList.add("lebar");
            return b;
          }))
        : h("p.kosong", { style: { padding: 0 } }, "Rincian jawaban benar akan terlihat setelah sekolah menampilkan nilai.");
      const alur = r.alur.length ? h("div.pil-deret", r.alur.map((x) => pilLevel(x.level))) : h("p.kosong", { style: { padding: 0 } }, "Tidak ada soal yang sempat dijawab.");

      const pilihHasil = hasil.length > 1
        ? h("select.kontrol", { "aria-label": "Pilih hasil tes", style: { marginTop: "18px" }, onchange: (e) => pergi(`siswa/hasil/${e.target.value}`) },
            hasil.map((x) => h("option", { value: x.sesites_id, selected: x.sesites_id === r.sesites_id }, x.judul_tes + (adaNilai(x.nilai) ? ` — ${bulat(x.nilai)}` : ""))))
        : null;

      kosongkan(isi, h("div.grid.g-2d.isi-penuh", { style: { gridTemplateColumns: "1fr 1.65fr", alignItems: "start" } },
        h("section.kartu", { style: { textAlign: "center", alignSelf: "stretch" } },
          donat(r.nilai),
          h("h3", { style: { fontSize: "19px", marginTop: "20px" } }, r.nama_mapel),
          h("p", { style: { margin: "4px 0 0", color: "var(--redup)", fontSize: "14.5px" } }, r.judul_tes),
          h("p", { style: { margin: "14px 0 0", color: "var(--redup)" } },
            `Level akhir: ${namaLevel(r.level_akhir)} · ${r.jumlahDijawab} soal`),
          r.jumlahDijawab < r.jumlah_soal ? h("p", { style: { margin: "6px 0 0", color: "var(--amber)", fontSize: "13.5px" } }, `Waktu habis sebelum ${r.jumlah_soal} soal selesai.`) : null,
          pilihHasil),
        h("div.tumpuk",
          kartu("Rincian jawaban benar per tingkat", null, rincian),
          kartu("Alur tingkat soal yang kamu terima", null, alur,
            h("p", { style: { margin: "12px 0 0", color: "var(--redup)", fontSize: "14px" } }, r.bobotAktif ? "Soal sulit bernilai lebih tinggi pada skor akhir." : "Semua soal bernilai sama pada skor akhir.")),
          kuesionerKartu)));
    },
  });

  // ============================================================ KUESIONER
  daftar("siswa", "kuesioner", {
    judul: "Kuesioner Feedback",
    sub: "Bantu guru memperbaiki pembelajaran",
    async render(isi, tesParam, ctx) {
      kosongkan(isi, memuat());
      const semua = await api("/api/siswa/kuesioner-saya");
      const menunggu = semua.filter((x) => !x.sudahDiisi);
      const dipilih = semua.find((x) => String(x.tes_id) === String(tesParam)) || menunggu[0];
      if (!dipilih) {
        kosongkan(isi, kartu(null, null,
          h("p.kosong", semua.length ? "Semua kuesioner sudah kamu isi. Terima kasih!" : "Belum ada kuesioner. Kuesioner muncul setelah kamu menyelesaikan tes."),
          h("button.tombol.t-teal", { onclick: () => pergi("siswa/beranda") }, "Kembali ke beranda")));
        return;
      }
      if (dipilih.sudahDiisi) {
        kosongkan(isi, kartu(dipilih.judul, null, h("p.kosong", "Kuesioner untuk tes ini sudah kamu isi. Terima kasih!"),
          h("button.tombol.t-teal", { onclick: () => pergi("siswa/beranda") }, "Kembali ke beranda")));
        return;
      }
      const k = await api(`/api/siswa/kuesioner/${dipilih.tes_id}`);
      const jawaban = {};
      const komentar = h("textarea.kontrol#komentar", { maxlength: 1000, rows: 4 });
      const galat = h("p.galat-teks", { hidden: true, role: "alert" });
      const tombol = h("button.tombol.t-teal", { type: "submit" }, "Kirim feedback");

      async function kirim(e) {
        e.preventDefault();
        galat.hidden = true;
        const kurang = k.pertanyaan.filter((p) => !jawaban[p.pertanyaan_kuesioner_id]);
        if (kurang.length) { galat.textContent = `Masih ada ${kurang.length} pernyataan yang belum dipilih skornya.`; galat.hidden = false; return; }
        tombol.disabled = true; tombol.textContent = "Mengirim…";
        try {
          await post("/api/siswa/kuesioner/submit", {
            jawaban: k.pertanyaan.map((p) => ({ pertanyaanId: p.pertanyaan_kuesioner_id, skor: jawaban[p.pertanyaan_kuesioner_id] })),
            komentar: komentar.value.trim(),
          });
          toast("Terima kasih! Feedbackmu sudah terkirim.");
          pergi("siswa/beranda");
        } catch (err) {
          galat.textContent = err.message; galat.hidden = false;
          tombol.disabled = false; tombol.textContent = "Kirim feedback";
        }
      }

      const pemilih = menunggu.length > 1
        ? h("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } }, h("label.label-isian", { for: "pilih-kuesioner" }, "Tes:"),
            h("select.kontrol#pilih-kuesioner", { style: { maxWidth: "380px" }, onchange: (e) => pergi(`siswa/kuesioner/${e.target.value}`) },
              menunggu.map((x) => h("option", { value: x.tes_id, selected: x === dipilih }, x.judul_tes))))
        : null;

      ctx.aturSub(`${k.judul} · ${dipilih.judul_tes}`);
      kosongkan(isi, pemilih, h("section.kartu.isi-penuh",
        h("form", { onsubmit: kirim },
          h("div.likert-kepala", h("span", "1 = Sangat tidak setuju"), h("span", "5 = Sangat setuju")),
          k.pertanyaan.map((p, i) => h("fieldset.likert-baris", { style: { border: 0, margin: 0, padding: "14px 0", borderBottom: "1px solid var(--garis)" } },
            h("legend.sr-only", p.soal),
            h("p", { "aria-hidden": "true" }, p.soal),
            h("div.likert-skala", [1, 2, 3, 4, 5].map((n) => h("label",
              h("input", { type: "radio", name: "q" + i, value: n, "aria-label": `${n}`, onchange: () => { jawaban[p.pertanyaan_kuesioner_id] = n; } }),
              String(n)))))),
          h("div.isian", { style: { marginTop: "20px" } }, h("label", { for: "komentar" }, "Masukan untuk guru (opsional)"), komentar),
          galat,
          h("div.kuesioner-kaki", h("span", k.anonim ? "Jawabanmu bersifat anonim." : "Nama kamu akan terlihat oleh guru bersama komentarmu."), tombol))));
    },
  });
})();
