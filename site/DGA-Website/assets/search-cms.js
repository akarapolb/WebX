/* ============================================================================
   search-cms.js — สร้างชุดข้อมูลค้นหา/แชตบอท (window.DGA_DATA) จากเนื้อหา CMS จริง
   ของ tenant ปัจจุบัน (เซิร์ฟเวอร์ scope ตาม custom domain / X-Tenant อัตโนมัติ)
   ใช้แทน search-data.js แบบ mock → ช่องค้นหา (hero) + DGA Guide ตอบจากเนื้อหา CMS
   ลำดับ: fetch → ตั้ง DGA_DATA → โหลด home.js + tenant.js (ถ้าล้มเหลวก็ยังโหลด home.js)
   ============================================================================ */
(function () {
  "use strict";
  if (!window.DGA_TENANT) {
    try {
      var qp = new URLSearchParams(location.search).get("tenant");
      var host = location.hostname, sub = host.split(".")[0];
      if (qp) { window.DGA_TENANT = qp; sessionStorage.setItem("dga-tenant", qp); }
      else if (host.indexOf(".localhost") > 0 && sub && sub !== "www") window.DGA_TENANT = sub;
      else { var ss = sessionStorage.getItem("dga-tenant"); if (ss) window.DGA_TENANT = ss; }
    } catch (e) {}
  }
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var LANG = document.documentElement.lang === "en" ? "en" : "th";
  var T = window.DGA_TENANT ? "&tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var base = LANG === "en" ? "/en/" : "/";
  var bi = function (v) { var o = {}; o[LANG] = v == null ? "" : v; return o; };

  function get(path) {
    return fetch(STRAPI + "/api/" + path + "&locale=" + LANG + T, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : { data: [] }; })
      .then(function (j) { return j.data || []; })
      .catch(function () { return []; });
  }
  function load(src) { var s = document.createElement("script"); s.src = src; document.body.appendChild(s); }

  Promise.all([
    get("articles?pagination[pageSize]=100&sort=publishDate:desc"),
    get("services?pagination[pageSize]=100&sort=order:asc"),
    get("faqs?pagination[pageSize]=100&sort=order:asc"),
    get("jobs?pagination[pageSize]=100&sort=jobId:asc"),
  ]).then(function (res) {
    var items = [];
    (res[0] || []).forEach(function (a) { items.push({ icon: "i-doc", url: "#", cat: bi(a.categoryLabel || (LANG === "en" ? "News" : "ข่าว")), title: bi(a.title), desc: bi(a.excerpt || ""), kw: (a.title || "") + " " + (a.excerpt || ""), answer: bi(a.excerpt || a.title) }); });
    (res[1] || []).forEach(function (s) { items.push({ icon: s.icon || "i-grid", url: s.url || "#", cat: bi(LANG === "en" ? "Service" : "บริการ"), title: bi(s.title), desc: bi(s.description || ""), kw: (s.title || "") + " " + (s.description || ""), answer: bi(s.description || s.title) }); });
    (res[2] || []).forEach(function (f) { items.push({ icon: "i-chat", url: "#", cat: bi(LANG === "en" ? "FAQ" : "คำถามที่พบบ่อย"), title: bi(f.question), desc: bi(f.answer || ""), kw: (f.question || "") + " " + (f.answer || ""), answer: bi(f.answer || "") }); });
    (res[3] || []).forEach(function (j) { items.push({ icon: "i-users", url: base + "careers?id=" + j.jobId, cat: bi(LANG === "en" ? "Careers" : "ร่วมงานกับเรา"), title: bi(j.title), desc: bi(j.summary || ""), kw: (j.title || "") + " " + (j.summary || ""), answer: bi(j.summary || j.title) }); });
    if (items.length) {
      window.DGA_DATA = { items: items };
      console.info("%c[DGA] Search/AI ใช้เนื้อหาจาก CMS (" + items.length + " รายการ)", "color:#0a7");
    }
  }).catch(function () {}).then(function () {
    load("/assets/home.js");
    load("/assets/tenant.js");
    load("/assets/consent.js");
    load("/assets/modules.js");
    load("/assets/livechat.js");
  });
})();
