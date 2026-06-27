/* ============================================================
   contact.js — แบบฟอร์มติดต่อสอบถาม (TOR ภาคผนวก ก ข้อ 11.2)
   ส่งเข้า Strapi (contact-message) · CAPTCHA · ต่อ tenant
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
  var TQS = window.DGA_TENANT ? "?tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var form = document.getElementById("ctForm"), msg = document.getElementById("ctMsg");
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };

  function mountCap() { if (window.DGACaptcha) DGACaptcha.mount(form); }
  if (window.DGACaptcha) mountCap();
  else { var s = document.createElement("script"); s.src = "/assets/captcha.js"; s.onload = mountCap; document.head.appendChild(s); }

  function show(t, kind) {
    if (!msg) return;
    msg.textContent = t;
    msg.style.color = kind === "danger" ? "var(--c-danger)" : kind === "success" ? "var(--c-success)" : "var(--c-text-muted)";
    try { msg.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
  }
  function val(id) { var el = $(id); return el ? el.value.trim() : ""; }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    try {
      var payload = { name: val("ctName"), email: val("ctEmail"), phone: val("ctPhone"), subject: val("ctSubject"), message: val("ctMessage") };
      if (!payload.name || !payload.message) { show("กรุณากรอกชื่อ–นามสกุล และข้อความ", "danger"); return; }
      var cap = window.DGACaptcha ? DGACaptcha.get(form) : {};
      if (!cap.captchaAnswer) { show("กรุณากรอกรหัสยืนยัน (CAPTCHA) ก่อนส่ง", "danger"); var ca = form.querySelector(".cap-a"); if (ca) ca.focus(); return; }
      show("กำลังส่ง…", "muted");
      var btn = form.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
      fetch(STRAPI + "/api/contact-messages" + TQS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ data: payload }, cap)) })
        .then(function (r) { if (r.status === 400) { if (window.DGACaptcha) DGACaptcha.reload(form); throw { captcha: true }; } return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function () { show("ส่งข้อความเรียบร้อย ✓ ขอบคุณค่ะ เจ้าหน้าที่จะติดต่อกลับโดยเร็ว", "success"); form.reset(); if (window.DGACaptcha) DGACaptcha.reload(form); })
        .catch(function (err) { show(err && err.captcha ? "รหัสยืนยัน (CAPTCHA) ไม่ถูกต้อง โปรดลองใหม่" : "ส่งไม่สำเร็จ โปรดลองใหม่อีกครั้ง", "danger"); })
        .then(function () { if (btn) btn.disabled = false; });
    } catch (err) {
      show("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", "danger");
      try { console.error("[contact] submit error:", err); } catch (e) {}
    }
  });
})();
