-- =====================================================================
-- EvalSMK: ganti 5 pernyataan kuesioner contoh menjadi 9 pernyataan (Bab III 3.2d)
-- =====================================================================
-- Hanya mengubah kuesioner yang pertanyaannya PERSIS 5 pernyataan contoh lama
-- dan BELUM pernah diisi siswa. Kuesioner buatan guru tidak disentuh.
-- Cara pakai: Supabase -> SQL Editor -> New query -> tempel -> Run. Aman diulang.
-- =====================================================================
begin;

with lama(soal) as (values
  ('Penjelasan materi Bahasa Indonesia yang diberikan guru mudah saya pahami.'),
  ('Guru menggunakan metode mengajar yang membuat saya aktif belajar.'),
  ('Media dan latihan soal yang digunakan membantu saya memahami materi.'),
  ('Saya merasa nyaman bertanya dan berpendapat selama pembelajaran.'),
  ('Soal tes yang diberikan sesuai dengan materi yang telah diajarkan.')
),
sasaran as (
  select k.kuesioner_id
  from kuesioner k
  where (select count(*) from pertanyaan_kuesioner p where p.kuesioner_id = k.kuesioner_id) = 5
    and not exists (select 1 from pertanyaan_kuesioner p where p.kuesioner_id = k.kuesioner_id
                    and p.soal not in (select soal from lama))
    and not exists (select 1 from respon_kuesioner r join pertanyaan_kuesioner p
                    on p.pertanyaan_kuesioner_id = r.pertanyaan_id where p.kuesioner_id = k.kuesioner_id)
),
hapus as (
  delete from pertanyaan_kuesioner where kuesioner_id in (select kuesioner_id from sasaran) returning kuesioner_id
)
insert into pertanyaan_kuesioner (kuesioner_id, soal)
select s.kuesioner_id, b.soal
from (select distinct kuesioner_id from hapus) s
cross join (values
  (1, 'Guru menjelaskan materi dengan jelas dan mudah dipahami.'),
  (2, 'Guru menguasai materi yang diajarkan.'),
  (3, 'Metode mengajar guru membuat saya aktif belajar.'),
  (4, 'Media dan latihan soal membantu saya memahami materi.'),
  (5, 'Suasana kelas nyaman untuk belajar.'),
  (6, 'Saya merasa nyaman bertanya dan menyampaikan pendapat di kelas.'),
  (7, 'Cara guru menilai tugas dan tes jelas dan adil.'),
  (8, 'Soal tes sesuai dengan materi yang telah diajarkan.'),
  (9, 'Materi yang dipelajari berkaitan dengan kebutuhan dunia kerja.')
) as b(urut, soal)
order by s.kuesioner_id, b.urut;

commit;

-- Periksa: setiap kuesioner dan jumlah pertanyaannya
select k.kuesioner_id, k.judul, count(p.*) as jumlah_pertanyaan
from kuesioner k left join pertanyaan_kuesioner p on p.kuesioner_id = k.kuesioner_id
group by k.kuesioner_id, k.judul order by k.kuesioner_id;
