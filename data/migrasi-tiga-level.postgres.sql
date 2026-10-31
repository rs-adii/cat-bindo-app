-- =====================================================================
-- MIGRASI EvalSMK: 5 level -> 3 level (mudah / sedang / sulit) + kolom materi
-- =====================================================================
-- Untuk database Supabase yang SUDAH dibuat dengan skema lama (level 1-5).
-- Pemasangan baru TIDAK perlu menjalankan ini: data/schema.postgres.sql sudah
-- memakai 3 level dan kolom materi.
--
-- Cara pakai: buka Supabase -> SQL Editor -> New query -> tempel seluruh isi
-- berkas ini -> Run. Cukup SEKALI. Kalau terlanjur dijalankan lagi, tidak ada
-- yang berubah (dijaga tabel skema_versi).
--
-- Yang dilakukan:
--   1. Menambah kolom soal.materi (opsional).
--   2. Memetakan level lama ke level baru: 1-2 -> 1 (mudah), 3 -> 2 (sedang),
--      4-5 -> 3 (sulit) pada soal.tingkat_kesulitan, jawaban.level_saat_itu,
--      dan sesi_tes.level_akhir.
--   3. Mengganti batasan level dari 1-5 menjadi 1-3.
--   4. Untuk 46 soal bawaan/contoh (21 soal seed + 25 soal CSV contoh): memakai
--      pembagian level yang merata dan mengisi materinya, dicocokkan lewat
--      teks pertanyaan. Soal buatan guru hanya dipetakan sesuai langkah 2.
--
-- Nilai (sesi_tes.nilai) yang sudah tersimpan TIDAK dihitung ulang: nilai lama
-- memakai rumus tanpa bobot, nilai baru memakai bobot level.
-- =====================================================================

begin;

create table if not exists skema_versi (
  nama        text primary key,
  diterapkan  timestamptz not null default now()
);
alter table skema_versi enable row level security;

alter table soal add column if not exists materi text;

do $migrasi$
begin
  if not exists (select 1 from skema_versi where nama = 'tiga-level') then

    alter table soal drop constraint if exists soal_tingkat_kesulitan_check;

    update soal set tingkat_kesulitan =
      case when tingkat_kesulitan <= 2 then 1 when tingkat_kesulitan = 3 then 2 else 3 end;
    update jawaban set level_saat_itu =
      case when level_saat_itu <= 2 then 1 when level_saat_itu = 3 then 2 else 3 end;
    update sesi_tes set level_akhir =
      case when level_akhir <= 2 then 1 when level_akhir = 3 then 2 else 3 end
      where level_akhir is not null;

    alter table soal add constraint soal_tingkat_kesulitan_check
      check (tingkat_kesulitan between 1 and 3);

    update soal set tingkat_kesulitan = v.lv, materi = coalesce(soal.materi, v.materi)
    from (values
      ('Penulisan kata baku yang tepat sesuai PUEBI terdapat pada pilihan berikut.', 1, 'Ejaan'),
      ('Antonim dari kata ''optimis'' adalah...', 1, 'Kosakata'),
      ('Sinonim yang tepat untuk kata ''cepat'' adalah...', 1, 'Kosakata'),
      ('Kalimat yang menggunakan huruf kapital dengan tepat adalah...', 1, 'Ejaan'),
      ('Imbuhan yang tepat untuk melengkapi kalimat ''Ibu sedang ... nasi goreng di dapur'' adalah...', 1, 'Tata Bahasa'),
      ('Kalimat yang paling efektif di antara pilihan berikut adalah...', 1, 'Tata Bahasa'),
      ('(Bacaan: Setiap pagi, warga Desa Sukamaju bergotong royong membersihkan saluran air agar tidak tersumbat saat musim hujan tiba.) Paragraf tersebut termasuk jenis paragraf...', 1, 'Membaca'),
      ('Kata penghubung yang tepat untuk melengkapi kalimat ''Andi rajin belajar, ... nilainya selalu baik'' adalah...', 2, 'Tata Bahasa'),
      ('Kalimat ''Suaranya menggelegar bagai petir di siang bolong'' menggunakan majas...', 2, 'Sastra'),
      ('Kalimat berikut yang termasuk kalimat baku adalah...', 2, 'Tata Bahasa'),
      ('(Bacaan: Literasi digital menjadi keterampilan penting di era sekarang. Siswa dituntut mampu memilah informasi yang benar dari yang menyesatkan.) Ide pokok paragraf tersebut adalah...', 2, 'Membaca'),
      ('Penulisan kata serapan yang tepat adalah...', 2, 'Ejaan'),
      ('Struktur teks eksposisi yang tepat secara berurutan adalah...', 2, 'Menulis'),
      ('Kalimat ''Angin berbisik lembut di telinga dedaunan'' menggunakan majas...', 2, 'Sastra'),
      ('(Bacaan: Menabung sejak dini melatih siswa mengelola keuangan dengan bijak.) Simpulan yang tepat berdasarkan paragraf tersebut adalah...', 3, 'Membaca'),
      ('(Kutipan: Malam itu hujan turun deras. Rani duduk termenung di teras rumah kayu peninggalan neneknya...) Latar waktu dalam kutipan cerpen tersebut adalah...', 3, 'Sastra'),
      ('(Kutipan puisi: Di ladang sunyi kutanam harap, setiap pagi kusirami dengan doa...) Tema yang paling sesuai dengan kutipan puisi tersebut adalah...', 3, 'Sastra'),
      ('Kalimat berikut yang bermakna ambigu adalah...', 3, 'Tata Bahasa'),
      ('(Bacaan: Vaksinasi terbukti secara ilmiah mampu menurunkan angka kematian... Namun menurut saya pemerintah semestinya lebih gencar mengedukasi masyarakat.) Kalimat yang berupa opini dalam paragraf tersebut adalah...', 3, 'Menulis'),
      ('Penggunaan tanda baca yang tepat terdapat pada kalimat...', 3, 'Ejaan'),
      ('(Paragraf: (1) Sampah plastik menjadi masalah lingkungan yang mendesak. (2) Banyak sekolah menerapkan program bebas plastik. (3) Plastik ditemukan pertama kali abad ke-19. (4) Program ini menumbuhkan kebiasaan ramah lingkungan.) Kalimat yang tidak padu ditunjukkan oleh nomor...', 3, 'Membaca'),
      ('Penulisan kata baku yang tepat adalah...', 1, 'Ejaan'),
      ('Penulisan kata depan ''di'' yang benar terdapat pada kalimat...', 1, 'Ejaan'),
      ('Sinonim kata ''rajin'' adalah...', 1, 'Kosakata'),
      ('Antonim kata ''ramai'' adalah...', 1, 'Kosakata'),
      ('Tanda baca yang tepat untuk mengakhiri kalimat ''Siapa yang membawa payung itu'' adalah...', 1, 'Ejaan'),
      ('Kata dasar ''sapu'' yang mendapat awalan me- menjadi...', 1, 'Tata Bahasa'),
      ('Kalimat yang seluruh katanya baku adalah...', 1, 'Ejaan'),
      ('Penggunaan tanda koma yang tepat terdapat pada kalimat...', 1, 'Ejaan'),
      ('(Bacaan: Membaca buku setiap hari menambah kosakata. Kosakata yang kaya memudahkan kita menulis dan berbicara. Karena itu, kebiasaan membaca perlu dibangun sejak kecil.) Gagasan pokok paragraf tersebut adalah...', 2, 'Membaca'),
      ('Makna peribahasa ''Air tenang menghanyutkan'' adalah...', 2, 'Kosakata'),
      ('Kalimat ''Teriakannya memecahkan gendang telingaku'' mengandung majas...', 2, 'Sastra'),
      ('Kata penghubung yang tepat untuk melengkapi kalimat ''Dia tetap berangkat ke sekolah, ... badannya demam.'' adalah...', 2, 'Tata Bahasa'),
      ('Kalimat yang efektif adalah...', 2, 'Tata Bahasa'),
      ('(Kutipan: Sejak ayahnya meninggal, Doni mengantar koran sebelum fajar. Ia tidak pernah mengeluh karena ingin adiknya tetap bersekolah.) Watak tokoh Doni berdasarkan kutipan tersebut adalah...', 2, 'Sastra'),
      ('Kalimat yang mengandung kata bermakna konotatif adalah...', 2, 'Kosakata'),
      ('Dalam teks argumentasi, bagian yang berisi pendapat atau pernyataan sikap penulis terhadap suatu isu disebut...', 2, 'Menulis'),
      ('(Paragraf: Perubahan iklim mengancam produksi pangan. Suhu yang meningkat membuat panen gagal. Curah hujan yang tidak menentu merusak masa tanam. Akibatnya, harga pangan melambung.) Paragraf tersebut merupakan paragraf...', 2, 'Membaca'),
      ('Kalimat majemuk bertingkat terdapat pada kalimat...', 3, 'Tata Bahasa'),
      ('Majas yang terdapat pada kalimat ''Rajin sekali kamu, sudah pukul sepuluh baru bangun!'' adalah...', 3, 'Sastra'),
      ('(Kutipan puisi: Di peron tua kuhitung peluit kereta, satu demi satu, tanpa kau di dalamnya.) Suasana yang digambarkan dalam kutipan puisi tersebut adalah...', 3, 'Sastra'),
      ('Kalimat yang tidak memiliki subjek adalah...', 3, 'Tata Bahasa'),
      ('Kalimat yang paling efektif adalah...', 3, 'Tata Bahasa'),
      ('Penulisan kata berimbuhan yang benar adalah...', 3, 'Tata Bahasa'),
      ('Makna kata ''bergeming'' adalah...', 3, 'Kosakata'),
      ('(Bacaan: Siswa A sering tidur larut karena bermain gawai. Siswa B sulit berkonsentrasi di kelas karena kurang tidur akibat gawai. Nilai siswa C menurun setelah ia kerap begadang menonton video.) Simpulan yang tepat berdasarkan bacaan tersebut adalah...', 3, 'Membaca')
    ) as v(pertanyaan, lv, materi)
    where soal.pertanyaan = v.pertanyaan;

    insert into skema_versi (nama) values ('tiga-level');
  end if;
end
$migrasi$;

commit;
