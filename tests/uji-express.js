// tests/uji-express.js — jalankan rangkaian uji API terhadap server lokal (Express + SQLite)
const fs = require("fs");
const os = require("os");
const path = require("path");

const DB = path.join(os.tmpdir(), `evalsmk-uji-${process.pid}.db`);
process.env.EVALSMK_DB = DB;
for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const lama = console.log;
console.log = () => {}; // sembunyikan log seed
const { app } = require("../server");
const { db } = require("../lib/db");
console.log = lama;
const { jalankan } = require("./api-suite");

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const adaptor = {
    async panggil(method, p, body, token) {
      const res = await fetch(base + p, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: body === null || body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    async mundurkanSesi(sesiId, detik) {
      db.prepare("UPDATE sesi_tes SET mulai = datetime(mulai, ?) WHERE sesites_id = ?").run(`-${detik} seconds`, sesiId);
    },
  };
  let ok = false;
  try { ok = await jalankan(adaptor, "Mode lokal (Express + SQLite)"); } catch (e) { console.error(e); }
  server.close();
  db.close();
  for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
  process.exit(ok ? 0 : 1);
});
