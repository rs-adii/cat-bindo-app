-- Jalankan skrip ini satu kali di Supabase: Project > SQL Editor > New query
-- Tabel menyimpan sesi tes CAT dan hasil kuesioner feedback siswa.

create extension if not exists "pgcrypto";

create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null,
  kelas       text,
  theta       double precision not null default 0,
  se          double precision not null default 99,
  administered jsonb not null default '[]'::jsonb,
  status      text not null default 'ongoing',
  mulai       timestamptz not null default now(),
  selesai     timestamptz,
  skor        integer
);

create table if not exists feedbacks (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references sessions(id) on delete cascade,
  nama        text,
  kelas       text,
  jawaban     jsonb not null default '{}'::jsonb,
  komentar    text,
  waktu       timestamptz not null default now()
);

create index if not exists idx_sessions_status on sessions(status);
create index if not exists idx_feedbacks_session on feedbacks(session_id);

-- Row Level Security diaktifkan dan DITUTUP RAPAT untuk anon/public:
-- semua akses baca/tulis hanya boleh lewat Netlify Functions memakai
-- SUPABASE_SERVICE_ROLE_KEY (kunci rahasia di server), yang melewati RLS.
-- Frontend (public/) TIDAK PERNAH menghubungi Supabase secara langsung.
alter table sessions enable row level security;
alter table feedbacks enable row level security;
