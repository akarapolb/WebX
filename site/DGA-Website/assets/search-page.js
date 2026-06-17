/* ============================================================================
   search-page.js — หน้าค้นหาแบบไฮบริด (TOR 8): Simple + Advanced + Full-text
   เรียก /api/search (scope ตาม tenant) พร้อมตัวกรอง types/date/fileType/keyword
   ============================================================================ */
(function () {
  "use strict";
  if (!window.DGA_TENANT) { try { var u = new URLSearchParams(location.search).get("tenant"); if (u) window.DGA_TENANT = u; else { var ss = sessionStorage.getItem("dga-tenant"); if (ss) window.DGA_TENANT = ss; } } catch (e) {} }
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var TQS = window.DGA_TENANT ? "&tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var TYPES = [{ k: "article", l: "ข่าว/บทความ" }, { k: "service", l: "บริการ" }, { k: "faq", l: "คำถามที่พบบ่อย" }, { k: "job", l: "ตำแหน่งงาน" }, { k: "download", l: "เอกสารดาวน์โหลด" }, { k: "ebook", l: "e-book" }];
  var LBL = {}; TYPES.forEach(function (t) { LBL[t.k] = t.l; });

  var tc = $("#typeChecks");
  tc.innerHTML = TYPES.map(function (t) { return '<label class="srch-chk"><input type="checkbox" value="' + t.k + '" checked> ' + t.l + "</label>"; }).join("");

  function params() {
    var q = $("#q").value.trim();
    var types = [].slice.call(tc.querySelectorAll("input:checked")).map(function (i) { return i.value; });
    var p = "q=" + encodeURIComponent(q);
    if (types.length && types.length !== TYPES.length) p += "&types=" + encodeURIComponent(types.join(","));
    var from = $("#from").value, to = $("#to").value, ft = $("#fileType").value;
    if (from) p += "&from=" + from;
    if (to) p += "&to=" + to;
    if (ft) p += "&fileType=" + ft;
    return p;
  }
  function hi(text, q) {
    var out = esc(text);
    (q || "").toLowerCase().split(/\s+/).filter(Boolean).forEach(function (t) {
      var re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      out = out.replace(re, "<mark>$1</mark>");
    });
    return out;
  }
  function fileLink(url) { return url && url.indexOf("/uploads/") === 0 ? STRAPI + url : (url || "#"); }

  function run() {
    var q = $("#q").value.trim();
    $("#searchMeta").textContent = "กำลังค้นหา…";
    fetch(STRAPI + "/api/search?" + params() + TQS, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var data = j.data || [];
        $("#searchMeta").textContent = q ? ("พบ " + data.length + ' รายการสำหรับ "' + q + '"') : ("แสดง " + data.length + " รายการ");
        $("#searchResults").innerHTML = data.length ? data.map(function (it) {
          var isFile = it.type === "download" || it.type === "ebook";
          var href = isFile ? fileLink(it.url) : (it.url || "#");
          var ft = it.fileType ? " · " + String(it.fileType).toUpperCase() : "";
          var date = it.date ? " · " + new Date(it.date).toLocaleDateString("th-TH") : "";
          return '<a class="srch-item" href="' + esc(href) + '"' + (isFile ? ' target="_blank" rel="noopener"' : "") + ">" +
            '<span class="badge">' + esc(LBL[it.type] || it.type) + "</span>" +
            "<h3>" + hi(it.title || "", q) + "</h3><p>" + hi(it.snippet || "", q) + "</p>" +
            '<div class="ft">' + esc(it.type) + ft + date + "</div></a>";
        }).join("") : '<p style="color:var(--c-text-muted)">ไม่พบผลลัพธ์ ลองปรับคำค้นหรือตัวกรอง</p>';
      }).catch(function () { $("#searchMeta").textContent = "เกิดข้อผิดพลาดในการค้นหา"; });
  }

  $("#searchForm").addEventListener("submit", function (e) { e.preventDefault(); run(); });
  ["#from", "#to", "#fileType"].forEach(function (s) { $(s).addEventListener("change", run); });
  tc.addEventListener("change", run);

  var pre = new URLSearchParams(location.search).get("q");
  if (pre) { $("#q").value = pre; run(); }
})();
