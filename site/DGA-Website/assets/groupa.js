/* ============================================================
   groupa.js — ตัวเรนเดอร์หน้าแสดงผลโมดูล Group A
   หน้าเดียวจัดการได้ทั้ง blog / catalog / links (อ่านจาก body[data-ga-page])
   + แถบ Top Graphic ด้านบนหน้า links
   resolve tenant เหมือน cms.js (?tenant / subdomain / sessionStorage)
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
  var page = document.body.getAttribute("data-ga-page");
  var root = document.getElementById("ga-root");
  if (!root) return;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function nf(n) { return (n || 0).toLocaleString("th-TH"); }
  function media(m, size) {
    if (!m) return "";
    var f = m.formats || (m.data && m.data.attributes && m.data.attributes.formats);
    if (size && f && f[size] && f[size].url) { var su = f[size].url; return su.indexOf("http") === 0 ? su : STRAPI + su; }
    var u = m.url || (m.data && m.data.attributes && m.data.attributes.url);
    if (!u) return ""; return u.indexOf("http") === 0 ? u : STRAPI + u;
  }
  function get(path) { return fetch(STRAPI + "/api/" + path + TQS, { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (j) { return (j && j.data) || []; }); }
  function thDate(d) { try { return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return d || ""; } }

  // ---------- Blog ----------
  function renderBlog(items) {
    if (!items.length) { root.innerHTML = '<p class="ga-empty">ยังไม่มีบทความ</p>'; return; }
    root.innerHTML = '<div class="ga-blog">' + items.map(function (b) {
      var img = media(b.coverImage);
      return '<article class="ga-post">' +
        (img ? '<div class="ga-post__img" style="background-image:url(\'' + img + "')\"></div>" : '<div class="ga-post__img"></div>') +
        '<div class="ga-post__body">' +
        (b.category ? '<span class="ga-post__cat">' + esc(b.category) + "</span>" : "") +
        "<h3>" + esc(b.title) + "</h3>" +
        "<p>" + esc(b.excerpt || "") + "</p>" +
        '<div class="ga-post__meta"><span>' + esc(b.author || "") + " · " + esc(thDate(b.publishDate)) +
        "</span><span>" + nf(b.views) + " อ่าน</span></div></div></article>";
    }).join("") + "</div>";
  }

  // ---------- e-catalog ----------
  function renderCatalog(items) {
    if (!items.length) { root.innerHTML = '<p class="ga-empty">ยังไม่มีแคตตาล็อก</p>'; return; }
    items.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    root.innerHTML = '<div class="ga-cat">' + items.map(function (c) {
      var img = media(c.coverImage), file = media(c.file);
      var docIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><path d="M9 13h6M9 17h6"/></svg>';
      return '<div class="ga-catcard">' +
        (img ? '<div class="ga-catcard__img" style="background-image:url(\'' + img + "')\"></div>" : '<div class="ga-catcard__img">' + docIcon + "</div>") +
        '<div class="ga-catcard__body">' +
        (c.category ? '<span class="ga-post__cat">' + esc(c.category) + "</span>" : "") +
        "<h3>" + esc(c.title) + "</h3><p>" + esc(c.description || "") + "</p>" +
        '<a class="btn ' + (file ? "btn--primary" : "btn--ghost") + '" ' + (file ? 'href="' + file + '" target="_blank" rel="noopener"' : 'href="#" aria-disabled="true"') + ">" +
        (file ? "เปิด/ดาวน์โหลด" : "ยังไม่มีไฟล์") + "</a></div></div>";
    }).join("") + "</div>";
  }

  // ---------- Web Link (+ Top Graphic strip) ----------
  function linkIcon() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>'; }
  function renderLinks(items, tops) {
    var html = "";
    if (tops && tops.length) {
      var t = tops.sort(function (a, b) { return (a.order || 0) - (b.order || 0); })[0];
      var img = media(t.image);
      html += '<div class="ga-top"><a class="ga-top__item" href="' + esc(t.linkUrl || "#") + '">' +
        (img ? '<img src="' + img + '" alt="' + esc(t.title || "") + '">' : '<div class="ga-top__cap">' + esc(t.title || "") + "</div>") + "</a></div>";
    }
    if (!items.length) { root.innerHTML = html + '<p class="ga-empty">ยังไม่มีลิงก์</p>'; return; }
    var groups = {};
    items.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    items.forEach(function (l) { var g = l.category || "ทั่วไป"; (groups[g] = groups[g] || []).push(l); });
    html += '<div class="ga-wrap ga-sec">' + Object.keys(groups).map(function (g) {
      return '<div class="ga-linkgroup"><h2>' + esc(g) + '</h2><div class="ga-links">' +
        groups[g].map(function (l) {
          var th = media(l.thumbnail);
          return '<a class="ga-link" href="' + esc(l.url) + '"' + (l.openNewTab ? ' target="_blank" rel="noopener"' : "") + ">" +
            '<span class="ga-link__thumb"' + (th ? ' style="background-image:url(\'' + th + "')\"" : "") + ">" + (th ? "" : linkIcon()) + "</span>" +
            "<span><b>" + esc(l.title) + "</b><span>" + esc(l.description || "") + "</span></span></a>";
        }).join("") + "</div></div>";
    }).join("") + "</div>";
    root.innerHTML = html;
  }

  // ---------- Sitemap (#25) ----------
  function renderSitemap(items) {
    if (!items.length) { root.innerHTML = '<p class="ga-empty">ยังไม่มีแผนผังเว็บไซต์</p>'; return; }
    var groups = {};
    items.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    items.forEach(function (n) { (groups[n.group] = groups[n.group] || []).push(n); });
    root.innerHTML = '<div class="sm-cols">' + Object.keys(groups).map(function (g) {
      return '<nav class="sm-group" aria-label="' + esc(g) + '"><h2>' + esc(g) + '</h2><ul class="sm-list">' +
        groups[g].map(function (n) { return '<li><a href="' + esc(n.url || "#") + '">' + esc(n.label) + "</a></li>"; }).join("") +
        "</ul></nav>";
    }).join("") + "</div>";
  }

  // ---------- dispatch ----------
  root.innerHTML = '<p class="ga-empty">กำลังโหลด…</p>';
  if (page === "blog") get("blogs").then(renderBlog).catch(function () { root.innerHTML = '<p class="ga-empty">โหลดข้อมูลไม่สำเร็จ</p>'; });
  else if (page === "catalog") get("catalogs").then(renderCatalog).catch(function () { root.innerHTML = '<p class="ga-empty">โหลดข้อมูลไม่สำเร็จ</p>'; });
  else if (page === "links") Promise.all([get("weblinks"), get("top-graphics")]).then(function (r) { renderLinks(r[0], r[1]); }).catch(function () { root.innerHTML = '<p class="ga-empty">โหลดข้อมูลไม่สำเร็จ</p>'; });
  else if (page === "sitemap") get("sitemap-nodes?pagination[pageSize]=200").then(renderSitemap).catch(function () { root.innerHTML = '<p class="ga-empty">โหลดข้อมูลไม่สำเร็จ</p>'; });
})();
