// lib/sesiSupabase.js — logika menutup sesi tes untuk mode Netlify/Supabase.
// Padanan dari finalisasiSesi/sapuSesiKadaluarsa di server.js (mode lokal);
// aturan nilainya sama persis (lib/catEngineLevel.js, lib/timer.js).
const cat = require("./catEngineLevel");
const timer = require("./timer");

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
  return [...(data || [])].sort((a, b) => a.urutan - b.urutan);
}

// karenaWaktu=true: soal yang belum sempat dijawab dihitung salah (penyebut =
// jumlah soal tes) dan waktu selesai dicatat sebagai tenggatnya.
async function finalisasiSesi(supabase, sesi, tes, { karenaWaktu }) {
  const js = await ambilJawaban(supabase, sesi.sesites_id);
  const levelAkhir = levelDariJawaban(js);
  const pembagi = karenaWaktu ? tes.jumlah_soal : js.length;
  const nilai = cat.hitungNilai(js.map((r) => ({ benar: r.benar })), pembagi);
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

module.exports = { levelDariJawaban, ambilJawaban, finalisasiSesi, hasilDariSesiSelesai, sapuSesiKadaluarsa };
