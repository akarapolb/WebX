/* theme-cms.js — ทาสีธีมทั้งเว็บตาม "แบรนด์" ที่ตั้งใน CMS (เมนู "แบรนด์" → tenant.brand)
   ดึง /api/tenants/resolve → brand.primaryColor → override CSS variables (--c-primary ฯลฯ)
   รองรับ light + dark (dark ทำสีอ่อนลงอัตโนมัติเพื่อคอนทราสต์) · เฉพาะสี (ไม่แตะโลโก้/ฟุตเตอร์)
   cache ใน localStorage กัน FOUC — โหลดครั้งถัดไปสีขึ้นทันที
   หมายเหตุ: แหล่งสีเดียว = เมนู "แบรนด์" ของ studio (ไม่มี content-type แยกซ้ำ) */
(function () {
  "use strict";
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var KEY = "dga_theme_v1";

  function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }
  function parse(hex) {
    if (!hex) return null;
    var c = ("" + hex).trim().replace("#", "");
    if (c.length === 3) c = c.split("").map(function (x) { return x + x; }).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(c)) return null;
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }
  function toHex(rgb) { return "#" + rgb.map(function (x) { return clamp(x).toString(16).padStart(2, "0"); }).join(""); }
  function mix(hex, target, amt) { var a = parse(hex); if (!a) return hex; return toHex([a[0] + (target - a[0]) * amt, a[1] + (target - a[1]) * amt, a[2] + (target - a[2]) * amt]); }
  function lighten(h, a) { return mix(h, 255, a); }
  function darken(h, a) { return mix(h, 0, a); }

  function apply(brand) {
    if (!brand) return;
    var P = brand.primaryColor, S = brand.secondaryColor;
    if (!parse(P)) return;
    var PD = parse(brand.primaryDark) ? brand.primaryDark : darken(P, 0.18);

    // light mode
    var css = ":root{"
      + "--c-primary:" + P + ";--c-action:" + P + ";--c-brand:" + P + ";"
      + "--c-primary-700:" + PD + ";--c-action-700:" + PD + ";--c-brand-2:" + PD + ";"
      + "--c-primary-50:" + lighten(P, 0.9) + ";"
      + (parse(S) ? "--c-secondary:" + S + ";--c-focus:" + S + ";" : "")
      + "}";
    // dark mode — สีอ่อนลงเพื่อคอนทราสต์บนพื้นมืด
    var Pl = lighten(P, 0.35);
    css += "[data-theme=\"dark\"]{"
      + "--c-primary:" + Pl + ";--c-action:" + Pl + ";--c-brand:" + Pl + ";"
      + "--c-primary-700:" + P + ";--c-action-700:" + P + ";--c-brand-2:" + P + ";"
      + (parse(S) ? "--c-secondary:" + lighten(S, 0.4) + ";--c-focus:" + lighten(S, 0.4) + ";" : "")
      + "}";

    var el = document.getElementById("theme-cms-css");
    if (!el) { el = document.createElement("style"); el.id = "theme-cms-css"; (document.head || document.documentElement).appendChild(el); }
    el.textContent = css;
  }

  // 1) ใช้สีที่ cache ไว้ทันที (กัน FOUC)
  try { var c = localStorage.getItem(KEY); if (c) apply(JSON.parse(c)); } catch (e) {}

  // 2) ดึงแบรนด์ล่าสุดจาก CMS (tenant.brand) แล้วอัปเดต + cache
  fetch(STRAPI + "/api/tenants/resolve", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j) return;
      var t = j.data || j;
      var brand = t.brand || (t.attributes && t.attributes.brand);
      if (!brand || !brand.primaryColor) return;
      apply(brand);
      try { localStorage.setItem(KEY, JSON.stringify({ primaryColor: brand.primaryColor, secondaryColor: brand.secondaryColor })); } catch (e) {}
    })
    .catch(function () {});
})();
