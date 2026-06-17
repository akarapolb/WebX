/* ============================================================================
   livechat.js — ปุ่ม "แชตสด" ลอย เชื่อมช่องทางโซเชียลของ tenant (LINE/Messenger/FB/โทร)
   เป็นวิดเจ็ตอิสระ (มองเห็นชัด ไม่ต้องเปิดแชต AI ก่อน) ตั้งค่าได้ต่อ tenant
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

  var css =
    ".lc-fab{position:fixed;left:18px;bottom:18px;z-index:9000;display:inline-flex;align-items:center;gap:8px;background:var(--c-primary,#1a4fa0);color:#fff;border:0;border-radius:999px;padding:12px 18px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 10px 28px rgba(0,0,0,.28)}" +
    ".lc-fab svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2}" +
    ".lc-pop{position:fixed;left:18px;bottom:72px;z-index:9001;width:min(300px,86vw);background:var(--c-surface,#fff);color:var(--c-text,#1a1a1a);border:1px solid var(--c-border,#e5e5e5);border-radius:16px;box-shadow:0 18px 54px rgba(0,0,0,.3);padding:16px;display:none}" +
    ".lc-pop.open{display:block}" +
    ".lc-pop h4{margin:0 0 3px;font-size:15px}.lc-pop p{margin:0 0 12px;font-size:12.5px;color:var(--c-text-muted,#666)}" +
    ".lc-pop a{display:flex;align-items:center;gap:8px;text-decoration:none;color:#fff;font-weight:700;font-size:13px;padding:10px 13px;border-radius:10px;margin-bottom:7px}" +
    ".lc-pop a:last-child{margin-bottom:0}" +
    "@media(max-width:560px){.lc-fab span{display:none}.lc-fab{padding:13px}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var CHAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 1 1 18 0z"/><path d="M8 11h8M8 14h5"/></svg>';

  fetch(STRAPI + "/api/tenants/resolve?_=1" + TQS, { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var lc = j && j.data && j.data.liveChat;
      var ch = lc && lc.channels;
      if (!ch || !ch.length) return;

      var fab = document.createElement("button");
      fab.className = "lc-fab"; fab.type = "button";
      fab.setAttribute("aria-label", LANG === "en" ? "Live chat" : "แชตสด");
      fab.innerHTML = CHAT_ICON + "<span>" + (LANG === "en" ? "Live chat" : "แชตสด") + "</span>";

      var pop = document.createElement("div");
      pop.className = "lc-pop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", LANG === "en" ? "Live chat channels" : "ช่องทางแชตสด");
      pop.innerHTML = "<h4>" + (LANG === "en" ? "Chat with our team" : "แชตกับเจ้าหน้าที่") + "</h4>" +
        "<p>" + (LANG === "en" ? "Choose a channel:" : "เลือกช่องทางที่สะดวก") + "</p>" +
        ch.map(function (c) { return '<a href="' + esc(c.url) + '" target="_blank" rel="noopener" style="background:' + colorOf(c.type) + '">' + esc(c.label) + "</a>"; }).join("");

      document.body.appendChild(pop);
      document.body.appendChild(fab);
      fab.addEventListener("click", function (e) { e.stopPropagation(); pop.classList.toggle("open"); });
      document.addEventListener("click", function (e) { if (!pop.contains(e.target) && e.target !== fab) pop.classList.remove("open"); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") pop.classList.remove("open"); });
    }).catch(function () {});
})();
