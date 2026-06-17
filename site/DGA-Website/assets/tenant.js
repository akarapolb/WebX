/* ============================================================================
   tenant.js — Navigation/Global ต่อ tenant: ดึงตั้งค่าแบรนด์/footer ของ tenant
   ปัจจุบัน (เซิร์ฟเวอร์ resolve จาก custom domain) แล้วอัปเดต footer ทุกหน้า
   dev: ตั้ง window.DGA_TENANT='pea' เพื่อจำลอง tenant อื่นได้
   ============================================================================ */
(function () {
  "use strict";
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var LANG = document.documentElement.lang === "en" ? "en" : "th";
  var T = window.DGA_TENANT ? "&tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var tv = function (o) { return o && typeof o === "object" ? (o[LANG] || o.th || "") : (o || ""); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  function setTextKeepIcon(el, text) {
    if (!el) return;
    // เก็บลูกแรก (svg ไอคอน) ไว้ แล้วแทนข้อความที่เหลือ
    while (el.childNodes.length > 1) el.removeChild(el.lastChild);
    el.appendChild(document.createTextNode(text));
  }

  function apply(t) {
    // ชื่อหน่วยงานใน footer
    if (t.brand && t.brand.orgName) {
      var org = document.querySelector(".footer-org");
      if (org) org.textContent = tv(t.brand.orgName);
    }
    // ที่อยู่ + เบอร์โทร
    if (t.contact) {
      var lines = document.querySelectorAll(".footer-addr .footer-addr__line");
      if (lines[0] && t.contact.address) setTextKeepIcon(lines[0], tv(t.contact.address));
      var tel = document.querySelector('.footer-addr a[href^="tel:"]');
      if (tel && t.contact.phone) {
        setTextKeepIcon(tel, (LANG === "en" ? "Tel " : "โทร ") + t.contact.phone);
        tel.setAttribute("href", "tel:" + String(t.contact.phone).replace(/[^0-9+]/g, ""));
      }
    }
    // คอลัมน์ลิงก์ใน footer (เว้น .footer-brand)
    if (Array.isArray(t.footerColumns)) {
      var cols = document.querySelectorAll(".site-footer > .wrap > div:not(.footer-brand)");
      t.footerColumns.forEach(function (col, i) {
        var el = cols[i];
        if (!el) return;
        el.innerHTML = "<h3>" + esc(tv(col.heading)) + "</h3><ul>" +
          (col.links || []).map(function (l) { return '<li><a href="' + esc(l.url || "#") + '">' + esc(tv(l.label)) + "</a></li>"; }).join("") +
          "</ul>";
      });
    }
    // ลิขสิทธิ์ท้ายเว็บ
    var copy = document.querySelector(".footer-bottom .wrap span");
    if (copy) copy.textContent = "© " + (LANG === "en" ? "2026 " : "2569 ") + t.name;

    document.documentElement.setAttribute("data-tenant", t.key || "");
  }

  function run() {
    fetch(STRAPI + "/api/tenants/resolve?_=1" + T, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.data) apply(j.data); })
      .catch(function () {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
