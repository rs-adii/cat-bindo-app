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
module.exports = { json, parseBody };
