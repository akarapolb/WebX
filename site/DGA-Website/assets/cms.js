/* ============================================================================
   cms.js — ต่อหน้าแรก DGA เข้ากับ Strapi Headless CMS
   ลำดับการทำงาน: ดึงข้อมูลจาก API → เรนเดอร์ลง DOM → จากนั้นจึงโหลด home.js
   (home.js เป็น IIFE ที่อ่าน DOM ทันที จึงต้องเรนเดอร์ให้เสร็จก่อน)
   ถ้า API ใช้งานไม่ได้ จะ fallback ไปใช้เนื้อหา static เดิมในหน้าโดยอัตโนมัติ
   ============================================================================ */
(function () {
  "use strict";

  // ---- เลือก tenant (dev): ?tenant=pea → จำใน sessionStorage (ต่อแท็บ) → subdomain (pea.localhost) ----
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
  var TQS = window.DGA_TENANT ? "&tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var TH_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  var EN_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  /* ---------- utils ---------- */
  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function mediaUrl(m) {
    if (!m) return "";
    var u = m.url || (m.data && m.data.attributes && m.data.attributes.url) || "";
    if (!u) return "";
    return u.indexOf("http") === 0 ? u : STRAPI + u;
  }
  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    if (LANG === "en") return d.getDate() + " " + EN_MONTHS[d.getMonth()] + " " + d.getFullYear();
    var yy = (d.getFullYear() + 543) % 100;
    return d.getDate() + " " + TH_MONTHS[d.getMonth()] + " " + yy;
  }
  function fmtViews(n) {
    return Number(n || 0).toLocaleString(LANG === "en" ? "en-US" : "th-TH");
  }
  function icon(id) {
    return '<svg class="icon" aria-hidden="true"><use href="#' + id + '"/></svg>';
  }
  function get(path) {
    return fetch(STRAPI + "/api/" + path + TQS, { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error(path + " → HTTP " + r.status);
        return r.json();
      })
      .then(function (j) { return j.data; });
  }

  // สร้างชุดข้อมูลค้นหา/แชตบอท (window.DGA_DATA) จากเนื้อหา CMS ของ tenant ปัจจุบัน
  function buildSearchData(services, articles, faqs, jobs) {
    var bi = function (v) { var o = {}; o[LANG] = v == null ? "" : v; return o; };
    var jb = LANG === "en" ? "/en/" : "/";
    var items = [];
    (articles || []).forEach(function (a) { items.push({ icon: "i-doc", url: "#", cat: bi(a.categoryLabel || (LANG === "en" ? "News" : "ข่าว")), title: bi(a.title), desc: bi(a.excerpt || ""), kw: (a.title || "") + " " + (a.excerpt || ""), answer: bi(a.excerpt || a.title) }); });
    (services || []).forEach(function (s) { items.push({ icon: s.icon || "i-grid", url: s.url || "#", cat: bi(LANG === "en" ? "Service" : "บริการ"), title: bi(s.title), desc: bi(s.description || ""), kw: (s.title || "") + " " + (s.description || ""), answer: bi(s.description || s.title) }); });
    (faqs || []).forEach(function (f) { items.push({ icon: "i-chat", url: "#", cat: bi(LANG === "en" ? "FAQ" : "คำถามที่พบบ่อย"), title: bi(f.question), desc: bi(f.answer || ""), kw: (f.question || "") + " " + (f.answer || ""), answer: bi(f.answer || "") }); });
    (jobs || []).forEach(function (j) { items.push({ icon: "i-users", url: jb + "careers.html?id=" + j.jobId, cat: bi(LANG === "en" ? "Careers" : "ร่วมงานกับเรา"), title: bi(j.title), desc: bi(j.summary || ""), kw: (j.title || "") + " " + (j.summary || ""), answer: bi(j.summary || j.title) }); });
    if (items.length) window.DGA_DATA = { items: items };
  }

  /* ---------- renderers ---------- */
  function renderHero(home) {
    if (!home || !home.hero) return;
    var h = home.hero;
    var kicker = document.querySelector(".home-hero .hero-kicker");
    if (kicker && h.kicker) kicker.innerHTML = icon("i-shield") + " " + esc(h.kicker);
    var head = document.getElementById("hero-h");
    if (head) head.innerHTML = esc(h.headingLine1) + '<br><span class="accent">' + esc(h.headingAccent) + "</span>";
    var lead = document.querySelector(".home-hero .lead");
    if (lead && h.lead) lead.textContent = h.lead;
    var q = document.getElementById("q");
    if (q) {
      if (h.searchPlaceholder) q.setAttribute("placeholder", h.searchPlaceholder);
      if (h.typewriterPhrases) q.setAttribute("data-phrases", JSON.stringify(h.typewriterPhrases));
    }
    var tags = document.querySelector(".home-hero .hero-tags");
    if (tags && h.popularTags && h.popularTags.length) {
      var lbl = LANG === "en" ? "Popular:" : "ยอดนิยม:";
      tags.innerHTML = "<span>" + lbl + "</span>" +
        h.popularTags.map(function (t) { return '<a href="' + esc(t.url || "#") + '">' + esc(t.label) + "</a>"; }).join("");
    }
    var bg = document.getElementById("heroBg");
    if (bg) {
      if (h.slides && h.slides.length) {
        bg.innerHTML = h.slides.map(function (s, i) {
          return '<div class="hero-slide' + (i === 0 ? " is-active" : "") + '" style="background-image:url(\'' + mediaUrl(s) + "')\"></div>";
        }).join("");
      } else {
        bg.innerHTML = ""; // tenant ไม่มีสไลด์ → ใช้พื้นหลังไล่เฉดสี ไม่ค้างรูป tenant อื่น
      }
    }
  }

  function renderStats(home) {
    var wrap = document.querySelector(".stats-band .wrap");
    if (!wrap || !home || !home.stats || !home.stats.length) return;
    wrap.innerHTML = home.stats.map(function (s) {
      var num, label = esc(s.label), val = s.value || "";
      var m = String(val).match(/^([\d.,]+)(.*)$/);
      if (m) {
        var clean = m[1].replace(/,/g, "");
        var dec = (clean.split(".")[1] || "").length;
        num = '<b class="stat-num" data-count="' + clean + '"' +
          (dec ? ' data-decimals="' + dec + '"' : "") +
          ' data-suffix="' + esc(m[2]) + '" aria-hidden="true">0</b>';
      } else {
        num = '<b class="stat-num" aria-hidden="true">' + esc(val) + "</b>";
      }
      return '<div class="stat-item"><span class="ic"><svg class="icon icon--lg"><use href="#i-' + esc(s.icon || "grid") + '"/></svg></span>' +
        '<div class="stat-body">' + num +
        '<span class="stat-label" aria-hidden="true">' + label + "</span>" +
        '<span class="visually-hidden">' + label + " " + esc(val) + "</span></div></div>";
    }).join("");
  }

  function renderServices(items) {
    var grid = document.querySelector(".svc-grid");
    if (!grid || items == null) return;
    grid.innerHTML = items.map(function (s) {
      return '<li><a class="svc t-' + esc(s.colorTheme || "blue") + '" href="' + esc(s.url || "#") + '">' +
        '<span class="ic" aria-hidden="true"><svg class="icon icon--lg"><use href="#' + esc(s.icon || "i-grid") + '"/></svg></span>' +
        "<span><b>" + esc(s.title) + "</b><span>" + esc(s.description || "") + "</span></span>" +
        '<span class="go" aria-hidden="true">' + icon("i-arrow") + "</span></a></li>";
    }).join("");
  }

  function renderBanners(items) {
    var track = document.getElementById("hlTrack");
    if (!track || items == null) return;        // ดึงไม่ได้ → คงของเดิม
    var sec = track.closest(".hl");
    if (!items.length) { if (sec) sec.style.display = "none"; return; }  // tenant ไม่มีแบนเนอร์ → ซ่อนทั้ง section
    if (sec) sec.style.display = "";
    track.innerHTML = items.map(function (b, i) {
      var n = "n" + ((i % 5) + 1);
      return '<a class="hl-slide ' + n + '" href="' + esc(b.url || "#") + '" aria-label="' + esc(b.label || "") + '">' +
        '<img src="' + mediaUrl(b.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"></a>';
    }).join("");
  }

  function newsCard(a, feature) {
    var img = mediaUrl(a.coverImage);
    var thumb = '<a class="news-thumb" href="#">' +
      (img ? '<img src="' + img + '" alt="" loading="lazy" onerror="this.remove()">' : '<span class="ph n3"><svg aria-hidden="true"><use href="#i-doc"/></svg></span>') +
      (a.categoryLabel ? '<span class="cat">' + esc(a.categoryLabel) + "</span>" : "") + "</a>";
    var meta = '<p class="news-meta"><span>' + icon("i-cal") + fmtDate(a.publishDate) + "</span>" +
      "<span>" + icon("i-eye") + fmtViews(a.views) + "</span></p>";
    var more = '<a class="news-more" href="#">' + (LANG === "en" ? "Read more " : "อ่านต่อ ") + icon("i-arrow") + "</a>";
    var excerpt = feature && a.excerpt ? '<p class="nc-excerpt">' + esc(a.excerpt) + "</p>" : "";
    return '<article class="news-card' + (feature ? " news-card--feature" : "") + '">' + thumb +
      '<div class="nc-body"><h3 class="nc-title"><a href="#">' + esc(a.title) + "</a></h3>" +
      meta + excerpt + more + "</div></article>";
  }

  function renderArticles(items) {
    if (items == null) return;                  // ดึงไม่ได้ → คงของเดิม
    var news = items.filter(function (a) { return a.kind === "news"; });
    var arts = items.filter(function (a) { return a.kind === "article"; });
    function fill(panelTab, list) {
      var box = document.querySelector('.news-panel[data-tab="' + panelTab + '"] .news-items');
      if (!box) return;
      var ordered = list.slice().sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });
      box.innerHTML = ordered.map(function (a, i) { return newsCard(a, i === 0); }).join("");
    }
    fill("news", news);
    fill("article", arts);
    // ซ่อนแท็บ "บทความ" ถ้า tenant นี้ไม่มีบทความ
    var atab = document.getElementById("nt-article");
    if (atab) atab.style.display = arts.length ? "" : "none";
  }

  function renderVideos(items) {
    var grid = document.querySelector(".channel .ch-grid");
    if (!grid || items == null) return;
    var sec = grid.closest(".channel");
    if (!items.length) { if (sec) sec.style.display = "none"; return; }
    if (sec) sec.style.display = "";
    grid.innerHTML = items.map(function (v) {
      var img = mediaUrl(v.thumbnail);
      return '<article class="ch-card"><a class="ch-thumb" href="' + esc(v.videoUrl || "#") + '">' +
        (img ? '<img src="' + img + '" alt="" loading="lazy" onerror="this.remove()">' : "") +
        '<span class="ch-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>' +
        '<span class="ch-dur">' + esc(v.duration || "") + "</span></a>" +
        '<div class="ch-body"><h3 class="nc-title"><a href="#">' + esc(v.title) + "</a></h3>" +
        '<p class="news-meta"><span>' + icon("i-cal") + fmtDate(v.date) + "</span>" +
        "<span>" + icon("i-eye") + fmtViews(v.views) + (LANG === "en" ? " views" : " ครั้ง") + "</span></p>" +
        '<a class="btn btn--ghost ch-more" href="#">' + (LANG === "en" ? "Details" : "อ่านรายละเอียด") + "</a></div></article>";
    }).join("");
  }

  function renderAwards(items) {
    var box = document.querySelector(".awards");
    if (!box || items == null) return;
    var sec = box.closest(".auditorium");
    if (!items.length) { if (sec) sec.style.display = "none"; return; }
    if (sec) sec.style.display = "";
    box.innerHTML = items.map(function (w) {
      var img = mediaUrl(w.image);
      return '<article class="award"><div class="award-stage"><span class="award-spot" aria-hidden="true"></span>' +
        '<img class="award-img" src="' + img + '" alt="' + esc(w.name) + '" loading="lazy" ' +
        "onerror=\"this.style.display='none'; this.nextElementSibling.style.display='grid';\">" +
        '<span class="award-ph" style="display:none" aria-hidden="true">' + icon("i-trophy") + "</span></div>" +
        '<div class="award-info"><b class="award-name">' + esc(w.name) + "</b>" +
        '<span class="award-cat">' + esc(w.categoryText || "") + "</span>" +
        '<span class="award-year">' + esc(w.year || "") + "</span></div></article>";
    }).join("");
  }

  function renderFaqs(items) {
    var list = document.querySelector(".faq .faq-list");
    if (!list || items == null) return;
    var sec = list.closest(".faq");
    if (!items.length) { if (sec) sec.style.display = "none"; return; }
    if (sec) sec.style.display = "";
    list.innerHTML = items.map(function (f, i) {
      var qid = "faq-q" + (i + 1), aid = "faq-a" + (i + 1);
      return '<div class="faq-item"><h3 class="faq-q">' +
        '<button type="button" class="faq-btn" aria-expanded="false" aria-controls="' + aid + '" id="' + qid + '">' +
        "<span>" + esc(f.question) + '</span><span class="faq-ic" aria-hidden="true"></span></button></h3>' +
        '<div class="faq-a" id="' + aid + '" role="region" aria-labelledby="' + qid + '"><div><p>' +
        esc(f.answer || "") + "</p></div></div></div>";
    }).join("");

    // อัปเดต FAQPage schema (AEO/GEO) จากเนื้อหา CMS จริง
    try {
      var ld = { "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: items.map(function (f) {
          return { "@type": "Question", name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer || "" } };
        }) };
      var tag = document.createElement("script");
      tag.type = "application/ld+json";
      tag.setAttribute("data-cms", "faq");
      tag.textContent = JSON.stringify(ld);
      document.head.appendChild(tag);
    } catch (e) {}
  }

  function renderFeatured(home) {
    var panel = document.querySelector(".featured .panel");
    if (!panel || !home || !home.featuredPromo) return;
    var p = home.featuredPromo;
    var items = (p.items || []).map(function (li) {
      return '<li><span class="ck" aria-hidden="true">' + icon("i-check") + "</span>" + esc(li) + "</li>";
    }).join("");
    panel.innerHTML =
      "<div><span class=\"eyebrow\" style=\"color:var(--c-primary);font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase\">" + esc(p.eyebrow || "") + "</span>" +
      '<h2 id="feat-h">' + esc(p.title) + "</h2><p>" + esc(p.description || "") + "</p>" +
      '<ul class="feat-list">' + items + "</ul>" +
      '<div class="demo-row" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px">' +
      '<a class="btn btn--primary" href="' + esc(p.primaryUrl || "#") + '">' + esc(p.primaryLabel || "") + " " + icon("i-arrow") + "</a>" +
      '<a class="btn btn--ghost" href="' + esc(p.secondaryUrl || "#") + '">' + esc(p.secondaryLabel || "") + "</a></div></div>" +
      '<div class="art"><img src="' + mediaUrl(p.image) + '" alt="' + esc(p.title) + '" loading="lazy" onerror="this.style.display=\'none\'"></div>';
  }

  /* ---------- boot ---------- */
  function loadHomeJs() {
    var s = document.createElement("script");
    s.src = "/assets/home.js";
    document.body.appendChild(s);
  }

  function boot() {
    var locale = "&locale=" + LANG;
    Promise.allSettled([
      get("home-pages?populate[hero][populate]=*&populate[featuredPromo][populate]=*&populate[stats]=true&pagination[pageSize]=1" + locale),
      get("services?sort=order:asc&pagination[pageSize]=100" + locale),
      get("banners?sort=order:asc&populate=image&filters[active][$eq]=true&pagination[pageSize]=100" + locale),
      get("articles?sort=publishDate:desc&populate=coverImage&pagination[pageSize]=100" + locale),
      get("videos?sort=date:desc&populate=thumbnail&pagination[pageSize]=100" + locale),
      get("awards?sort=order:asc&populate=image&pagination[pageSize]=100" + locale),
      get("faqs?sort=order:asc&pagination[pageSize]=100" + locale),
      get("jobs?sort=jobId:asc&pagination[pageSize]=100" + locale),
    ]).then(function (res) {
      var v = function (i) { return res[i].status === "fulfilled" ? res[i].value : null; };
      var ok = res.some(function (r) { return r.status === "fulfilled" && r.value; });
      try {
        var home = (v(0) && v(0)[0]) || null;   // home-pages เป็น collection (ต่อ tenant) → ใช้รายการแรก
        renderHero(home); renderStats(home); renderFeatured(home);
        renderServices(v(1)); renderBanners(v(2)); renderArticles(v(3));
        renderVideos(v(4)); renderAwards(v(5)); renderFaqs(v(6));
        buildSearchData(v(1), v(3), v(6), v(7)); // ช่องค้นหา hero + DGA Guide ใช้เนื้อหา CMS
        if (ok) { document.documentElement.setAttribute("data-cms", "live");
          console.info("%c[DGA] เนื้อหาโหลดจาก Strapi CMS แล้ว", "color:#0a7"); }
      } catch (e) {
        console.warn("[DGA] CMS render error — ใช้เนื้อหา static เดิม", e);
      }
    }).catch(function (e) {
      console.warn("[DGA] เรียก CMS ไม่สำเร็จ — ใช้เนื้อหา static เดิม", e);
    }).finally(function () {
      loadHomeJs();                         // โหลด home.js หลังเรนเดอร์เสมอ
      var ts = document.createElement("script"); ts.src = "/assets/tenant.js"; document.body.appendChild(ts); // footer/แบรนด์ต่อ tenant
      var cs = document.createElement("script"); cs.src = "/assets/consent.js"; document.body.appendChild(cs); // คุกกี้ PDPA + analytics
      var ms = document.createElement("script"); ms.src = "/assets/modules.js"; document.body.appendChild(ms); // popup + poll
      var lc = document.createElement("script"); lc.src = "/assets/livechat.js"; document.body.appendChild(lc); // live chat + social
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
