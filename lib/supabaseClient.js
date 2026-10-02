// lib/supabaseClient.js
// Klien Supabase sisi server, dipakai hanya di dalam Netlify Functions.
// SUPABASE_SERVICE_ROLE_KEY wajib diset sebagai Environment Variable di
// Netlify (Site settings > Environment variables), JANGAN pernah dipakai
// di kode frontend (public/) karena key ini bisa melewati Row Level Security.

const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset. " +
      "Tambahkan keduanya di Netlify > Site configuration > Environment variables."
  );
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

module.exports = supabase;
