// lib/auth.js — hashing password & token sesi login (JWT, stateless).
// Dipakai BERSAMA oleh mode lokal (server.js/Express) dan mode produksi
// (netlify/functions/*.js) — alasan dipilih JWT (bukan token in-memory)
// adalah supaya sesi login tetap valid lintas-instance pada serverless,
// yang bisa menjalankan permintaan di proses berbeda-beda.
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "evalsmk-dev-secret-ganti-di-produksi";
const EXPIRES_IN = "8h";

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}
function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function issueToken(user) {
  return jwt.sign(
    { users_id: user.users_id, role: user.role, nama: user.nama, kelas_id: user.kelas_id },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

function getUserByToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, SECRET);
    return { users_id: payload.users_id, role: payload.role, nama: payload.nama, kelas_id: payload.kelas_id };
  } catch {
    return null;
  }
}

// Stateless: tidak ada daftar token aktif untuk dicoret. Logout cukup
// dengan membuang token di sisi klien (lihat public/app.js: logout()).
function revokeToken() {}

function extractToken(headerValue) {
  const header = headerValue || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// ---- Dipakai oleh mode lokal (Express) ----
function requireAuth(req, res, next) {
  const user = getUserByToken(extractToken(req.headers.authorization));
  if (!user) return res.status(401).json({ error: "Belum login atau sesi berakhir." });
  req.user = user;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: "Tidak punya akses untuk peran ini." });
      }
      next();
    });
  };
}

// ---- Dipakai oleh mode produksi (Netlify Functions) ----
// Mengembalikan { user } jika valid, atau { errorResponse } siap dikembalikan langsung.
function checkAuth(event, ...roles) {
  const user = getUserByToken(extractToken(event.headers.authorization || event.headers.Authorization));
  if (!user) {
    return { user: null, errorResponse: { statusCode: 401, headers: cors(), body: JSON.stringify({ error: "Belum login atau sesi berakhir." }) } };
  }
  if (roles.length > 0 && !roles.includes(user.role)) {
    return { user: null, errorResponse: { statusCode: 403, headers: cors(), body: JSON.stringify({ error: "Tidak punya akses untuk peran ini." }) } };
  }
  return { user, errorResponse: null };
}
function cors() {
  return { "Content-Type": "application/json" };
}

module.exports = {
  hashPassword,
  verifyPassword,
  issueToken,
  getUserByToken,
  revokeToken,
  extractToken,
  requireAuth,
  requireRole,
  checkAuth,
};
