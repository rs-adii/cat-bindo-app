-- =====================================================================
-- MIGRASI EvalSMK: status akun + tabel pengaturan
-- =====================================================================
-- Untuk database Supabase yang SUDAH dibuat sebelum pembaruan ini.
-- Pemasangan baru TIDAK perlu menjalankan ini: data/schema.postgres.sql sudah
-- memuat kolom users.aktif dan tabel pengaturan.
--
-- Jalankan migrasi-tiga-level.postgres.sql lebih dulu kalau database Anda masih
-- memakai 5 level.
--
-- Cara pakai: Supabase -> SQL Editor -> New query -> tempel seluruh isi berkas
-- ini -> Run. Aman dijalankan ulang (tidak ada yang berubah pada run kedua).
--
-- Yang dilakukan:
--   1. Menambah kolom users.aktif (1 = aktif, 0 = dinonaktifkan). Semua akun
--      yang sudah ada otomatis aktif.
--   2. Membuat tabel pengaturan (kunci, nilai) untuk halaman Pengaturan admin.
--      Selama tabel ini kosong, aplikasi memakai nilai bawaan.
-- =====================================================================

begin;

create table if not exists skema_versi (
  nama        text primary key,
  diterapkan  timestamptz not null default now()
);
alter table skema_versi enable row level security;

alter table users add column if not exists aktif int not null default 1;
do $cek$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_aktif_check') then
    alter table users add constraint users_aktif_check check (aktif in (0,1));
  end if;
end
$cek$;

create table if not exists pengaturan (
  kunci  text primary key,
  nilai  text not null
);
alter table pengaturan enable row level security;

insert into skema_versi (nama) values ('tampilan-baru') on conflict do nothing;

commit;
