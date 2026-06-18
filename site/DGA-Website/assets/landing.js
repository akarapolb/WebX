/* ============================================================
   landing.js — ตัวเรนเดอร์หน้า Landing/Splash (no-code page builder)
   อ่าน ?slug= → ดึงข้อมูลจาก Strapi (/api/landings) → เรนเดอร์บล็อกตาม
   ลำดับที่แอดมินจัดไว้ใน Dynamic Zone โดยไม่ต้องเขียนโค้ดเพิ่ม
   รองรับ multi-tenant (ส่ง &tenant=) เหมือน cms.js
   ============================================================ */
(function () {
  "use strict";

  // ---- resolve tenant (dev): ?tenant=pea → sessionStorage → subdomain ----
  try {
    var qp = new URLSearchParams(location.search).get("tenant");
    var host = location.hostname, sub = host.split(".")[0];
    if (qp) { window.DGA_TENANT = qp; sessionStorage.setItem("dga-tenant", qp); }
    else if (host.indexOf(".localhost") > 0 && sub && sub !== "www") window.DGA_TENANT = sub;
    else { var ss = sessionStorage.getItem("dga-tenant"); if (ss) window.DGA_TENANT = ss; }
  } catch (e) {}

  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var TQS = window.DGA_TENANT ? "&tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var root = document.getElementById("landing-root");
  if (!root) return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function mediaUrl(m) {
    var u = m && (m.url || (m.data && m.data.attributes && m.data.attributes.url));
    if (!u) return "";
    return u.indexOf("http") === 0 ? u : STRAPI + u;
  }
  function state(title, msg) {
    root.innerHTML =
      '<section class="l-state"><h1>' + esc(title) + "</h1><p>" + esc(msg) +
      '</p><p><a class="btn btn--primary" href="index.html">กลับหน้าแรก</a></p></section>';
  }

  // ---- markdown ย่อ → HTML (รองรับ ## ### , รายการเลข/จุด, **ตัวหนา**, ย่อหน้า) ----
  function mdInline(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }
  function mdToHtml(md) {
    var lines = String(md || "").split(/\r?\n/), out = [], list = null;
    function closeList() { if (list) { out.push("</" + list + ">"); list = null; } }
    lines.forEach(function (ln) {
      var t = ln.trim();
      if (!t) { closeList(); return; }
      var h = t.match(/^(#{2,3})\s+(.*)$/);
      if (h) { closeList(); out.push("<h" + h[1].length + ">" + mdInline(h[2]) + "</h" + h[1].length + ">"); return; }
      if (/^\d+\.\s+/.test(t)) { if (list !== "ol") { closeList(); list = "ol"; out.push("<ol>"); } out.push("<li>" + mdInline(t.replace(/^\d+\.\s+/, "")) + "</li>"); return; }
      if (/^[-*]\s+/.test(t)) { if (list !== "ul") { closeList(); list = "ul"; out.push("<ul>"); } out.push("<li>" + mdInline(t.replace(/^[-*]\s+/, "")) + "</li>"); return; }
      closeList(); out.push("<p>" + mdInline(t) + "</p>");
    });
    closeList();
    return out.join("");
  }

  // ---------- ตัวเรนเดอร์รายบล็อก ----------
  var renderers = {
    "block.hero": function (b) {
      var img = mediaUrl(b.image);
      return '<section class="l-hero' + (img ? " l-hero--img" : "") + '" data-align="' + esc(b.align || "center") + '"' +
        (img ? ' style="--_bg:url(\'' + img + "')\"" : "") + ">" +
        '<div class="l-hero__inner">' +
        (b.kicker ? '<span class="l-hero__kicker">' + esc(b.kicker) + "</span>" : "") +
        "<h1>" + esc(b.heading) + "</h1>" +
        (b.subheading ? '<p class="l-hero__sub">' + esc(b.subheading) + "</p>" : "") +
        (b.ctaLabel ? '<a class="btn btn--primary btn--lg" href="' + esc(b.ctaUrl || "#") + '">' + esc(b.ctaLabel) + "</a>" : "") +
        "</div></section>";
    },
    "block.feature-grid": function (b) {
      var cards = (b.items || []).map(function (it) {
        return '<div class="l-card"><div class="l-card__ic"><svg aria-hidden="true"><use href="#' +
          esc(it.icon || "i-check") + '"></use></svg></div>' +
          (it.title ? "<h3>" + esc(it.title) + "</h3>" : "") +
          (it.text ? "<p>" + esc(it.text) + "</p>" : "") + "</div>";
      }).join("");
      return '<section class="l-features"><div class="l-wrap">' +
        (b.heading ? "<h2>" + esc(b.heading) + "</h2>" : "") +
        '<div class="l-grid" data-cols="' + esc(b.columns || "3") + '">' + cards + "</div></div></section>";
    },
    "block.richtext": function (b) {
      return '<section class="l-rich"><div class="l-wrap">' + mdToHtml(b.body) + "</div></section>";
    },
    "block.image": function (b) {
      var img = mediaUrl(b.image);
      if (!img) return "";
      return '<section class="l-image' + (b.full ? " l-image--full" : "") + '"><div class="l-wrap"><figure>' +
        '<img src="' + img + '" alt="' + esc(b.caption || "") + '">' +
        (b.caption ? "<figcaption>" + esc(b.caption) + "</figcaption>" : "") + "</figure></div></section>";
    },
    "block.cta-banner": function (b) {
      return '<section class="l-cta l-cta--' + esc(b.theme || "primary") + '"><div class="l-cta__inner">' +
        (b.heading ? "<h2>" + esc(b.heading) + "</h2>" : "") +
        (b.text ? "<p>" + esc(b.text) + "</p>" : "") +
        (b.buttonLabel ? '<a class="btn btn--primary btn--lg" href="' + esc(b.buttonUrl || "#") + '">' + esc(b.buttonLabel) + "</a>" : "") +
        "</div></section>";
    }
  };

  function render(landing) {
    if (landing.title) document.title = landing.title + " | สพร. (DGA)";
    if (landing.seoDescription) {
      var m = document.querySelector('meta[name="description"]');
      if (m) m.setAttribute("content", landing.seoDescription);
    }
    var html = (landing.blocks || []).map(function (b) {
      var fn = renderers[b.__component];
      return fn ? fn(b) : "";
    }).join("");
    root.innerHTML = html || "";
    // โหลดส่วนแบรนด์/ฟุตเตอร์ต่อ tenant (เหมือนหน้าอื่น)
    var ts = document.createElement("script"); ts.src = "/assets/tenant.js"; document.body.appendChild(ts);
  }

  // ---------- โหลดข้อมูล ----------
  var slug = new URLSearchParams(location.search).get("slug");
  if (!slug) { state("ไม่ได้ระบุหน้า", "กรุณาระบุพารามิเตอร์ ?slug= ของหน้า Landing ที่ต้องการเปิด"); return; }

  var url = STRAPI + "/api/landings?filters[slug][$eq]=" + encodeURIComponent(slug) +
    "&filters[active][$eq]=true&populate[blocks][populate]=*" + TQS;

  fetch(url, { headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var item = j && j.data && j.data[0];
      if (!item) { state("ไม่พบหน้านี้", "หน้า Landing ที่ขอ (" + slug + ") ไม่มีอยู่ หรือยังไม่ได้เผยแพร่"); return; }
      render(item);
    })
    .catch(function () {
      state("เชื่อมต่อระบบไม่ได้", "ไม่สามารถโหลดข้อมูลหน้า Landing ได้ในขณะนี้");
    });
})();
