/* ============================================================================
   jobs-cms.js — โหลดตำแหน่งงานจาก Strapi CMS แล้วประกอบเป็น window.DGA_JOBS
   (โครงสร้างเดียวกับ jobs-data.js เดิม: ฟิลด์ข้อความเป็น {th,en})
   ดึงทั้ง th และ en มารวมกันด้วย jobId เพื่อให้สลับภาษาได้เหมือนเดิม
   ลำดับ: fetch → set DGA_JOBS → โหลด careers.js  (ถ้า fetch ล้มเหลว → ใช้ jobs-data.js เดิม)
   ============================================================================ */
(function () {
  "use strict";
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";

  function api(locale) {
    return fetch(STRAPI + "/api/jobs?locale=" + locale + "&pagination[pageSize]=100&sort=jobId:asc", {
      headers: { Accept: "application/json" },
    }).then(function (r) { if (!r.ok) throw new Error("jobs " + locale + " HTTP " + r.status); return r.json(); })
      .then(function (j) { return j.data || []; });
  }

  function reshape(th, en) {
    var enMap = {};
    en.forEach(function (j) { enMap[j.jobId] = j; });
    var bi = function (a, b) { return { th: a, en: (b == null ? a : b) }; };
    return th.map(function (t) {
      var e = enMap[t.jobId] || {};
      return {
        id: t.jobId, deptKey: t.deptKey, typeKey: t.typeKey, openings: t.openings,
        title: bi(t.title, e.title), dept: bi(t.dept, e.dept), type: bi(t.type, e.type),
        location: bi(t.location, e.location), salary: bi(t.salary, e.salary), deadline: bi(t.deadline, e.deadline),
        summary: bi(t.summary, e.summary),
        responsibilities: bi(t.responsibilities || [], e.responsibilities || []),
        qualifications: bi(t.qualifications || [], e.qualifications || []),
        benefits: bi(t.benefits || [], e.benefits || []),
      };
    });
  }

  function load(src, cb) {
    var s = document.createElement("script");
    s.src = src; s.onload = cb; s.onerror = cb;
    document.body.appendChild(s);
  }

  Promise.all([api("th"), api("en")])
    .then(function (res) {
      window.DGA_JOBS = reshape(res[0], res[1]);
      console.info("%c[DGA] ตำแหน่งงานโหลดจาก CMS (" + window.DGA_JOBS.length + " ตำแหน่ง)", "color:#0a7");
      load("/assets/careers.js");
    })
    .catch(function (e) {
      console.warn("[DGA] โหลดงานจาก CMS ไม่สำเร็จ — ใช้ jobs-data.js เดิม", e);
      load("/assets/jobs-data.js", function () { load("/assets/careers.js"); });
    });
})();
