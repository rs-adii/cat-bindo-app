-- Skema Postgres (Supabase) -- setara persis dengan data/schema.sqlite.sql
-- yang dipakai mode lokal. Jalankan ini di SQL Editor proyek Supabase Anda.

create table if not exists mapel (
  mapel_id    bigint generated always as identity primary key,
  nama_mapel  text not null unique
);

create table if not exists kelas (
  kelas_id    bigint generated always as identity primary key,
  nama_kelas  text not null,
  jurusan     text
);

create table if not exists users (
  users_id      bigint generated always as identity primary key,
  nama          text not null,
  username      text not null unique,
  password_hash text not null,
  role          text not null check (role in ('admin','guru','siswa')),
  kelas_id      bigint references kelas(kelas_id),
  aktif         int not null default 1 check (aktif in (0,1))   -- 0 = dinonaktifkan admin (tidak bisa login)
);

create table if not exists soal (
  soal_id            bigint generated always as identity primary key,
  mapel_id           bigint not null references mapel(mapel_id),
  guru_id            bigint not null references users(users_id),
  pertanyaan         text not null,
  opsi_a             text not null,
  opsi_b             text not null,
  opsi_c             text not null,
  opsi_d             text not null,
  kunci              text not null check (kunci in ('A','B','C','D')),
  tingkat_kesulitan  int not null check (tingkat_kesulitan between 1 and 3), -- 1 mudah, 2 sedang, 3 sulit
  materi             text                                                   -- topik/pokok bahasan (opsional)
);

create table if not exists tes (
  tes_id         bigint generated always as identity primary key,
  mapel_id       bigint not null references mapel(mapel_id),
  kelas_id       bigint references kelas(kelas_id),
  judul          text not null,
  jumlah_soal    int not null,
  durasi_menit   int not null,
  tanggal        date not null
);

create table if not exists kuesioner (
  kuesioner_id  bigint generated always as identity primary key,
  tes_id        bigint not null references tes(tes_id),
  judul         text not null
);

create table if not exists pertanyaan_kuesioner (
  pertanyaan_kuesioner_id  bigint generated always as identity primary key,
  kuesioner_id             bigint not null references kuesioner(kuesioner_id),
  soal                     text not null
);

create table if not exists sesi_tes (
  sesites_id    bigint generated always as identity primary key,
  tes_id        bigint not null references tes(tes_id),
  siswa_id      bigint not null references users(users_id),
  level_akhir   int,
  nilai         real,
  status        text not null default 'ongoing' check (status in ('ongoing','selesai')),
  mulai         timestamptz not null default now(),
  selesai       timestamptz
);

create table if not exists jawaban (
  jawaban_id      bigint generated always as identity primary key,
  sesi_id         bigint not null references sesi_tes(sesites_id) on delete cascade,
  soal_id         bigint not null references soal(soal_id),
  jawaban         text,
  benar           int not null check (benar in (0,1)),
  level_saat_itu  int not null,
  urutan          int not null
);

create table if not exists respon_kuesioner (
  respon_kuesioner_id  bigint generated always as identity primary key,
  pertanyaan_id        bigint not null references pertanyaan_kuesioner(pertanyaan_kuesioner_id),
  siswa_id             bigint not null references users(users_id),
  sesi_id              bigint references sesi_tes(sesites_id) on delete set null,
  skor                 int,
  komentar             text
);

create index if not exists idx_soal_mapel_level on soal(mapel_id, tingkat_kesulitan);
create index if not exists idx_jawaban_sesi on jawaban(sesi_id);
create index if not exists idx_sesi_tes_siswa on sesi_tes(siswa_id);
create index if not exists idx_respon_pertanyaan on respon_kuesioner(pertanyaan_id);

-- Kunci akses publik langsung (hanya lewat Netlify Functions dengan service_role key)
alter table mapel enable row level security;
alter table kelas enable row level security;
alter table users enable row level security;
alter table soal enable row level security;
alter table tes enable row level security;
alter table kuesioner enable row level security;
alter table pertanyaan_kuesioner enable row level security;
alter table sesi_tes enable row level security;
alter table jawaban enable row level security;
alter table respon_kuesioner enable row level security;

-- Penanda versi skema. Pemasangan baru langsung memakai 3 level + kolom materi,
-- jadi migrasi data/migrasi-tiga-level.postgres.sql tidak perlu dijalankan.
create table if not exists skema_versi (
  nama        text primary key,
  diterapkan  timestamptz not null default now()
);
alter table skema_versi enable row level security;
insert into skema_versi (nama) values ('tiga-level') on conflict do nothing;

-- Pengaturan sekolah & aturan evaluasi (halaman Pengaturan admin).
-- nilai disimpan sebagai JSON teks; kunci yang belum ada memakai nilai bawaan (lib/pengaturan.js).
create table if not exists pengaturan (
  kunci  text primary key,
  nilai  text not null
);
alter table pengaturan enable row level security;
insert into skema_versi (nama) values ('tampilan-baru') on conflict do nothing;

