// lib/httpHelpers.js — dipakai oleh netlify/functions/*.js
function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

// Ambil parameter rute (mis. ID dari /api/guru/soal/12).
// Urutan sumber, dari yang paling bisa diandalkan:
//   1. regex pada event.path / event.rawUrl (path permintaan asli dari klien —
//      tidak bergantung pada redirect Netlify mengisi placeholder ke query string)
//   2. query string (?id=12), dipakai kalau rute dipanggil langsung
function getParam(event, name, regex) {
  for (const src of [event.path, event.rawUrl]) {
    if (!src) continue;
    const m = String(src).match(regex);
    if (m && m[1]) return decodeURIComponent(m[1]);
  }
  const q = event.queryStringParameters && event.queryStringParameters[name];
  if (q && !String(q).startsWith(":")) return q;
  return null;
}

module.exports = { json, parseBody, getParam };
