// tests/api-suite.js — skenario uji API yang SAMA untuk mode lokal (Express+SQLite)
// dan mode Netlify (fungsi + tiruan Supabase). Adaptor menyediakan:
//   panggil(method, path, body, token) -> { status, body }
//   mundurkanSesi(sesiId, detik)        -> geser waktu mulai sesi ke belakang (uji waktu habis)
const { hariIni } = require("../lib/tanggal");

async function jalankan(A, label) {
  let lulus = 0;
  const gagal = [];
  const cek = (kondisi, pesan, info) => {
    if (kondisi) lulus += 1;
    else { gagal.push(pesan); console.log(`  ✗ ${pesan}`, info !== undefined ? JSON.stringify(info).slice(0, 300) : ""); }
  };
  const api = (m, p, b, t) => A.panggil(m, p, b, t);
  async function masuk(u, p, role) {
    const r = await api("POST", "/api/auth/login", { username: u, password: p, role });
    if (r.status !== 200) throw new Error(`login ${u} gagal: ${JSON.stringify(r.body)}`);
    return r.body.token;
  }
  const besok = (() => { const d = new Date(`${hariIni()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();

  // ---------------------------------------------------------------- 1. Auth & ubah sandi
  let r = await api("POST", "/api/auth/login", { username: "admin", password: "salah" });
  cek(r.status === 401, "login sandi salah -> 401", r);
  r = await api("POST", "/api/auth/login", { username: "siswa1", password: "siswa123", role: "guru" });
  cek(r.status === 403 && /terdaftar sebagai Siswa/.test(r.body.error), "login tab peran salah -> 403 dengan pesan", r);
  const tAdmin = await masuk("admin", "admin123", "admin");
  const tGuru = await masuk("guru1", "guru123", "guru");
  let tS1 = await masuk("siswa1", "siswa123", "siswa");
  const tS2 = await masuk("siswa2", "siswa123");
  r = await api("POST", "/api/auth/ubah-sandi", { sandiLama: "keliru", sandiBaru: "baru12345" }, tS1);
  cek(r.status === 400 && /lama salah/.test(r.body.error), "ubah sandi: sandi lama salah -> 400", r);
  r = await api("POST", "/api/auth/ubah-sandi", { sandiLama: "siswa123", sandiBaru: "123" }, tS1);
  cek(r.status === 400, "ubah sandi: terlalu pendek -> 400", r);
  r = await api("POST", "/api/auth/ubah-sandi", { sandiLama: "siswa123", sandiBaru: "rahasia99" }, tS1);
  cek(r.status === 200, "ubah sandi berhasil", r);
  r = await api("POST", "/api/auth/login", { username: "siswa1", password: "siswa123" });
  cek(r.status === 401, "sandi lama tidak berlaku lagi", r);
  tS1 = await masuk("siswa1", "rahasia99");
  r = await api("POST", "/api/auth/ubah-sandi", { sandiLama: "rahasia99", sandiBaru: "siswa123" }, tS1);
  cek(r.status === 200, "kembalikan sandi siswa1", r);
  r = await api("POST", "/api/auth/logout", {}, tS1);
  cek(r.status === 200, "logout -> 200", r);

  // ---------------------------------------------------------------- 2. Hak akses
  r = await api("GET", "/api/admin/users", null, tS1);
  cek(r.status === 403, "siswa buka data pengguna -> 403", r);
  r = await api("GET", "/api/guru/soal", null, null);
  cek(r.status === 401, "tanpa token -> 401", r);
  r = await api("PUT", "/api/pengaturan", { acak_opsi: false }, tGuru);
  cek(r.status === 403, "guru ubah pengaturan -> 403", r);

  // ---------------------------------------------------------------- 3. Pengaturan
  r = await api("GET", "/api/pengaturan", null, tS1);
  cek(r.status === 200 && r.body.acak_opsi === true && r.body.bobot_skor === true && /^\d{4}\/\d{4}$/.test(r.body.tahun_ajaran), "pengaturan bawaan terbaca siswa", r);
  for (const [salah, ket] of [[{ tahun_ajaran: "2026" }, "tahun ajaran"], [{ durasi_bawaan: 0 }, "durasi 0"], [{ acak_opsi: "ya" }, "bool teks"], [{ kunci_aneh: 1 }, "kunci tak dikenal"]]) {
    r = await api("PUT", "/api/pengaturan", salah, tAdmin);
    cek(r.status === 400, `pengaturan tidak valid (${ket}) -> 400`, r);
  }
  r = await api("PUT", "/api/pengaturan", { nama_sekolah: "SMK Negeri 1 Contoh", jumlah_soal_bawaan: 12 }, tAdmin);
  cek(r.status === 200 && r.body.nama_sekolah === "SMK Negeri 1 Contoh" && r.body.jumlah_soal_bawaan === 12 && r.body.acak_opsi === true, "simpan sebagian pengaturan", r);
  r = await api("GET", "/api/pengaturan", null, tGuru);
  cek(r.body.nama_sekolah === "SMK Negeri 1 Contoh", "pengaturan tersimpan permanen", r);

  // ---------------------------------------------------------------- 4. Pengguna & status akun
  const kelas = (await api("GET", "/api/admin/kelas", null, tAdmin)).body;
  const kelas1 = kelas.find((k) => k.nama_kelas === "XI Bahasa 1");
  const kelas2 = kelas.find((k) => k.nama_kelas === "XI Bahasa 2");
  r = await api("POST", "/api/admin/users", { nama: "Dimas", username: "siswa3", password: "siswa123", role: "siswa" }, tAdmin);
  cek(r.status === 400 && /kelas/.test(r.body.error), "siswa tanpa kelas -> 400", r);
  r = await api("POST", "/api/admin/users", { nama: "Dimas Pratama", username: "siswa3", password: "siswa123", role: "siswa", kelas_id: kelas1.kelas_id }, tAdmin);
  cek(r.status === 200, "tambah siswa3", r);
  const idS3 = r.body.users_id;
  r = await api("POST", "/api/admin/users", { nama: "Kembar", username: "siswa3", password: "siswa123", role: "siswa", kelas_id: kelas1.kelas_id }, tAdmin);
  cek(r.status === 409, "username kembar -> 409", r);
  let users = (await api("GET", "/api/admin/users", null, tAdmin)).body;
  cek(users.every((u) => u.aktif === 1), "semua akun awal aktif", users);
  const admin = users.find((u) => u.username === "admin");
  const s1 = users.find((u) => u.username === "siswa1");
  const tS3 = await masuk("siswa3", "siswa123");
  r = await api("PUT", `/api/admin/users/${idS3}`, { aktif: false }, tAdmin);
  cek(r.status === 200, "nonaktifkan siswa3", r);
  r = await api("POST", "/api/auth/login", { username: "siswa3", password: "siswa123" });
  cek(r.status === 403 && /dinonaktifkan/.test(r.body.error), "akun nonaktif tidak bisa login", r);
  r = await api("GET", "/api/siswa/tes-tersedia", null, tS3);
  cek(r.status === 401, "token lama akun nonaktif ditolak", r);
  users = (await api("GET", "/api/admin/users", null, tAdmin)).body;
  cek(users.find((u) => u.users_id === idS3).aktif === 0, "status nonaktif tampil di daftar", users);
  r = await api("PUT", `/api/admin/users/${idS3}`, { aktif: true, kelas_id: kelas2.kelas_id }, tAdmin);
  cek(r.status === 200, "aktifkan lagi + pindah kelas", r);
  r = await api("PUT", `/api/admin/users/${admin.users_id}`, { aktif: false }, tAdmin);
  cek(r.status === 400, "admin menonaktifkan diri -> 400", r);
  r = await api("PUT", `/api/admin/users/${admin.users_id}`, { role: "guru" }, tAdmin);
  cek(r.status === 400, "admin mengubah peran sendiri -> 400", r);
  r = await api("DELETE", `/api/admin/users/${admin.users_id}`, null, tAdmin);
  cek(r.status === 400, "admin menghapus diri -> 400", r);
  r = await api("PUT", `/api/admin/users/${idS3}`, { password: "123" }, tAdmin);
  cek(r.status === 400, "reset sandi terlalu pendek -> 400", r);

  // ---------------------------------------------------------------- 5. Kelas & mapel
  const mapel = (await api("GET", "/api/admin/mapel", null, tAdmin)).body;
  const bindo = mapel.find((m) => m.nama_mapel === "Bahasa Indonesia");
  r = await api("POST", "/api/admin/mapel", { nama_mapel: "Matematika" }, tAdmin);
  cek(r.status === 200, "tambah mapel", r);
  const idMtk = r.body.mapel_id;
  r = await api("PUT", `/api/admin/mapel/${idMtk}`, { nama_mapel: "Matematika Terapan" }, tAdmin);
  cek(r.status === 200, "ubah nama mapel", r);
  r = await api("PUT", `/api/admin/mapel/${idMtk}`, { nama_mapel: "Bahasa Indonesia" }, tAdmin);
  cek(r.status === 409, "ubah mapel ke nama yang sudah ada -> 409", r);
  r = await api("DELETE", `/api/admin/mapel/${bindo.mapel_id}`, null, tAdmin);
  cek(r.status === 409 && /masih punya soal/.test(r.body.error), "hapus mapel terpakai -> 409", r);
  r = await api("DELETE", `/api/admin/mapel/${idMtk}`, null, tAdmin);
  cek(r.status === 200, "hapus mapel kosong", r);
  r = await api("DELETE", `/api/admin/kelas/${kelas1.kelas_id}`, null, tAdmin);
  cek(r.status === 409, "hapus kelas terpakai -> 409", r);
  r = await api("PUT", `/api/admin/kelas/${kelas2.kelas_id}`, { nama_kelas: "", jurusan: "x" }, tAdmin);
  cek(r.status === 400, "ubah kelas nama kosong -> 400", r);

  // ---------------------------------------------------------------- 6. Jadwal tes & kunci tanggal
  r = await api("POST", "/api/guru/tes", { mapel_id: bindo.mapel_id, kelas_id: kelas1.kelas_id, judul: "Tes Besok", jumlah_soal: 5, durasi_menit: 30, tanggal: "31-10-2026" }, tGuru);
  cek(r.status === 400, "format tanggal salah -> 400", r);
  r = await api("POST", "/api/guru/tes", { mapel_id: bindo.mapel_id, kelas_id: kelas1.kelas_id, judul: "Tes Besok", jumlah_soal: 5, durasi_menit: 30, tanggal: besok }, tGuru);
  cek(r.status === 200, "buat tes untuk besok", r);
  const idTesBesok = r.body.tes_id;
  let tersedia = (await api("GET", "/api/siswa/tes-tersedia", null, tS1)).body;
  cek(tersedia.find((t) => t.tes_id === idTesBesok).dibuka === false, "tes besok ditandai belum dibuka", tersedia);
  r = await api("POST", `/api/siswa/tes/${idTesBesok}/mulai`, {}, tS1);
  cek(r.status === 403 && /baru dibuka/.test(r.body.error), "mulai tes sebelum tanggalnya -> 403", r);
  r = await api("POST", `/api/siswa/tes/${idTesBesok}/mulai`, {}, (await masuk("siswa3", "siswa123")));
  cek(r.status === 403, "siswa kelas lain -> 403", r);
  r = await api("DELETE", `/api/guru/tes/${idTesBesok}`, null, tGuru);
  cek(r.status === 200, "hapus tes yang belum dipakai", r);

  // ---------------------------------------------------------------- 7. CAT: semua benar, opsi diacak
  const bank = (await api("GET", "/api/guru/soal", null, tGuru)).body;
  const asli = Object.fromEntries(bank.map((s) => [s.soal_id, s]));
  const hurufBenar = (soal) => {
    const s = asli[soal.soal_id];
    const teks = s["opsi_" + s.kunci.toLowerCase()];
    return ["A", "B", "C", "D"].find((L) => soal["opsi_" + L.toLowerCase()] === teks);
  };
  const hurufSalah = (soal) => ["A", "B", "C", "D"].find((L) => L !== hurufBenar(soal));
  const tes1 = (await api("GET", "/api/siswa/tes-tersedia", null, tS1)).body.find((t) => /Eksposisi/.test(t.judul));
  r = await api("POST", `/api/siswa/tes/${tes1.tes_id}/mulai`, {}, tS1);
  cek(r.status === 200 && r.body.soal && r.body.soal.level === 2 && Array.isArray(r.body.riwayat), "mulai tes: soal pertama tingkat sedang", r);
  const sesi1 = r.body.sesiId;
  let soal = r.body.soal;
  const soalTes1 = [];
  let adaAcak = false;
  let semuaBenar = true;
  let hasil1 = null;
  for (let i = 0; i < 20 && soal; i++) {
    soalTes1.push(soal.soal_id);
    const s = asli[soal.soal_id];
    if (soal.acak && soal.opsi_a !== s.opsi_a) adaAcak = true;
    cek(!("kunci" in soal), "soal tidak membocorkan kunci", soal);
    if (i === 2) {
      const g = (await api("GET", "/api/guru/hasil", null, tGuru)).body;
      cek(g.some((x) => x.sesites_id === sesi1 && x.status === "ongoing" && x.tes_id === tes1.tes_id), "guru melihat siswa yang sedang mengerjakan", g);
      const ulang = await api("POST", `/api/siswa/tes/${tes1.tes_id}/mulai`, {}, tS1);
      cek(ulang.body.sesiId === sesi1 && ulang.body.riwayat.length === 2 && ulang.body.soal.soal_id === soal.soal_id, "muat ulang melanjutkan sesi + riwayat", ulang.body);
    }
    r = await api("POST", `/api/siswa/sesi/${sesi1}/jawab`, { soalId: soal.soal_id, jawabanHuruf: hurufBenar(soal), acak: soal.acak }, tS1);
    if (!r.body.jawabanTadi || r.body.jawabanTadi.benar !== true) semuaBenar = false;
    if (r.body.selesai) { hasil1 = r.body.hasil; break; }
    soal = r.body.soal;
  }
  cek(adaAcak, "urutan opsi benar-benar diacak untuk sebagian soal");
  cek(semuaBenar, "jawaban benar dikenali walau opsi diacak");
  cek(hasil1 && hasil1.nilai === 100 && hasil1.levelAkhir === 3 && hasil1.jumlahSoal === 10, "semua benar -> nilai 100, level akhir sulit", hasil1);
  r = await api("POST", `/api/siswa/sesi/${sesi1}/jawab`, { soalId: bank[0].soal_id, jawabanHuruf: "A" }, tS1);
  cek(r.status === 400, "jawab setelah sesi selesai -> 400", r);
  r = await api("POST", `/api/siswa/tes/${tes1.tes_id}/mulai`, {}, tS1);
  cek(r.status === 400, "tidak bisa mengulang tes yang sudah selesai", r);
  r = await api("GET", `/api/siswa/hasil/${sesi1}`, null, tS1);
  const totalPer = r.body.perLevel ? Object.values(r.body.perLevel).reduce((a, x) => a + x.total, 0) : 0;
  cek(r.status === 200 && r.body.nilai === 100 && totalPer === 10 && r.body.alur.length === 10 && r.body.alur[0].level === 2 && r.body.kuesioner.ada && !r.body.kuesioner.sudahDiisi,
    "rincian hasil: per tingkat, alur, status kuesioner", r.body);
  r = await api("GET", `/api/siswa/hasil/${sesi1}`, null, tS2);
  cek(r.status === 404, "siswa lain tidak bisa melihat hasil orang", r);

  // ---------------------------------------------------------------- 8. CAT: semua salah
  r = await api("POST", `/api/siswa/tes/${tes1.tes_id}/mulai`, {}, tS2);
  const sesi2 = r.body.sesiId;
  soal = r.body.soal;
  let hasil2 = null;
  for (let i = 0; i < 20 && soal; i++) {
    r = await api("POST", `/api/siswa/sesi/${sesi2}/jawab`, { soalId: soal.soal_id, jawabanHuruf: hurufSalah(soal), acak: soal.acak }, tS2);
    if (r.body.selesai) { hasil2 = r.body.hasil; break; }
    soal = r.body.soal;
  }
  cek(hasil2 && hasil2.nilai === 0 && hasil2.levelAkhir === 1, "semua salah -> nilai 0, level akhir mudah", hasil2);

  // ---------------------------------------------------------------- 9. Kuesioner
  const kq = (await api("GET", `/api/siswa/kuesioner/${tes1.tes_id}`, null, tS1)).body;
  cek(kq && kq.sudahDiisi === false && kq.pertanyaan.length === 5, "siswa melihat kuesioner belum diisi", kq);
  const isi = (skor) => kq.pertanyaan.map((p) => ({ pertanyaanId: p.pertanyaan_kuesioner_id, skor }));
  r = await api("POST", "/api/siswa/kuesioner/submit", { jawaban: isi(4) }, await masuk("siswa3", "siswa123"));
  cek(r.status === 403, "isi kuesioner sebelum menyelesaikan tes -> 403", r);
  r = await api("POST", "/api/siswa/kuesioner/submit", { jawaban: isi(4).slice(1) }, tS1);
  cek(r.status === 400, "kuesioner tidak lengkap -> 400", r);
  r = await api("POST", "/api/siswa/kuesioner/submit", { jawaban: isi(6) }, tS1);
  cek(r.status === 400, "skor di luar 1-5 -> 400", r);
  r = await api("POST", "/api/siswa/kuesioner/submit", { jawaban: isi(4), komentar: "Penjelasannya jelas, tambah latihan ya." }, tS1);
  cek(r.status === 200, "kirim kuesioner", r);
  r = await api("POST", "/api/siswa/kuesioner/submit", { jawaban: isi(5) }, tS1);
  cek(r.status === 409, "kirim kuesioner dua kali -> 409", r);
  r = await api("POST", "/api/siswa/kuesioner/submit", { jawaban: isi(2), komentar: "Waktunya kurang." }, tS2);
  cek(r.status === 200, "siswa2 kirim kuesioner", r);
  r = await api("GET", "/api/siswa/kuesioner-saya", null, tS1);
  cek(r.status === 200 && r.body.length === 1 && r.body[0].sudahDiisi === true && r.body[0].tes_id === tes1.tes_id, "daftar kuesioner-saya menandai sudah diisi", r.body);
  r = await api("POST", "/api/guru/kuesioner", { tes_id: tes1.tes_id, judul: "Dobel", pertanyaan: ["a"] }, tGuru);
  cek(r.status === 409, "buat kuesioner kedua untuk tes yang sama -> 409", r);
  const kGuru = (await api("GET", `/api/guru/kuesioner/${tes1.tes_id}`, null, tGuru)).body;
  cek(kGuru.jumlahRespon === 2, "guru melihat jumlah respon", kGuru);
  r = await api("PUT", `/api/guru/kuesioner/${tes1.tes_id}`, { judul: kGuru.judul, pertanyaan: ["Pertanyaan baru"] }, tGuru);
  cek(r.status === 409, "ubah pertanyaan setelah ada respon -> 409", r);
  r = await api("PUT", `/api/guru/kuesioner/${tes1.tes_id}`, { judul: "Judul Baru", pertanyaan: kGuru.pertanyaan.map((p) => p.soal) }, tGuru);
  cek(r.status === 200, "ubah judul saja tetap boleh", r);

  // ---------------------------------------------------------------- 10. Rekap feedback anonim / bernama
  let fb = (await api("GET", `/api/guru/feedback-summary/${tes1.tes_id}`, null, tGuru)).body;
  cek(fb.anonim === true && fb.jumlahResponden === 2 && fb.komentar.length === 2 && fb.komentar.every((k) => !("nama" in k)), "komentar anonim tanpa nama", fb);
  cek(Math.abs(fb.rataRata[0].rata - 3) < 0.001, "rata-rata per pertanyaan benar (4 dan 2 -> 3)", fb.rataRata);
  await api("PUT", "/api/pengaturan", { kuesioner_anonim: false }, tAdmin);
  fb = (await api("GET", `/api/guru/feedback-summary/${tes1.tes_id}`, null, tGuru)).body;
  cek(fb.anonim === false && fb.komentar.some((k) => k.nama === "Nadia Putri"), "kuesioner tidak anonim -> nama tampil", fb);
  await api("PUT", "/api/pengaturan", { kuesioner_anonim: true }, tAdmin);

  // ---------------------------------------------------------------- 11. Kuesioner tes baru: ubah sebelum ada respon
  r = await api("POST", "/api/guru/tes", { mapel_id: bindo.mapel_id, kelas_id: kelas1.kelas_id, judul: "Tes Kedua", jumlah_soal: 10, durasi_menit: 30, tanggal: hariIni() }, tGuru);
  const idTes2 = r.body.tes_id;
  r = await api("POST", "/api/guru/kuesioner", { tes_id: idTes2, judul: "Feedback", pertanyaan: ["Satu", "Dua"] }, tGuru);
  cek(r.status === 200, "buat kuesioner tes kedua", r);
  r = await api("PUT", `/api/guru/kuesioner/${idTes2}`, { judul: "Feedback", pertanyaan: ["Satu", "Dua", "Tiga"] }, tGuru);
  cek(r.status === 200, "ubah pertanyaan sebelum ada respon", r);
  r = await api("GET", `/api/guru/kuesioner/${idTes2}`, null, tGuru);
  cek(r.body.pertanyaan.map((p) => p.soal).join("|") === "Satu|Dua|Tiga", "pertanyaan terganti sesuai urutan", r.body);

  // ---------------------------------------------------------------- 12. Jangan ulang soal + bobot mati + nilai disembunyikan
  await api("PUT", "/api/pengaturan", { bobot_skor: false, tampilkan_nilai: false, acak_opsi: false }, tAdmin);
  r = await api("POST", `/api/siswa/tes/${idTes2}/mulai`, {}, tS1);
  const sesi3 = r.body.sesiId;
  soal = r.body.soal;
  cek(soal.acak === false, "acak opsi mati -> soal tidak diacak", soal);
  const soalTes2 = [];
  let benarTes2 = 0;
  let adaBenarBocor = false;
  let hasil3 = null;
  for (let i = 0; i < 20 && soal; i++) {
    soalTes2.push(soal.soal_id);
    const benarkan = i % 3 !== 0;
    if (benarkan) benarTes2 += 1;
    r = await api("POST", `/api/siswa/sesi/${sesi3}/jawab`, { soalId: soal.soal_id, jawabanHuruf: benarkan ? hurufBenar(soal) : hurufSalah(soal), acak: soal.acak }, tS1);
    if (r.body.jawabanTadi && "benar" in r.body.jawabanTadi) adaBenarBocor = true;
    if (r.body.selesai) { hasil3 = r.body.hasil; break; }
    soal = r.body.soal;
  }
  cek(soalTes2.every((id) => !soalTes1.includes(id)), "jangan ulang soal: tes kedua tidak memakai soal tes pertama", { soalTes1, soalTes2 });
  cek(!adaBenarBocor, "nilai disembunyikan: benar/salah tidak dikirim saat tes");
  cek(hasil3 && hasil3.nilai === null && hasil3.nilaiDisembunyikan === true, "nilai disembunyikan di hasil akhir", hasil3);
  r = await api("GET", "/api/siswa/hasil", null, tS1);
  cek(r.body.every((x) => x.nilai === null), "daftar hasil siswa tanpa nilai", r.body);
  r = await api("GET", `/api/siswa/hasil/${sesi3}`, null, tS1);
  cek(r.body.nilai === null && r.body.perLevel === null && r.body.alur.every((a) => !("benar" in a)) && r.body.tampilkanNilai === false, "rincian hasil tanpa nilai", r.body);
  const g3 = (await api("GET", "/api/guru/hasil", null, tGuru)).body.find((x) => x.sesites_id === sesi3);
  cek(g3 && g3.nilai === Math.round((benarTes2 / 10) * 100), "bobot mati -> nilai = proporsi benar (guru tetap melihat nilai)", { g3, benarTes2 });
  await api("PUT", "/api/pengaturan", { bobot_skor: true, tampilkan_nilai: true, acak_opsi: true }, tAdmin);

  // ---------------------------------------------------------------- 13. Waktu habis
  r = await api("POST", `/api/siswa/tes/${idTes2}/mulai`, {}, tS2);
  const sesi4 = r.body.sesiId;
  r = await api("POST", `/api/siswa/sesi/${sesi4}/jawab`, { soalId: r.body.soal.soal_id, jawabanHuruf: hurufBenar(r.body.soal), acak: r.body.soal.acak }, tS2);
  r = await api("POST", `/api/siswa/sesi/${sesi4}/selesai`, {}, tS2);
  cek(r.body.selesai === false && r.body.sisaDetik > 1700, "selesai sebelum waktunya -> server mengembalikan sisa waktu", r.body);
  await A.mundurkanSesi(sesi4, 31 * 60);
  r = await api("POST", `/api/siswa/sesi/${sesi4}/jawab`, { soalId: r.body.soal ? r.body.soal.soal_id : bank[1].soal_id, jawabanHuruf: "A" }, tS2);
  cek(r.body.selesai === true && r.body.hasil.waktuHabis === true && r.body.hasil.jumlahSoal === 1 && r.body.hasil.nilai > 0 && r.body.hasil.nilai < 50,
    "waktu habis: sesi ditutup, soal belum dijawab dihitung salah", r.body);

  // ---------------------------------------------------------------- 14. Hapus pengguna
  r = await api("DELETE", `/api/admin/users/${s1.users_id}`, null, tAdmin);
  cek(r.status === 409 && /Nonaktifkan/.test(r.body.error), "hapus siswa yang punya hasil -> 409", r);
  r = await api("POST", "/api/admin/users", { nama: "Sementara", username: "sementara", password: "abcdef", role: "guru" }, tAdmin);
  r = await api("DELETE", `/api/admin/users/${r.body.users_id}`, null, tAdmin);
  cek(r.status === 200, "hapus akun yang belum punya data", r);

  console.log(`${label}: ${lulus} pemeriksaan lulus, ${gagal.length} gagal`);
  return gagal.length === 0;
}

module.exports = { jalankan };
