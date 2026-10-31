// lib/sesiSupabase.js — logika menutup sesi tes untuk mode Netlify/Supabase.
// Padanan dari finalisasiSesi/sapuSesiKadaluarsa di server.js (mode lokal);
// aturan nilainya sama persis (lib/catEngineLevel.js, lib/timer.js).
const cat = require("./catEngineLevel");
const timer = require("./timer");
const ringkasan = require("./ringkasan");
const { pembangkitSoal } = require("./acakOpsi");
const { ambilPengaturan } = require("./netlifyBersama");

function levelDariJawaban(js) {
  if (js.length === 0) return cat.START_LEVEL;
  const last = js[js.length - 1];
  return cat.nextLevel(last.level_saat_itu, !!last.benar);
}
function bentukHasil(sesiId, nilai, levelAkhir, jumlahSoal, tes, waktuHabis) {
  return {
    sesiId: Number(sesiId), nilai, kategori: cat.kategoriNilai(nilai), levelAkhir,
    jumlahSoal, jumlahTarget: tes.jumlah_soal, waktuHabis: !!waktuHabis,
  };
}

async function ambilJawaban(supabase, sesiId) {
  const { data, error } = await supabase.from("jawaban").select("*").eq("sesi_id", sesiId);
  if (error) throw new Error(error.message);
  const js = [...(data || [])].sort((a, b) => a.urutan - b.urutan);
  if (js.length === 0) return js;

  // level_soal = tingkat kesulitan SOAL yang dijawab (dasar bobot nilai)
  const { data: soalList, error: errSoal } = await supabase
    .from("soal").select("*").in("soal_id", js.map((j) => j.soal_id));
  if (errSoal) throw new Error(errSoal.message);
  const levelSoal = Object.fromEntries((soalList || []).map((s) => [String(s.soal_id), s.tingkat_kesulitan]));
  return js.map((j) => ({ ...j, level_soal: levelSoal[String(j.soal_id)] }));
}

// Nilai berbobot level soal (mudah 1, sedang 2, sulit 3), kecuali pengaturan
// "Bobot skor per level" dimatikan.
// karenaWaktu=true: soal yang belum sempat dijawab dihitung salah (bobot level
// siswa saat itu) dan waktu selesai dicatat sebagai tenggatnya.
async function finalisasiSesi(supabase, sesi, tes, { karenaWaktu }) {
  const js = await ambilJawaban(supabase, sesi.sesites_id);
  const levelAkhir = levelDariJawaban(js);
  const nilai = cat.hitungNilai(
    js.map((r) => ({ benar: r.benar, level: r.level_soal || r.level_saat_itu })),
    {
      belumDijawab: karenaWaktu ? Math.max(0, tes.jumlah_soal - js.length) : 0,
      levelBelumDijawab: levelAkhir,
      ...ringkasan.opsiNilai(await ambilPengaturan(supabase)),
    }
  );
  const selesaiAt = karenaWaktu
    ? new Date(timer.tenggatMs(sesi.mulai, tes.durasi_menit)).toISOString()
    : new Date().toISOString();
  const { error } = await supabase.from("sesi_tes")
    .update({ status: "selesai", nilai, level_akhir: levelAkhir, selesai: selesaiAt })
    .eq("sesites_id", sesi.sesites_id);
  if (error) throw new Error(error.message);
  return bentukHasil(sesi.sesites_id, nilai, levelAkhir, js.length, tes, karenaWaktu);
}

async function hasilDariSesiSelesai(supabase, sesi, tes) {
  const js = await ambilJawaban(supabase, sesi.sesites_id);
  return bentukHasil(sesi.sesites_id, sesi.nilai, sesi.level_akhir, js.length, tes, js.length < tes.jumlah_soal);
}

// Sesi 'ongoing' yang waktunya sudah lewat (siswa menutup tab / pergi) ditutup otomatis.
async function sapuSesiKadaluarsa(supabase) {
  const { data: ongoing } = await supabase.from("sesi_tes").select("*").eq("status", "ongoing");
  if (!ongoing || ongoing.length === 0) return;
  const { data: tesList } = await supabase.from("tes").select("*");
  const tesMap = Object.fromEntries((tesList || []).map((t) => [t.tes_id, t]));
  for (const sesi of ongoing) {
    const tes = tesMap[sesi.tes_id];
    if (tes && timer.sisaDetik(sesi.mulai, tes.durasi_menit) <= -timer.GRACE_DETIK) {
      await finalisasiSesi(supabase, sesi, tes, { karenaWaktu: true });
    }
  }
}

// Soal berikutnya: level target, tidak mengulang soal di sesi ini, dan (bila
// pengaturan "Jangan ulang soal" aktif) mengutamakan soal yang belum pernah
// diterima siswa ini di tes lain.
async function soalBerikutnya(supabase, sesi, tes, usedIds, level, peng) {
  const { data: pool, error } = await supabase.from("soal").select("*").eq("mapel_id", tes.mapel_id);
  if (error) throw new Error(error.message);
  let hindari = null;
  if (peng.jangan_ulang_soal) {
    const { data: sesiLain } = await supabase.from("sesi_tes").select("*").eq("siswa_id", sesi.siswa_id);
    const idLain = (sesiLain || []).map((x) => x.sesites_id).filter((id) => Number(id) !== Number(sesi.sesites_id));
    if (idLain.length) {
      const { data: jLain } = await supabase.from("jawaban").select("*").in("sesi_id", idLain);
      hindari = new Set((jLain || []).map((x) => x.soal_id));
    }
  }
  const urut = [...(pool || [])].sort((a, b) => Number(a.soal_id) - Number(b.soal_id));
  return cat.pickByLevel(urut, usedIds, level, hindari, pembangkitSoal(sesi.sesites_id, usedIds.size));
}

// Apakah siswa sudah mengisi kuesioner ini (ada respon untuk salah satu pertanyaannya)
async function sudahIsiKuesioner(supabase, kuesionerId, siswaId) {
  const { data: pertanyaan } = await supabase.from("pertanyaan_kuesioner").select("*").eq("kuesioner_id", kuesionerId);
  const ids = (pertanyaan || []).map((p) => p.pertanyaan_kuesioner_id);
  if (!ids.length) return false;
  const { data: respon } = await supabase.from("respon_kuesioner").select("*").eq("siswa_id", siswaId).in("pertanyaan_id", ids);
  return (respon || []).length > 0;
}

module.exports = {
  levelDariJawaban, ambilJawaban, finalisasiSesi, hasilDariSesiSelesai, sapuSesiKadaluarsa,
  soalBerikutnya, sudahIsiKuesioner,
};
