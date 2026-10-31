// tests/mockSupabase.js — tiruan klien Supabase di memori untuk menguji
// netlify/functions tanpa koneksi ke supabase.co. Meniru bagian yang dipakai
// aplikasi: select/insert/update/delete/upsert, filter eq/in, order,
// single/maybeSingle, kolom identity, kunci unik (23505) dan foreign key (23503).

const ID = {
  mapel: "mapel_id", kelas: "kelas_id", users: "users_id", soal: "soal_id", tes: "tes_id",
  kuesioner: "kuesioner_id", pertanyaan_kuesioner: "pertanyaan_kuesioner_id", sesi_tes: "sesites_id",
  jawaban: "jawaban_id", respon_kuesioner: "respon_kuesioner_id", pengaturan: null,
};
const UNIK = { users: ["username"], mapel: ["nama_mapel"], pengaturan: ["kunci"] };
// induk -> [anak, kolom]
const FK = {
  mapel: [["soal", "mapel_id"], ["tes", "mapel_id"]],
  kelas: [["users", "kelas_id"], ["tes", "kelas_id"]],
  users: [["soal", "guru_id"], ["sesi_tes", "siswa_id"], ["respon_kuesioner", "siswa_id"]],
  soal: [["jawaban", "soal_id"]],
  tes: [["kuesioner", "tes_id"], ["sesi_tes", "tes_id"]],
  kuesioner: [["pertanyaan_kuesioner", "kuesioner_id"]],
  pertanyaan_kuesioner: [["respon_kuesioner", "pertanyaan_id"]],
  sesi_tes: [["jawaban", "sesi_id"], ["respon_kuesioner", "sesi_id"]],
};
const BAWAAN = {
  users: () => ({ kelas_id: null, aktif: 1 }),
  kelas: () => ({ jurusan: null }),
  soal: () => ({ materi: null }),
  tes: () => ({ kelas_id: null }),
  sesi_tes: () => ({ status: "ongoing", mulai: new Date().toISOString(), selesai: null, nilai: null, level_akhir: null }),
  jawaban: () => ({ jawaban: null }),
  respon_kuesioner: () => ({ komentar: null, sesi_id: null, skor: null }),
};

const salin = (x) => JSON.parse(JSON.stringify(x));
const samaNilai = (a, b) => a !== null && a !== undefined && String(a) === String(b);
const galat = (message, code) => ({ data: null, error: { message, code } });

function buatMock({ tanpaTabel = [], tanpaKolomAktif = false } = {}) {
  const db = Object.fromEntries(Object.keys(ID).map((t) => [t, []]));
  const urut = {};
  const tabel = (t) => db[t];

  function cekUnik(t, baris, kecuali) {
    for (const kol of UNIK[t] || []) {
      if (db[t].some((r) => r !== kecuali && samaNilai(r[kol], baris[kol]))) {
        return `duplicate key value violates unique constraint "${t}_${kol}_key"`;
      }
    }
    return null;
  }
  function cekIndukAda(t, baris) {
    for (const [induk, anakList] of Object.entries(FK)) {
      for (const [anak, kol] of anakList) {
        if (anak !== t || baris[kol] === null || baris[kol] === undefined) continue;
        if (!db[induk].some((r) => samaNilai(r[ID[induk]], baris[kol]))) {
          return `insert or update on table "${t}" violates foreign key constraint "${t}_${kol}_fkey"`;
        }
      }
    }
    return null;
  }

  class Kueri {
    constructor(t) { this.t = t; this.op = "select"; this.filter = []; this.urutan = []; this.mode = null; this.balikkan = false; }
    select() { if (this.op !== "select") this.balikkan = true; return this; }
    insert(p) { this.op = "insert"; this.muatan = p; return this; }
    upsert(p, opsi = {}) { this.op = "upsert"; this.muatan = p; this.konflik = opsi.onConflict; return this; }
    update(p) { this.op = "update"; this.muatan = p; return this; }
    delete() { this.op = "delete"; return this; }
    eq(k, v) { this.filter.push((r) => samaNilai(r[k], v)); return this; }
    in(k, vs) { this.filter.push((r) => (vs || []).some((v) => samaNilai(r[k], v))); return this; }
    order(k, { ascending = true } = {}) { this.urutan.push([k, ascending]); return this; }
    single() { this.mode = "single"; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }
    then(ok, gagal) { return Promise.resolve().then(() => this.jalankan()).then(ok, gagal); }

    cocok() { return db[this.t].filter((r) => this.filter.every((f) => f(r))); }
    akhiri(rows) {
      rows = salin(rows);
      if (this.mode === "single") {
        return rows.length === 1 ? { data: rows[0], error: null } : galat("JSON object requested, multiple (or no) rows returned", "PGRST116");
      }
      if (this.mode === "maybe") {
        return rows.length <= 1 ? { data: rows[0] || null, error: null } : galat("JSON object requested, multiple rows returned", "PGRST116");
      }
      return { data: rows, error: null };
    }
    jalankan() {
      const t = this.t;
      if (!(t in db) || tanpaTabel.includes(t)) return galat(`relation "public.${t}" does not exist`, "42P01");
      if (this.op === "select") {
        let rows = this.cocok();
        for (const [k, asc] of [...this.urutan].reverse()) {
          rows = [...rows].sort((a, b) => {
            const x = a[k]; const y = b[k];
            const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
            return asc ? c : -c;
          });
        }
        return this.akhiri(rows);
      }
      if (this.op === "insert" || this.op === "upsert") {
        const daftar = Array.isArray(this.muatan) ? this.muatan : [this.muatan];
        const hasil = [];
        for (const m of daftar) {
          if (this.op === "upsert") {
            const ada = db[t].find((r) => samaNilai(r[this.konflik], m[this.konflik]));
            if (ada) { Object.assign(ada, salin(m)); hasil.push(ada); continue; }
          }
          const baris = { ...(BAWAAN[t] ? BAWAAN[t]() : {}), ...salin(m) };
          if (tanpaKolomAktif && t === "users") delete baris.aktif;
          if (ID[t]) { urut[t] = (urut[t] || 0) + 1; baris[ID[t]] = urut[t]; }
          const e = cekUnik(t, baris) || cekIndukAda(t, baris);
          if (e) return galat(e, e.includes("unique") ? "23505" : "23503");
          db[t].push(baris);
          hasil.push(baris);
        }
        return this.balikkan ? this.akhiri(hasil) : { data: null, error: null };
      }
      if (this.op === "update") {
        if (tanpaKolomAktif && t === "users" && "aktif" in this.muatan) return galat('column "aktif" of relation "users" does not exist', "42703");
        const rows = this.cocok();
        for (const r of rows) {
          const calon = { ...r, ...salin(this.muatan) };
          const e = cekUnik(t, calon, r) || cekIndukAda(t, calon);
          if (e) return galat(e, e.includes("unique") ? "23505" : "23503");
        }
        rows.forEach((r) => Object.assign(r, salin(this.muatan)));
        return this.balikkan ? this.akhiri(rows) : { data: null, error: null };
      }
      if (this.op === "delete") {
        const rows = this.cocok();
        for (const r of rows) {
          for (const [anak, kol] of FK[t] || []) {
            if (db[anak].some((c) => samaNilai(c[kol], r[ID[t]]))) {
              return galat(`update or delete on table "${t}" violates foreign key constraint "${anak}_${kol}_fkey" on table "${anak}"`, "23503");
            }
          }
        }
        db[t] = db[t].filter((r) => !rows.includes(r));
        return this.balikkan ? this.akhiri(rows) : { data: null, error: null };
      }
      return galat("operasi tidak dikenal");
    }
  }

  return { from: (t) => new Kueri(t), _tabel: tabel };
}

module.exports = { buatMock };
