/* ============================================================================
   livechat.js — เชื่อม "แชตสด" กับช่องทางโซเชียลของ tenant (LINE/Messenger/FB/โทร)
   แทรกแถบช่องทางติดต่อเจ้าหน้าที่ลงในวิดเจ็ต DGA Guide (ที่สร้างโดย home.js)
   ตั้งค่าได้ต่อ tenant ผ่าน Tenant.liveChat.channels
   ============================================================================ */
(function () {
  "use strict";
  if (window.__dgaLiveChatInit) return;
  window.__dgaLiveChatInit = true;

  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var TQS = window.DGA_TENANT ? "&tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var LANG = document.documentElement.lang === "en" ? "en" : "th";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var colorOf = function (t) { return ({ line: "#06C755", messenger: "#0084FF", facebook: "#1877F2", phone: "var(--c-primary,#1a4fa0)" })[t] || "var(--c-primary,#1a4fa0)"; };

  var css = ".dga-channels{display:flex;flex-wrap:wrap;gap:6px;padding:10px 0 4px;border-top:1px solid var(--c-border,#eee);margin-top:4px}" +
    ".dga-channels b{flex-basis:100%;font-size:11.5px;color:var(--c-text-muted,#777);margin-bottom:3px;font-weight:600}" +
    ".dga-channels a{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;text-decoration:none;color:#fff;padding:6px 12px;border-radius:999px;line-height:1}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function waitPanel(cb, tries) {
    tries = tries || 0;
    var p = document.getElementById("dgaPanel");
    if (p) return cb(p);
    if (tries > 50) return;
    setTimeout(function () { waitPanel(cb, tries + 1); }, 150);
  }

  waitPanel(function (panel) {
    fetch(STRAPI + "/api/tenants/resolve?_=1" + TQS, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var lc = j && j.data && j.data.liveChat;
        var ch = lc && lc.channels;
        if (!ch || !ch.length) return;
        var foot = panel.querySelector(".dga-foot");
        var quick = panel.querySelector("#dgaQuick");
        if (!foot) return;
        var bar = document.createElement("div");
        bar.className = "dga-channels";
        bar.innerHTML = "<b>" + (LANG === "en" ? "Live chat with our team via:" : "แชตสดกับเจ้าหน้าที่ผ่าน:") + "</b>" +
          ch.map(function (c) { return '<a href="' + esc(c.url) + '" target="_blank" rel="noopener" style="background:' + colorOf(c.type) + '">' + esc(c.label) + "</a>"; }).join("");
        foot.insertBefore(bar, quick || foot.firstChild);
      }).catch(function () {});
  });
})();
