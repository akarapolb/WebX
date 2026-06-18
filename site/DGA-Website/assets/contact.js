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

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var payload = {
      name: $("ctName").value.trim(), email: $("ctEmail").value.trim(),
      phone: $("ctPhone").value.trim(), subject: $("ctSubject").value.trim(),
      message: $("ctMessage").value.trim(),
    };
    if (!payload.name || !payload.message) { msg.textContent = "กรุณากรอกชื่อและข้อความ"; msg.style.color = "var(--c-danger)"; return; }
    var cap = window.DGACaptcha ? DGACaptcha.get(form) : {};
    msg.textContent = "กำลังส่ง…"; msg.style.color = "var(--c-text-muted)";
    fetch(STRAPI + "/api/contact-messages" + TQS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ data: payload }, cap)) })
      .then(function (r) { if (r.status === 400) { if (window.DGACaptcha) DGACaptcha.reload(form); throw { captcha: true }; } return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function () { msg.textContent = "ส่งข้อความเรียบร้อย ขอบคุณค่ะ เจ้าหน้าที่จะติดต่อกลับโดยเร็ว"; msg.style.color = "var(--c-success)"; form.reset(); })
      .catch(function (err) { if (err && err.captcha) { msg.textContent = "ยืนยัน CAPTCHA ไม่ถูกต้อง โปรดลองใหม่"; msg.style.color = "var(--c-danger)"; return; } msg.textContent = "ส่งไม่สำเร็จ โปรดลองใหม่"; msg.style.color = "var(--c-danger)"; });
  });
})();
