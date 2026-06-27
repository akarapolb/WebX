/* ============================================================================
   livechat.js — ช่องทางติดต่อเจ้าหน้าที่ (LINE/Messenger/FB/โทร) ของ tenant
   v2: เลิกใช้ปุ่มลอย → เรนเดอร์เป็นคอลัมน์ "ช่องทางติดต่อ" ใน footer (โมเดิร์น)
   ลดความรกหน้าแรก + อยู่ในที่ที่ผู้ใช้คาดหวัง (footer) ครบทุกหน้า
   ============================================================================ */
(function () {
  "use strict";
  if (window.__dgaLiveChatInit) return;
  window.__dgaLiveChatInit = true;

  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var TQS = window.DGA_TENANT ? "&tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var LANG = document.documentElement.lang === "en" ? "en" : "th";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var BG = { line: "#06C755", messenger: "#0084FF", facebook: "#1877F2", phone: "var(--c-primary,#1a4fa0)" };
  var BUBBLE = '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 1 1 18 0z"/>';
  var ICON = {
    line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">' + BUBBLE + '</svg>',
    messenger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">' + BUBBLE + '<path d="M7.5 12.5l2.5 2 1.5-2 2.5 2 2.5-4"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8.5c0-.3.2-.5.5-.5H16V5h-2c-1.7 0-3 1.3-3 3v2H9v3h2v6h3v-6h2.2l.5-3H14V8.5z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 5c0 9 7 16 16 16l3-3-4-3-2 2c-3-1-6-4-7-7l2-2-3-4z"/></svg>',
  };

  if (!document.getElementById("dga-chans-css")) {
    var st = document.createElement("style"); st.id = "dga-chans-css";
    st.textContent = [
      ".footer-social{margin-top:20px}",
      ".footer-social__lbl{display:block;font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--c-text-muted,rgba(255,255,255,.7));margin-bottom:10px}",
      ".footer-social__row{display:flex;gap:10px;flex-wrap:wrap}",
      ".fsoc{width:42px;height:42px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;text-decoration:none;transition:transform .16s ease,box-shadow .16s ease,filter .16s ease}",
      ".fsoc:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 10px 22px -6px rgba(0,0,0,.5);filter:saturate(1.12)}",
      ".fsoc:focus-visible{outline:2px solid #fff;outline-offset:3px}",
      ".fsoc svg{width:21px;height:21px}",
      "@media(max-width:560px){.footer-social__row{gap:12px}.fsoc{width:46px;height:46px}}",
    ].join("");
    document.head.appendChild(st);
  }

  function inject(channels) {
    if (!channels || !channels.length) return;
    if (document.querySelector(".footer-social")) return;
    var brand = document.querySelector(".site-footer .footer-brand");
    if (!brand) return;
    var box = document.createElement("div");
    box.className = "footer-social";
    box.innerHTML = '<span class="footer-social__lbl">' + (LANG === "en" ? "Contact channels" : "ช่องทางติดต่อ") + "</span>" +
      '<div class="footer-social__row">' +
      channels.map(function (c) {
        var tel = String(c.url || "").indexOf("tel:") === 0;
        var ext = tel ? "" : ' target="_blank" rel="noopener"';
        return '<a class="fsoc" href="' + esc(c.url) + '"' + ext + ' title="' + esc(c.label) + '" aria-label="' + esc(c.label) + '" style="background:' + (BG[c.type] || BG.phone) + '">' +
          (ICON[c.type] || ICON.phone) + "</a>";
      }).join("") + "</div>";
    brand.appendChild(box);   // วางเป็นไอคอนเล็กในคอลัมน์แบรนด์ (ใต้ที่อยู่) — กระชับ ไม่ทำ footer ยาว
  }

  // ใช้ข้อมูล tenant ที่ resolve แล้ว (ถ้ามี) ไม่งั้น fetch
  var cfg = window.DGA_TENANT_CFG;
  if (cfg && cfg.liveChat && cfg.liveChat.channels) { inject(cfg.liveChat.channels); return; }
  fetch(STRAPI + "/api/tenants/resolve?_=1" + TQS, { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { inject(j && j.data && j.data.liveChat && j.data.liveChat.channels); })
    .catch(function () {});
})();
