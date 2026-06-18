/* ============================================================
   menu.js — สร้างเมนูหลัก (mega-menu) จาก CMS (TOR ภาคผนวก ก ข้อ 4.1)
   ดึง /api/menu-items (ต่อ tenant) → แทนคอลัมน์ใน mega panel ตาม menu+column+order
   ถ้าไม่มีข้อมูล CMS → คงเมนู static เดิมไว้ (graceful)
   ============================================================ */
(function () {
  "use strict";
  try {
    var qp = new URLSearchParams(location.search).get("tenant");
    var host = location.hostname, sub = host.split(".")[0];
    if (qp) window.DGA_TENANT = qp;
    else if (host.indexOf(".localhost") > 0 && sub && sub !== "www") window.DGA_TENANT = sub;
    else { var ss = sessionStorage.getItem("dga-tenant"); if (ss) window.DGA_TENANT = ss; }
  } catch (e) {}
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var TQS = window.DGA_TENANT ? "&tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  fetch(STRAPI + "/api/menu-items?pagination[pageSize]=200" + TQS, { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var items = (j && j.data) || [];
      if (!items.length) return; // ไม่มีข้อมูล CMS → คงเมนู static
      items.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var byMenu = {};
      items.forEach(function (it) {
        var col = it.column || "อื่น ๆ";
        (byMenu[it.menu] = byMenu[it.menu] || {});
        (byMenu[it.menu][col] = byMenu[it.menu][col] || []).push(it);
      });
      Object.keys(byMenu).forEach(function (menu) {
        var panel = document.getElementById("mega-" + menu);
        if (!panel) return;
        var cols = panel.querySelector(".mega-cols");
        if (!cols) return;
        cols.innerHTML = Object.keys(byMenu[menu]).map(function (col) {
          return '<div class="mega-col"><h3>' + esc(col) + "</h3>" +
            byMenu[menu][col].map(function (it) {
              return '<a href="' + esc(it.url || "#") + '"' + (it.openNewTab ? ' target="_blank" rel="noopener"' : "") +
                '><span class="dot"></span>' + esc(it.label) + "</a>";
            }).join("") + "</div>";
        }).join("");
      });
      document.documentElement.setAttribute("data-menu-cms", "1");
    })
    .catch(function () {});
})();
