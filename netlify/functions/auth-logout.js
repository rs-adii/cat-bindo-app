const { json } = require("../../lib/httpHelpers");

// Token JWT bersifat stateless: logout cukup dengan membuang token di peramban.
// Rute ini ada supaya permintaan logout dari aplikasi tidak berakhir 404.
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method tidak diizinkan." });
  return json(200, { ok: true });
};
