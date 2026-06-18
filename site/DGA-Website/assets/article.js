/* ============================================================
   article.js — หน้ารายละเอียดข่าว/บทความ (TOR #5) + แท็ก (4.2) + ข่าวที่เกี่ยวข้อง (4.3)
   เปิดด้วย article.html?slug=<slug> · เก็บสถิติเข้าชม (/api/stat)
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
  var root = document.getElementById("art-root");
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
  function stat(id) { try { fetch(STRAPI + "/api/stat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "article", documentId: id }) }); } catch (e) {} }

  function mdInline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); }
  function md(text) {
    var lines = String(text || "").split(/\r?\n/), out = [], list = null;
    function close() { if (list) { out.push("</" + list + ">"); list = null; } }
    lines.forEach(function (ln) {
      var t = ln.trim(); if (!t) { close(); return; }
      var h = t.match(/^(#{2,3})\s+(.*)$/);
      if (h) { close(); out.push("<h" + h[1].length + ">" + mdInline(h[2]) + "</h" + h[1].length + ">"); return; }
      if (/^\d+\.\s+/.test(t)) { if (list !== "ol") { close(); list = "ol"; out.push("<ol>"); } out.push("<li>" + mdInline(t.replace(/^\d+\.\s+/, "")) + "</li>"); return; }
      if (/^[-*]\s+/.test(t)) { if (list !== "ul") { close(); list = "ul"; out.push("<ul>"); } out.push("<li>" + mdInline(t.replace(/^[-*]\s+/, "")) + "</li>"); return; }
      close(); out.push("<p>" + mdInline(t) + "</p>");
    });
    close(); return out.join("");
  }
  function thDate(d) { try { return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }); } catch (e) { return d || ""; } }

  function render(a) {
    document.title = a.title + " | สพร. (DGA)";
    var cover = media(a.coverImage);
    var tags = (a.tags || []).map(function (t) { return '<a class="art__tag" href="news.html?tag=' + encodeURIComponent(t) + '">#' + esc(t) + "</a>"; }).join("");
    var rel = (a.related || []).filter(function (r) { return r && r.slug; });
    var relHtml = rel.length ? '<div class="art__related"><h2>ข่าวที่เกี่ยวข้อง</h2><div class="gb-news">' +
      rel.map(function (r) {
        var img = media(r.coverImage, "medium");
        return '<a class="ga-post" href="article.html?slug=' + encodeURIComponent(r.slug) + '" style="text-decoration:none">' +
          (img ? '<div class="ga-post__img" style="background-image:url(\'' + img + "')\"></div>" : '<div class="ga-post__img"></div>') +
          '<div class="ga-post__body">' + (r.categoryLabel ? '<span class="ga-post__cat">' + esc(r.categoryLabel) + "</span>" : "") +
          "<h3>" + esc(r.title) + "</h3></div></a>";
      }).join("") + "</div></div>" : "";

    root.innerHTML =
      '<article class="art">' +
      (a.categoryLabel ? '<span class="art__cat">' + esc(a.categoryLabel) + "</span>" : "") +
      "<h1>" + esc(a.title) + "</h1>" +
      '<div class="art__meta"><span>📅 ' + esc(thDate(a.publishDate)) + "</span><span>👁 " + nf(a.views) + " เข้าชม</span></div>" +
      (cover ? '<img class="art__cover" src="' + cover + '" alt="' + esc(a.title) + '">' : "") +
      '<div class="art__body">' + md(a.body || a.excerpt || "") + "</div>" +
      (tags ? '<div class="art__tags">' + tags + "</div>" : "") +
      relHtml + "</article>";
  }

  var slug = new URLSearchParams(location.search).get("slug");
  if (!slug) { root.innerHTML = '<p class="gb-empty">ไม่ได้ระบุบทความ (?slug=)</p>'; return; }
  var url = STRAPI + "/api/articles?filters[slug][$eq]=" + encodeURIComponent(slug) +
    "&populate[coverImage]=true&populate[related][populate][coverImage]=true" + TQS;
  fetch(url, { headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var a = j && j.data && j.data[0];
      if (!a) { root.innerHTML = '<p class="gb-empty">ไม่พบบทความนี้</p>'; return; }
      render(a); stat(a.documentId);
    })
    .catch(function () { root.innerHTML = '<p class="gb-empty">โหลดบทความไม่สำเร็จ</p>'; });
})();
