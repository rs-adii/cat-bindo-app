// app.js — titik masuk EvalSMK: pulihkan sesi login lalu tampilkan halaman sesuai alamat (#/peran/halaman).
(function () {
  "use strict";
  Shell.pulihSesi();
  window.addEventListener("hashchange", Shell.tampilkan);
  Shell.tampilkan();
})();
