/* assist.js — citizen AI reading helper (multi-tenant). Floating widget:
   "อธิบายง่ายๆ" (plain-language rewrite) + "แปลภาษา" (on-demand translate) of the
   page's main content. Calls the public /api/assist/* endpoints, which are
   rate-limited and degrade gracefully (503 → friendly notice). */
(function () {
  "use strict";
  if (window.__webxAssist) return; window.__webxAssist = true;
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var EN = (document.documentElement.lang || "th").indexOf("en") === 0;
  var L = EN
    ? { t: "AI reading helper", simplify: "Explain simply", translate: "Translate", th: "ไทย", close: "Close", loading: "Working…", off: "AI assistant isn't available right now.", err: "Something went wrong — please try again." }
    : { t: "ผู้ช่วยอ่าน AI", simplify: "อธิบายง่ายๆ", translate: "แปลเป็นอังกฤษ", th: "ไทย", close: "ปิด", loading: "กำลังประมวลผล…", off: "ผู้ช่วย AI ยังไม่พร้อมใช้งานขณะนี้", err: "เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง" };
  var FL = EN
    ? { ph: "e.g. renew my driver's license", btn: "Find", asking: "Finding…", title: "Find a service" }
    : { ph: "เช่น อยากต่อใบขับขี่", btn: "ค้นหา", asking: "กำลังค้นหา…", title: "ถามหาบริการ (AI)" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var css = ""
    + ".wx-as-btn{position:fixed;right:16px;bottom:92px;z-index:9997;height:44px;padding:0 16px;border:none;border-radius:22px;background:var(--c-primary,#EE5020);color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);font:600 14px/1 inherit;display:flex;align-items:center;gap:8px}"
    + ".wx-as-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}"
    + ".wx-as-panel{position:fixed;right:16px;bottom:146px;z-index:9999;width:min(380px,92vw);max-height:60vh;background:#fff;color:#111;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden}"
    + ".wx-as-panel.open{display:flex}"
    + ".wx-as-h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #eee;font-weight:700}"
    + ".wx-as-h button{margin-left:auto;border:none;background:none;font-size:18px;cursor:pointer;color:#888}"
    + ".wx-as-act{display:flex;gap:8px;padding:10px 14px}"
    + ".wx-as-act button{flex:1;padding:9px;border:1px solid #e3e3e8;border-radius:9px;background:#fafafb;cursor:pointer;font:600 13px/1.2 inherit;color:#111}"
    + ".wx-as-act button:hover{background:#f0f0f3}"
    + ".wx-as-body{padding:4px 14px 14px;overflow:auto;font-size:14px;line-height:1.6;white-space:pre-wrap}"
    + ".wx-as-body .muted{color:#888}"
    + ".wx-as-find{display:flex;gap:6px;padding:0 14px 6px}"
    + ".wx-as-find input{flex:1;padding:9px 10px;border:1px solid #e3e3e8;border-radius:9px;font:14px/1.2 inherit}"
    + ".wx-as-find button{padding:9px 14px;border:none;border-radius:9px;background:var(--c-primary,#EE5020);color:#fff;cursor:pointer;font:600 13px/1.2 inherit}"
    + ".wx-as-chip{display:inline-block;padding:4px 10px;margin:2px 4px 0 0;border:1px solid var(--c-primary,#EE5020);border-radius:14px;font-size:12px;color:var(--c-primary,#EE5020);text-decoration:none}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement("button");
  btn.className = "wx-as-btn"; btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = "&#10024; " + L.t;
  var panel = document.createElement("div");
  panel.className = "wx-as-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", L.t);
  panel.innerHTML = '<div class="wx-as-h">&#10024; ' + L.t + '<button aria-label="' + L.close + '">&times;</button></div>'
    + '<div class="wx-as-act"><button data-x="simplify">' + L.simplify + '</button><button data-x="translate">' + L.translate + '</button></div>'
    + '<div class="wx-as-find"><input type="text" aria-label="' + FL.title + '" placeholder="' + FL.ph + '"><button data-x="find">' + FL.btn + "</button></div>"
    + '<div class="wx-as-body"><span class="muted">' + (EN ? "Pick an action or ask for a service." : "เลือกการทำงาน หรือพิมพ์ถามหาบริการ") + "</span></div>";
  document.body.appendChild(btn); document.body.appendChild(panel);
  var body = panel.querySelector(".wx-as-body");

  function open(o) { panel.classList.toggle("open", o); btn.setAttribute("aria-expanded", o ? "true" : "false"); }
  btn.addEventListener("click", function () { open(!panel.classList.contains("open")); });
  panel.querySelector(".wx-as-h button").addEventListener("click", function () { open(false); });

  function content() {
    var m = document.querySelector("main") || document.querySelector("article") || document.body;
    return (m.innerText || "").replace(/\s+/g, " ").trim().slice(0, 4000);
  }
  async function call(path, payload) {
    body.textContent = L.loading;
    try {
      var r = await fetch(STRAPI + "/api/assist/" + path + (window.DGA_TENANT ? "?tenant=" + encodeURIComponent(window.DGA_TENANT) : ""), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (r.status === 503) { body.innerHTML = '<span class="muted">' + L.off + "</span>"; return; }
      if (!r.ok) { body.innerHTML = '<span class="muted">' + L.err + "</span>"; return; }
      var j = await r.json();
      body.textContent = j.text || j.answer || "";
    } catch (e) { body.innerHTML = '<span class="muted">' + L.err + "</span>"; }
  }

  panel.querySelector(".wx-as-act").addEventListener("click", function (e) {
    var b = e.target.closest("[data-x]"); if (!b) return;
    var txt = content(); if (!txt) { body.textContent = "—"; return; }
    if (b.getAttribute("data-x") === "simplify") call("simplify", { text: txt });
    else call("translate", { text: txt, target: "English" });
  });

  // service finder (AEO) — grounded answer + service links from the tenant's content
  var fInput = panel.querySelector(".wx-as-find input");
  async function find() {
    var q = (fInput.value || "").trim(); if (!q) return;
    body.textContent = FL.asking;
    try {
      var r = await fetch(STRAPI + "/api/assist/find" + (window.DGA_TENANT ? "?tenant=" + encodeURIComponent(window.DGA_TENANT) : ""), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: q }) });
      if (r.status === 503) { body.innerHTML = '<span class="muted">' + L.off + "</span>"; return; }
      if (!r.ok) { body.innerHTML = '<span class="muted">' + L.err + "</span>"; return; }
      var j = await r.json();
      var html = esc(j.answer || "");
      if (j.services && j.services.length) html += '<div style="margin-top:8px">' + j.services.map(function (s) { return '<a class="wx-as-chip" href="/services/' + encodeURIComponent(s.slug || "") + '">' + esc(s.title) + "</a>"; }).join("") + "</div>";
      body.innerHTML = html || '<span class="muted">—</span>';
    } catch (e) { body.innerHTML = '<span class="muted">' + L.err + "</span>"; }
  }
  panel.querySelector('[data-x=find]').addEventListener("click", find);
  fInput.addEventListener("keydown", function (e) { if (e.key === "Enter") find(); });

  setTimeout(function () {
    var f = window.DGA_TENANT_CFG && window.DGA_TENANT_CFG.features;
    if (f && f.assist === false) { btn.remove(); panel.remove(); }
  }, 1500);
})();
