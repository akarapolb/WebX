/* ============================================================================
   captcha.js — ตัวช่วย CAPTCHA สำหรับฟอร์มสาธารณะ (ออกโจทย์จากเซิร์ฟเวอร์)
   ใช้: DGACaptcha.mount(formEl) → แทรกช่องโจทย์ก่อนปุ่มส่ง
        DGACaptcha.get(formEl)   → { captchaId, captchaAnswer } สำหรับแนบไป POST
        DGACaptcha.reload(formEl)→ ขอโจทย์ใหม่ (เมื่อส่งผิด)
   ============================================================================ */
(function () {
  "use strict";
  var BASE = window.DGA_CMS_URL || "http://localhost:1337";
  var L = document.documentElement.lang === "en" ? "en" : "th";

  window.DGACaptcha = {
    mount: function (formEl, beforeSel) {
      if (!formEl || formEl.querySelector(".captcha-field")) return;
      var wrap = document.createElement("div");
      wrap.className = "captcha-field"; wrap.style.cssText = "margin:14px 0";
      wrap.innerHTML =
        '<label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px">' +
        (L === "en" ? "Verify you are human:" : "ยืนยันว่าไม่ใช่บอท:") +
        ' <b class="cap-q" style="font-family:monospace;font-size:15px">…</b></label>' +
        '<input class="cap-a input" inputmode="numeric" autocomplete="off" maxlength="4" style="max-width:160px" placeholder="' + (L === "en" ? "Answer" : "คำตอบ") + '">' +
        '<span class="cap-err" style="color:#c0392b;font-size:12.5px;margin-left:8px"></span>' +
        '<input type="hidden" class="cap-id">';
      var anchor = beforeSel ? formEl.querySelector(beforeSel) : formEl.querySelector('button[type="submit"]');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor);
      else formEl.appendChild(wrap);
      function load() {
        fetch(BASE + "/api/captcha", { headers: { Accept: "application/json" } })
          .then(function (r) { return r.json(); })
          .then(function (j) { wrap.querySelector(".cap-q").textContent = j.data.question; wrap.querySelector(".cap-id").value = j.data.id; })
          .catch(function () {});
      }
      load(); wrap.__reload = load;
    },
    get: function (formEl) {
      var w = formEl && formEl.querySelector(".captcha-field");
      return w ? { captchaId: w.querySelector(".cap-id").value, captchaAnswer: w.querySelector(".cap-a").value } : {};
    },
    reload: function (formEl) {
      var w = formEl && formEl.querySelector(".captcha-field");
      if (w) { if (w.__reload) w.__reload(); var a = w.querySelector(".cap-a"); if (a) a.value = ""; w.querySelector(".cap-err").textContent = (L === "en" ? "Incorrect — try again" : "ไม่ถูกต้อง ลองใหม่"); }
    },
  };
})();
