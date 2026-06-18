/* ============================================================
   map.js — แผนที่ที่ตั้ง (TOR ภาคผนวก ก ข้อ 27) · Leaflet + OpenStreetMap (ฟรี ไม่ต้อง API key)
   ดึง locations จาก Strapi (ต่อ tenant) · ปุ่ม "หาที่ใกล้ฉัน" ใช้ Geolocation + Haversine
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
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var map, markers = [], locs = [];
  function haversine(a, b, c, d) { var R = 6371, p = Math.PI / 180; var x = 0.5 - Math.cos((c - a) * p) / 2 + Math.cos(a * p) * Math.cos(c * p) * (1 - Math.cos((d - b) * p)) / 2; return R * 2 * Math.asin(Math.sqrt(x)); }

  function init() {
    map = L.map("map").setView([13.83, 100.55], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    locs.forEach(function (l, i) {
      var m = L.marker([l.lat, l.lng]).addTo(map)
        .bindPopup("<b>" + esc(l.name) + "</b><br>" + esc(l.address || "") + (l.phone ? "<br>☎ " + esc(l.phone) : ""));
      markers[i] = m;
    });
    if (locs.length) { var g = L.featureGroup(markers); map.fitBounds(g.getBounds().pad(0.2)); }
    renderList();
  }

  function renderList(nearIdx, dist) {
    var el = document.getElementById("map-list");
    el.innerHTML = locs.map(function (l, i) {
      return '<div class="map-loc' + (i === nearIdx ? " is-near" : "") + '" data-i="' + i + '"><b>' + esc(l.name) + "</b>" +
        '<span>' + esc(l.address || "") + "</span>" +
        (i === nearIdx ? '<span class="map-dist">📍 ใกล้ที่สุด · ' + dist.toFixed(1) + " กม.</span>" : "") + "</div>";
    }).join("");
    el.querySelectorAll(".map-loc").forEach(function (c) {
      c.onclick = function () { var i = +c.getAttribute("data-i"); map.setView([locs[i].lat, locs[i].lng], 15); markers[i].openPopup(); };
    });
  }

  function findNearest() {
    var res = document.getElementById("map-result");
    if (!navigator.geolocation) { res.textContent = "อุปกรณ์ไม่รองรับการระบุตำแหน่ง"; return; }
    res.textContent = "กำลังค้นหาตำแหน่งของคุณ…";
    navigator.geolocation.getCurrentPosition(function (pos) {
      var la = pos.coords.latitude, ln = pos.coords.longitude, best = -1, bd = Infinity;
      locs.forEach(function (l, i) { var d = haversine(la, ln, l.lat, l.lng); if (d < bd) { bd = d; best = i; } });
      L.circleMarker([la, ln], { radius: 8, color: "#C2410C", fillColor: "#C2410C", fillOpacity: .8 }).addTo(map).bindPopup("ตำแหน่งของคุณ");
      if (best >= 0) { map.setView([locs[best].lat, locs[best].lng], 14); markers[best].openPopup(); renderList(best, bd); res.textContent = "ที่ใกล้ที่สุด: " + locs[best].name + " (" + bd.toFixed(1) + " กม.)"; }
    }, function () { res.textContent = "ไม่สามารถเข้าถึงตำแหน่งของคุณได้ (กรุณาอนุญาตการระบุตำแหน่ง)"; });
  }

  fetch(STRAPI + "/api/locations?pagination[pageSize]=200" + TQS, { headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      locs = (j && j.data) || [];
      if (!locs.length) { document.getElementById("map").innerHTML = '<p class="ga-empty">ยังไม่มีจุดที่ตั้ง</p>'; return; }
      if (window.L) init(); else { var t = setInterval(function () { if (window.L) { clearInterval(t); init(); } }, 100); }
      var btn = document.getElementById("map-near"); if (btn) btn.onclick = findNearest;
    })
    .catch(function () { document.getElementById("map").innerHTML = '<p class="ga-empty">โหลดแผนที่ไม่สำเร็จ</p>'; });
})();
