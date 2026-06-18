/* ============================================================
   calendar.js — ปฏิทินกิจกรรม (TOR ภาคผนวก ก ข้อ 16) · มุมมอง เดือน/สัปดาห์/วัน
   ดึง events จาก Strapi (ต่อ tenant) · คลิกกิจกรรมเพื่อดูรายละเอียด
   ============================================================ */
(function () {
  "use strict";
  try {
    var qp = new URLSearchParams(location.search).get("tenant");
    var host = location.hostname, sub = host.split(".")[0];
    if (qp) { window.DGA_TENANT = qp; sessionStorage.setItem("dga-tenant", qp); }
    else if (host.indexOf(".localhost") > 0 && sub && sub !== "www") window.DGA_TENANT = sub;
    else { var ss = sessionStorage.getItem("dga-tenant"); if (ss) window.DGA_TENANT = ss; }
  } catch (e) {}
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var TQS = window.DGA_TENANT ? "&tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var root = document.getElementById("ga-root");
  if (!root) return;

  var DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  var MON = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ymd(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function hhmm(d) { return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function sameDay(a, b) { return ymd(a) === ymd(b); }

  var events = [], view = "month", cursor = new Date(), today = new Date(), selected = null;

  function evDate(e) { return new Date(e.start); }
  function eventsOn(d) { return events.filter(function (e) { return sameDay(evDate(e), d); }).sort(function (a, b) { return evDate(a) - evDate(b); }); }

  function render() {
    var title = view === "month" ? (MON[cursor.getMonth()] + " " + (cursor.getFullYear() + 543))
      : view === "day" ? (cursor.getDate() + " " + MON[cursor.getMonth()] + " " + (cursor.getFullYear() + 543))
      : "สัปดาห์ที่ " + cursor.getDate() + " " + MON[cursor.getMonth()];
    var html =
      '<div class="cal-bar"><div class="cal-nav"><button id="cal-prev" aria-label="ก่อนหน้า">‹</button> <button id="cal-next" aria-label="ถัดไป">›</button></div>' +
      "<h2>" + esc(title) + "</h2>" +
      '<div class="cal-views">' +
      '<button data-v="month" aria-pressed="' + (view === "month") + '">เดือน</button>' +
      '<button data-v="week" aria-pressed="' + (view === "week") + '">สัปดาห์</button>' +
      '<button data-v="day" aria-pressed="' + (view === "day") + '">วัน</button></div></div>';

    if (view === "month") html += monthGrid();
    else html += listView();
    html += selected ? detail(selected) : "";
    root.innerHTML = html;

    document.getElementById("cal-prev").onclick = function () { step(-1); };
    document.getElementById("cal-next").onclick = function () { step(1); };
    root.querySelectorAll(".cal-views button").forEach(function (b) { b.onclick = function () { view = b.getAttribute("data-v"); selected = null; render(); }; });
    root.querySelectorAll("[data-ev]").forEach(function (el) { el.onclick = function () { selected = events[+el.getAttribute("data-ev")]; render(); }; });
  }

  function monthGrid() {
    var first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    var startGrid = new Date(first); startGrid.setDate(1 - first.getDay());
    var cells = "";
    for (var i = 0; i < 42; i++) {
      var d = new Date(startGrid); d.setDate(startGrid.getDate() + i);
      var out = d.getMonth() !== cursor.getMonth();
      var evs = eventsOn(d).map(function (e) { return '<span class="cal-ev cal-ev--' + (e.color || "blue") + '" data-ev="' + events.indexOf(e) + '" title="' + esc(e.title) + '">' + esc(e.title) + "</span>"; }).join("");
      cells += '<div class="cal-cell' + (out ? " cal-cell--out" : "") + (sameDay(d, today) ? " cal-cell--today" : "") + '">' +
        '<span class="cal-daynum">' + d.getDate() + "</span>" + evs + "</div>";
    }
    return '<div class="cal-grid">' + DOW.map(function (w) { return '<div class="cal-dow">' + w + "</div>"; }).join("") + cells + "</div>";
  }

  function listView() {
    var list;
    if (view === "day") list = eventsOn(cursor);
    else { // week
      var s = new Date(cursor); s.setDate(cursor.getDate() - cursor.getDay());
      list = events.filter(function (e) { var d = evDate(e); var diff = (d - s) / 86400000; return diff >= 0 && diff < 7; }).sort(function (a, b) { return evDate(a) - evDate(b); });
    }
    if (!list.length) return '<p class="ga-empty">ไม่มีกิจกรรมในช่วงนี้</p>';
    return '<div class="cal-list">' + list.map(function (e) {
      var d = evDate(e);
      return '<div class="cal-listitem" data-ev="' + events.indexOf(e) + '" style="cursor:pointer">' +
        '<div class="cal-listitem__date"><b>' + d.getDate() + '</b><span>' + MON[d.getMonth()].slice(0, 3) + "</span></div>" +
        '<div class="cal-listitem__body"><h3>' + esc(e.title) + "</h3><p>" +
        (e.allDay ? "ทั้งวัน" : hhmm(d)) + (e.location ? " · " + esc(e.location) : "") + "</p></div></div>";
    }).join("") + "</div>";
  }

  function detail(e) {
    var d = evDate(e);
    return '<div class="cal-detail"><h3>' + esc(e.title) + "</h3>" +
      "<p>📅 " + d.getDate() + " " + MON[d.getMonth()] + " " + (d.getFullYear() + 543) + (e.allDay ? " (ทั้งวัน)" : " เวลา " + hhmm(d) + (e.end ? "–" + hhmm(new Date(e.end)) : "")) + "</p>" +
      (e.location ? "<p>📍 " + esc(e.location) + "</p>" : "") +
      (e.category ? "<p>🏷️ " + esc(e.category) + "</p>" : "") +
      (e.description ? "<p>" + esc(e.description) + "</p>" : "") + "</div>";
  }

  function step(dir) {
    if (view === "month") cursor.setMonth(cursor.getMonth() + dir);
    else if (view === "week") cursor.setDate(cursor.getDate() + 7 * dir);
    else cursor.setDate(cursor.getDate() + dir);
    selected = null; render();
  }

  root.innerHTML = '<p class="ga-empty">กำลังโหลดปฏิทิน…</p>';
  fetch(STRAPI + "/api/events?pagination[pageSize]=200" + TQS, { headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (j) { events = (j && j.data) || []; render(); })
    .catch(function () { root.innerHTML = '<p class="ga-empty">โหลดปฏิทินไม่สำเร็จ</p>'; });
})();
