// lib/daftar.js — aturan pendaftaran akun mandiri (dipakai Express & Netlify).
// Siswa bisa daftar langsung dengan memilih kelas. Guru wajib memasukkan kode guru
// yang diatur admin di halaman Pengaturan. Admin tidak bisa didaftarkan dari sini.

const POLA_USERNAME = /^[A-Za-z0-9._]{3,30}$/;

// Info untuk halaman daftar (boleh dibaca tanpa login; kode guru TIDAK ikut dikirim)
function infoDaftar(pengaturan, kelas) {
  return {
    buka: !!pengaturan.izinkan_daftar,
    guruBisa: !!pengaturan.izinkan_daftar && !!String(pengaturan.kode_guru || "").trim(),
    kelas: pengaturan.izinkan_daftar ? (kelas || []).map((k) => ({ kelas_id: k.kelas_id, nama_kelas: k.nama_kelas })) : [],
  };
}

// Mengembalikan { status, error } bila ditolak, atau { data } bila boleh disimpan.
// adaKelas(id) -> boolean (sinkron atau Promise), dipanggil hanya untuk siswa.
async function periksaDaftar(body, pengaturan, adaKelas) {
  const { nama, username, password, role, kelas_id, kodeGuru } = body || {};
  if (!pengaturan.izinkan_daftar) return { status: 403, error: "Pendaftaran akun sedang ditutup. Hubungi admin sekolah." };
  if (!["guru", "siswa"].includes(role)) return { status: 400, error: "Pilih daftar sebagai guru atau siswa." };
  const n = String(nama || "").trim();
  const u = String(username || "").trim();
  if (n.length < 2 || n.length > 100) return { status: 400, error: "Nama lengkap wajib diisi (2–100 karakter)." };
  if (!POLA_USERNAME.test(u)) return { status: 400, error: "Username 3–30 karakter, hanya huruf, angka, titik, atau garis bawah." };
  if (String(password || "").length < 6) return { status: 400, error: "Kata sandi minimal 6 karakter." };
  let kelas = null;
  if (role === "guru") {
    const kode = String(pengaturan.kode_guru || "").trim();
    if (!kode) return { status: 403, error: "Pendaftaran guru belum dibuka. Minta kode guru kepada admin sekolah." };
    if (String(kodeGuru || "").trim() !== kode) return { status: 403, error: "Kode guru salah." };
  } else {
    if (!kelas_id) return { status: 400, error: "Pilih kelas kamu." };
    if (!(await adaKelas(kelas_id))) return { status: 400, error: "Kelas tidak ditemukan." };
    kelas = Number(kelas_id);
  }
  return { data: { nama: n, username: u, password: String(password), role, kelas_id: kelas } };
}

// Kode guru hanya boleh dilihat admin
function saringPengaturan(p, role) {
  if (role === "admin") return p;
  const { kode_guru, ...sisa } = p;
  return sisa;
}

module.exports = { infoDaftar, periksaDaftar, saringPengaturan, POLA_USERNAME };
