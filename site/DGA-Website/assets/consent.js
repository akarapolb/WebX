/* ============================================================================
   consent.js — Cookie Consent (PDPA) แบบ granular + Web Analytics/Heatmap
   - หมวด: จำเป็น (ล็อกเปิด) / วิเคราะห์ / การตลาด — ค่าเริ่มต้น OFF (opt-in)
   - 2 ภาษา (อ่านจาก <html lang>) · เปิดตั้งค่าใหม่ได้จากปุ่ม footer #cookieSettings
   - บันทึก consent log ลง CMS (POST /api/consent-logs, scope ตาม tenant)
   - โหลด GA4 + Microsoft Clarity เฉพาะเมื่อผู้ใช้ยินยอม "วิเคราะห์" เท่านั้น
   ============================================================================ */
(function () {
  "use strict";
  if (window.__dgaConsentInit) return;
  window.__dgaConsentInit = true;

  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var TQS = window.DGA_TENANT ? "&tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var TQS1 = window.DGA_TENANT ? "?tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var LANG = document.documentElement.lang === "en" ? "en" : "th";
  var KEY = "dga-consent-v1", IDKEY = "dga-consent-id";

  var T = LANG === "en" ? {
    title: "We value your privacy",
    desc: "We use strictly necessary cookies to make this site work, and — only with your consent — analytics cookies to improve our services. Analytics are off by default (PDPA).",
    accept: "Accept all", reject: "Necessary only", settings: "Settings", save: "Save choices",
    always: "Always on", on: "On", off: "Off", close: "Close",
    cats: { necessary: "Strictly necessary", analytics: "Analytics", marketing: "Marketing" },
    catDesc: {
      necessary: "Required for the site to function (security, language, session).",
      analytics: "Helps us understand usage to improve services (Google Analytics, Microsoft Clarity).",
      marketing: "Used to personalise content and measure campaigns.",
    },
  } : {
    title: "เราเคารพความเป็นส่วนตัวของคุณ",
    desc: "เราใช้คุกกี้ที่จำเป็นเพื่อให้เว็บไซต์ทำงาน และใช้คุกกี้วิเคราะห์เพื่อปรับปรุงบริการ — เฉพาะเมื่อคุณยินยอมเท่านั้น โดยคุกกี้วิเคราะห์ปิดเป็นค่าเริ่มต้นตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)",
    accept: "ยอมรับทั้งหมด", reject: "เฉพาะที่จำเป็น", settings: "ตั้งค่า", save: "บันทึกการตั้งค่า",
    always: "เปิดตลอดเวลา", on: "เปิด", off: "ปิด", close: "ปิด",
    cats: { necessary: "จำเป็นต่อการใช้งาน", analytics: "การวิเคราะห์", marketing: "การตลาด" },
    catDesc: {
      necessary: "จำเป็นเพื่อให้เว็บไซต์ทำงาน (ความปลอดภัย ภาษา เซสชัน)",
      analytics: "ช่วยให้เข้าใจการใช้งานเพื่อปรับปรุงบริการ (Google Analytics, Microsoft Clarity)",
      marketing: "ใช้ปรับเนื้อหาให้เหมาะกับคุณและวัดผลแคมเปญ",
    },
  };

  function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function writeC(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  function cid() { try { var id = localStorage.getItem(IDKEY); if (!id) { id = "c-" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(IDKEY, id); } return id; } catch (e) { return "anon"; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- styles ---------- */
  var css = "" +
    ".ck2-bar{position:fixed;left:16px;right:16px;bottom:16px;z-index:9000;max-width:760px;margin:0 auto;background:var(--c-surface,#fff);color:var(--c-text,#1a1a1a);border:1px solid var(--c-border,#e5e5e5);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.18);padding:18px 20px;display:none}" +
    ".ck2-bar.show{display:block}" +
    ".ck2-bar h2{margin:0 0 6px;font-size:16px;font-weight:700}" +
    ".ck2-bar p{margin:0 0 14px;font-size:13.5px;line-height:1.55;color:var(--c-text-muted,#555)}" +
    ".ck2-row{display:flex;gap:10px;flex-wrap:wrap}" +
    ".ck2-btn{min-height:40px;padding:8px 16px;border-radius:10px;font:inherit;font-weight:600;font-size:13.5px;cursor:pointer;border:1px solid var(--c-border-strong,#cfcfcf);background:transparent;color:var(--c-primary,#1a4fa0)}" +
    ".ck2-btn--primary{background:var(--c-primary,#1a4fa0);color:#fff;border-color:transparent}" +
    ".ck2-btn--grow{flex:1;min-width:120px;justify-content:center}" +
    ".ck2-ov{position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.45);display:none;place-items:center;padding:16px}" +
    ".ck2-ov.show{display:grid}" +
    ".ck2-modal{width:min(560px,100%);max-height:90vh;overflow:auto;background:var(--c-surface,#fff);color:var(--c-text,#1a1a1a);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.3);padding:22px}" +
    ".ck2-modal h2{margin:0 0 4px;font-size:18px}" +
    ".ck2-modal>p{margin:0 0 16px;font-size:13px;color:var(--c-text-muted,#555)}" +
    ".ck2-cat{border:1px solid var(--c-border,#e5e5e5);border-radius:12px;padding:14px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start;justify-content:space-between}" +
    ".ck2-cat b{display:block;font-size:14px;margin-bottom:3px}" +
    ".ck2-cat span{font-size:12.5px;color:var(--c-text-muted,#555);line-height:1.5}" +
    ".ck2-sw{position:relative;width:46px;height:26px;flex:none;margin-top:2px}" +
    ".ck2-sw input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}" +
    ".ck2-sw i{position:absolute;inset:0;background:#bbb;border-radius:999px;transition:.2s}" +
    ".ck2-sw i:before{content:'';position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}" +
    ".ck2-sw input:checked+i{background:var(--c-primary,#1a4fa0)}" +
    ".ck2-sw input:checked+i:before{transform:translateX(20px)}" +
    ".ck2-sw input:disabled+i{opacity:.55}" +
    ".ck2-lock{font-size:12px;color:var(--c-text-muted,#777);white-space:nowrap;margin-top:5px}" +
    ".ck2-modal .ck2-row{margin-top:6px}" +
    "@media(prefers-reduced-motion:reduce){.ck2-sw i,.ck2-sw i:before{transition:none}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------- remove old static banner + build UI ---------- */
  var oldBanner = document.getElementById("cookie"); if (oldBanner) oldBanner.remove();

  var bar = document.createElement("section");
  bar.className = "ck2-bar"; bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", T.title); bar.setAttribute("aria-live", "polite");
  bar.innerHTML =
    "<h2>" + esc(T.title) + "</h2><p>" + esc(T.desc) + "</p>" +
    '<div class="ck2-row">' +
    '<button class="ck2-btn ck2-btn--primary ck2-btn--grow" data-act="accept">' + esc(T.accept) + "</button>" +
    '<button class="ck2-btn ck2-btn--grow" data-act="reject">' + esc(T.reject) + "</button>" +
    '<button class="ck2-btn" data-act="settings">' + esc(T.settings) + "</button>" +
    "</div>";
  document.body.appendChild(bar);

  function catRow(k, checked, locked) {
    return '<div class="ck2-cat"><div><b>' + esc(T.cats[k]) + "</b><span>" + esc(T.catDesc[k]) + "</span></div>" +
      (locked ? '<span class="ck2-lock">' + esc(T.always) + "</span>"
        : '<label class="ck2-sw"><input type="checkbox" data-cat="' + k + '"' + (checked ? " checked" : "") + ' aria-label="' + esc(T.cats[k]) + '"><i></i></label>') +
      "</div>";
  }
  var ov = document.createElement("div");
  ov.className = "ck2-ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", T.settings);
  ov.innerHTML = '<div class="ck2-modal">' +
    "<h2>" + esc(T.settings) + "</h2><p>" + esc(T.desc) + "</p>" +
    catRow("necessary", true, true) + catRow("analytics", false, false) + catRow("marketing", false, false) +
    '<div class="ck2-row"><button class="ck2-btn ck2-btn--primary ck2-btn--grow" data-act="save">' + esc(T.save) + "</button>" +
    '<button class="ck2-btn ck2-btn--grow" data-act="acceptM">' + esc(T.accept) + "</button></div></div>";
  document.body.appendChild(ov);

  /* ---------- consent log + analytics ---------- */
  function logConsent(action, c) {
    try {
      fetch(STRAPI + "/api/consent-logs" + TQS1, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { consentId: cid(), action: action, categories: c, language: LANG, path: location.pathname, userAgent: navigator.userAgent } }),
      }).catch(function () {});
    } catch (e) {}
  }
  function loadGA(id) {
    var s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + id; document.head.appendChild(s);
    window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date()); window.gtag("config", id, { anonymize_ip: true });
  }
  function loadClarity(id) {
    (function (c, l, a, r, i) { c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); }; var t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i; var y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y); })(window, document, "clarity", "script", id);
  }
  function loadAnalytics() {
    if (window.__dgaAnalyticsLoaded) return;
    fetch(STRAPI + "/api/tenants/resolve?_=1" + TQS, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var a = j && j.data && j.data.analytics; if (!a || a.enabled === false) return;
        window.__dgaAnalyticsLoaded = true;
        var demo = /demo/i.test(String(a.ga4 || "") + String(a.clarity || ""));
        if (demo) { console.info("%c[consent] ยินยอมคุกกี้วิเคราะห์ → จะโหลด GA4=" + a.ga4 + " + Clarity=" + a.clarity + " (โหมด demo: ไม่เรียกจริง)", "color:#0a7"); return; }
        if (a.ga4) loadGA(a.ga4);
        if (a.clarity) loadClarity(a.clarity);
        console.info("%c[consent] โหลด analytics แล้ว (ผู้ใช้ยินยอม)", "color:#0a7");
      }).catch(function () {});
  }
  function applyConsent(c) { if (c && c.analytics) loadAnalytics(); }

  /* ---------- flow ---------- */
  function showBar(b) { bar.classList.toggle("show", b); }
  function openModal() {
    var c = read() || {};
    ov.querySelectorAll("input[data-cat]").forEach(function (inp) { inp.checked = !!c[inp.getAttribute("data-cat")]; });
    ov.classList.add("show");
    var first = ov.querySelector("input[data-cat]"); if (first) first.focus();
  }
  function closeModal() { ov.classList.remove("show"); }
  function commit(c, action) { writeC(c); logConsent(action, c); applyConsent(c); showBar(false); closeModal(); }

  bar.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act");
    if (act === "accept") commit({ necessary: true, analytics: true, marketing: true, ts: Date.now() }, "accept_all");
    else if (act === "reject") commit({ necessary: true, analytics: false, marketing: false, ts: Date.now() }, "reject");
    else if (act === "settings") openModal();
  });
  ov.addEventListener("click", function (e) {
    if (e.target === ov) return closeModal();
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act");
    if (act === "acceptM") { ov.querySelectorAll("input[data-cat]").forEach(function (i) { i.checked = true; }); }
    if (act === "save" || act === "acceptM") {
      var c = { necessary: true, ts: Date.now() };
      ov.querySelectorAll("input[data-cat]").forEach(function (i) { c[i.getAttribute("data-cat")] = i.checked; });
      commit(c, act === "acceptM" ? "accept_all" : "save");
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && ov.classList.contains("show")) closeModal(); });

  // ปุ่ม "ตั้งค่าคุกกี้" ใน footer → เปิดแผงตั้งค่าได้ทุกเมื่อ
  var fbtn = document.getElementById("cookieSettings");
  if (fbtn) { var clone = fbtn.cloneNode(true); fbtn.parentNode.replaceChild(clone, fbtn); clone.addEventListener("click", openModal); }

  // เริ่มต้น: ถ้ายังไม่เคยเลือก → แสดงแบนเนอร์; ถ้าเคยแล้ว → ใช้ค่าที่บันทึก
  var saved = read();
  if (saved) applyConsent(saved); else setTimeout(function () { showBar(true); }, 600);
})();
