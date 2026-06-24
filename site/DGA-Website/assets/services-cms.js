/* services-cms.js — ดึง "บริการดิจิทัลหลัก" จาก Strapi มาแสดงบนหน้าบริการ
   จัดการได้จากหลังบ้าน WebX Studio (/api/services) · มี fallback ถ้าโหลดไม่ได้ */
(function () {
  "use strict";
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var grid = document.getElementById("svcCmsGrid");
  if (!grid) return;
  var sec = grid.closest("section");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  fetch(STRAPI + "/api/services?sort=order:asc&pagination[pageSize]=50", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var items = (j && j.data) || [];
      if (!items.length) { if (sec) sec.style.display = "none"; return; }   // ไม่มีข้อมูล → ซ่อน section
      grid.innerHTML = items.map(function (s) {
        return '<li><a class="svc t-' + esc(s.colorTheme || "blue") + '" href="' + esc(s.url || "#") + '">' +
          '<span class="ic" aria-hidden="true"><svg class="icon icon--lg"><use href="#' + esc(s.icon || "i-grid") + '"/></svg></span>' +
          "<span><b>" + esc(s.title) + "</b><span>" + esc(s.description || "") + "</span></span>" +
          '<span class="go" aria-hidden="true"><svg class="icon"><use href="#i-arrow"/></svg></span></a></li>';
      }).join("");
    })
    .catch(function () { if (sec) sec.style.display = "none"; });            // โหลดไม่ได้ → ซ่อน (คงเนื้อหา static ด้านล่าง)
})();
