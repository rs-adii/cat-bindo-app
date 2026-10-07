// lib/db.js — koneksi SQLite untuk mode lokal (server.js)
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "data", "siep.db");
const SCHEMA_PATH = path.join(__dirname, "..", "data", "schema.sqlite.sql");

const isNew = !fs.existsSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

// Terapkan skema setiap start (semua statement pakai IF NOT EXISTS, aman diulang)
const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
db.exec(schema);

module.exports = { db, isNew };
