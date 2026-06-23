/* a11y.js — citizen accessibility toolbar (multi-tenant, no AI needed).
   Floating widget: font size, high-contrast, dark mode, reduce-motion, and
   read-aloud (browser TTS). Prefs persist in localStorage and apply on every
   page. Per-tenant: disabled if tenant.features.a11y === false. WCAG 2.2 AA. */
(function () {
  "use strict";
  if (window.__webxA11y) return; window.__webxA11y = true;
  var LS = "webx_a11y";
  var pref = {};
  try { pref = JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) {}
  var TH = (document.documentElement.lang || "th").indexOf("en") === 0 ? "en" : "th";
  var L = TH === "en"
    ? { t: "Accessibility", fp: "Larger text", fm: "Smaller text", ct: "High contrast", dk: "Dark mode", rm: "Reduce motion", rd: "Read aloud", stop: "Stop", rs: "Reset", close: "Close" }
    : { t: "การเข้าถึง", fp: "ขยายตัวอักษร", fm: "ลดตัวอักษร", ct: "คอนทราสต์สูง", dk: "โหมดมืด", rm: "ลดการเคลื่อนไหว", rd: "อ่านออกเสียง", stop: "หยุด", rs: "รีเซ็ต", close: "ปิด" };

  var css = ""
    + ".wx-a11y-btn{position:fixed;left:16px;bottom:16px;z-index:9998;width:48px;height:48px;border-radius:50%;border:none;background:var(--c-primary,#EE5020);color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);font-size:22px;display:flex;align-items:center;justify-content:center}"
    + ".wx-a11y-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}"
    + ".wx-a11y-panel{position:fixed;left:16px;bottom:74px;z-index:9999;width:248px;background:#fff;color:#111;border-radius:14px;box-shadow:0 10px 34px rgba(0,0,0,.28);padding:12px;font-family:inherit;display:none}"
    + ".wx-a11y-panel.open{display:block}"
    + ".wx-a11y-panel h4{margin:2px 4px 10px;font-size:15px}"
    + ".wx-a11y-panel button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:9px 10px;margin:3px 0;border:1px solid #e3e3e8;border-radius:9px;background:#fafafb;color:#111;cursor:pointer;font-size:14px}"
    + ".wx-a11y-panel button:hover{background:#f0f0f3}"
    + ".wx-a11y-panel button[aria-pressed=true]{background:#fde8e2;border-color:var(--c-primary,#EE5020)}"
    + ".wx-a11y-ico{width:20px;text-align:center}"
    + "html[data-wx-contrast=on]{filter:contrast(1.35)}"
    + "html[data-wx-motion=off] *{animation:none!important;transition:none!important;scroll-behavior:auto!important}"
    + "html[data-wx-dark=on]{filter:invert(1) hue-rotate(180deg)}html[data-wx-dark=on] img,html[data-wx-dark=on] video,html[data-wx-dark=on] svg,html[data-wx-dark=on] [style*='background-image']{filter:invert(1) hue-rotate(180deg)}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function apply() {
    var r = document.documentElement;
    if (pref.font) r.style.fontSize = pref.font + "%"; else r.style.removeProperty("font-size");
    r.setAttribute("data-wx-contrast", pref.contrast ? "on" : "off");
    r.setAttribute("data-wx-dark", pref.dark ? "on" : "off");
    r.setAttribute("data-wx-motion", pref.motion === false ? "off" : "on");
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(pref)); } catch (e) {} apply(); sync(); }

  var btn = document.createElement("button");
  btn.className = "wx-a11y-btn"; btn.setAttribute("aria-label", L.t); btn.setAttribute("aria-expanded", "false"); btn.innerHTML = "&#9855;";
  var panel = document.createElement("div");
  panel.className = "wx-a11y-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", L.t);
  function row(id, ico, label) { return '<button data-a="' + id + '"><span class="wx-a11y-ico">' + ico + '</span>' + label + "</button>"; }
  // Complements the page's top a11y bar (font size + contrast live there); this
  // widget adds what it lacks: dark mode, reduce-motion, and read-aloud (TTS).
  panel.innerHTML = "<h4>" + L.t + "</h4>"
    + row("dark", "&#9728;", L.dk) + row("motion", "&#10227;", L.rm)
    + row("read", "&#128266;", L.rd) + row("reset", "&#8635;", L.rs);
  document.body.appendChild(btn); document.body.appendChild(panel);

  function sync() {
    panel.querySelector('[data-a=dark]').setAttribute("aria-pressed", pref.dark ? "true" : "false");
    panel.querySelector('[data-a=motion]').setAttribute("aria-pressed", pref.motion === false ? "true" : "false");
  }
  btn.addEventListener("click", function () { var o = panel.classList.toggle("open"); btn.setAttribute("aria-expanded", o ? "true" : "false"); });

  var reading = false, readBtn;
  function speak() {
    if (!("speechSynthesis" in window)) return;
    var sy = window.speechSynthesis;
    if (reading) { sy.cancel(); reading = false; readBtn.lastChild.nodeValue = L.rd; return; }
    var main = document.querySelector("main") || document.querySelector("article") || document.body;
    var text = (main.innerText || "").replace(/\s+/g, " ").trim().slice(0, 6000);
    if (!text) return;
    var u = new SpeechSynthesisUtterance(text); u.lang = TH === "en" ? "en-US" : "th-TH"; u.rate = 1;
    u.onend = function () { reading = false; readBtn.lastChild.nodeValue = L.rd; };
    sy.cancel(); sy.speak(u); reading = true; readBtn.lastChild.nodeValue = L.stop;
  }

  panel.addEventListener("click", function (e) {
    var b = e.target.closest("[data-a]"); if (!b) return; var a = b.getAttribute("data-a");
    if (a === "dark") { pref.dark = !pref.dark; save(); }
    else if (a === "motion") { pref.motion = pref.motion === false ? true : false; save(); }
    else if (a === "reset") { pref = {}; save(); }
    else if (a === "read") { readBtn = b; speak(); }
  });

  apply(); sync();
  // per-tenant opt-out: if the resolved tenant disables it, remove the widget
  setTimeout(function () {
    var f = window.DGA_TENANT_CFG && window.DGA_TENANT_CFG.features;
    if (f && f.a11y === false) { btn.remove(); panel.remove(); if (window.speechSynthesis) window.speechSynthesis.cancel(); }
  }, 1500);
})();
