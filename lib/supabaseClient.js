// lib/supabaseClient.js — dipakai oleh netlify/functions/*.js.
// Memakai service_role key (bukan anon key) karena Functions berjalan di
// sisi server dan perlu melewati Row Level Security yang dikunci di
// data/schema.postgres.sql.
const { createClient } = require("@supabase/supabase-js");

let client = null;
function getClient() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diatur di environment variables.");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

module.exports = { getClient };
