/* ============================================================
   groupb.js — ตัวเรนเดอร์ Group B (gallery/video/download/faq/news)
   อ่าน body[data-gb-page] · เก็บสถิติเข้าชม/ดาวน์โหลดผ่าน /api/stat
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
  var page = document.body.getAttribute("data-gb-page");
  var root = document.getElementById("gb-root");
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
  function get(p) { return fetch(STRAPI + "/api/" + p + TQS, { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (j) { return (j && j.data) || []; }); }
  function stat(type, documentId) { try { fetch(STRAPI + "/api/stat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: type, documentId: documentId }) }); } catch (e) {} }
  function ytId(url) { var m = String(url || "").match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/); return m ? m[1] : ""; }
  function tenantCfg() { return fetch(STRAPI + "/api/tenants/resolve?_=1" + TQS, { headers: { Accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return (j && j.data) || {}; }).catch(function () { return {}; }); }

  // ---------- Photo Gallery ----------
  var WM = { enabled: false, text: "" };
  function renderGallery(items, cfg) {
    WM = (cfg && cfg.watermark) || WM;
    var wmAttr = WM.enabled && WM.text ? ' gb-wm" data-wm="' + esc(WM.text) : "";
    items.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    if (!items.length) { root.innerHTML = '<p class="gb-empty">ยังไม่มีอัลบั้มภาพ</p>'; return; }
    root.innerHTML = '<div class="gb-albums">' + items.map(function (g, i) {
      var cover = media(g.coverImage, "small") || media((g.images || [])[0], "small");
      return '<button class="gb-album" data-i="' + i + '">' +
        '<div class="gb-album__img' + wmAttr + '"' + (cover ? ' style="background-image:url(\'' + cover + "')\"" : "") + '><span class="gb-album__count">' + nf((g.images || []).length) + ' ภาพ</span></div>' +
        '<div class="gb-album__body"><h3>' + esc(g.title) + '</h3><span class="gb-stat">' + nf(g.views) + " เข้าชม</span></div></button>";
    }).join("") + "</div>" +
      '<div class="gb-lb" id="gb-lb"><button class="gb-lb__close" aria-label="ปิด">×</button><button class="gb-lb__play" id="gb-lb-play" aria-label="เล่นสไลด์อัตโนมัติ" title="เล่นอัตโนมัติ">▶</button><button class="gb-lb__nav gb-lb__nav--prev" aria-label="ก่อนหน้า">‹</button><img alt=""><button class="gb-lb__nav gb-lb__nav--next" aria-label="ถัดไป">›</button>' +
      (WM.enabled && WM.text ? '<div class="gb-lb__wm">' + esc(WM.text) + "</div>" : "") +
      '<div class="gb-lb__cap"></div></div>';

    var lb = document.getElementById("gb-lb"), imgs = [], idx = 0, cap = lb.querySelector(".gb-lb__cap"), im = lb.querySelector("img");
    var autoTimer = null, playBtn = document.getElementById("gb-lb-play");
    function show() { im.src = imgs[idx]; cap.textContent = (idx + 1) + " / " + imgs.length; }
    function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; if (playBtn) { playBtn.textContent = "▶"; playBtn.title = "เล่นอัตโนมัติ"; } } }
    if (playBtn) playBtn.onclick = function () {
      if (autoTimer) { stopAuto(); return; }
      autoTimer = setInterval(function () { idx = (idx + 1) % imgs.length; show(); }, 3500);
      playBtn.textContent = "⏸"; playBtn.title = "หยุดเล่นอัตโนมัติ";
    };
    root.querySelectorAll(".gb-album").forEach(function (b) {
      b.onclick = function () { var g = items[+b.getAttribute("data-i")]; imgs = (g.images || []).map(media).filter(Boolean); if (!imgs.length && g.coverImage) imgs = [media(g.coverImage)]; if (!imgs.length) return; idx = 0; show(); lb.classList.add("is-open"); stat("gallery", g.documentId); };
    });
    lb.querySelector(".gb-lb__close").onclick = function () { stopAuto(); lb.classList.remove("is-open"); im.src = ""; };
    lb.querySelector(".gb-lb__nav--prev").onclick = function () { idx = (idx - 1 + imgs.length) % imgs.length; show(); };
    lb.querySelector(".gb-lb__nav--next").onclick = function () { idx = (idx + 1) % imgs.length; show(); };
    lb.onclick = function (e) { if (e.target === lb) { stopAuto(); lb.classList.remove("is-open"); im.src = ""; } };
  }

  // ---------- Video Gallery ----------
  function renderVideo(items) {
    if (!items.length) { root.innerHTML = '<p class="gb-empty">ยังไม่มีวิดีโอ</p>'; return; }
    root.innerHTML = '<div class="gb-vids">' + items.map(function (v, i) {
      var th = media(v.thumbnail, "small");
      return '<button class="gb-vid" data-i="' + i + '">' +
        '<div class="gb-vid__thumb"' + (th ? ' style="background-image:url(\'' + th + "')\"" : "") + '><span class="gb-vid__play"></span>' + (v.duration ? '<span class="gb-vid__dur">' + esc(v.duration) + "</span>" : "") + "</div>" +
        '<div class="gb-vid__body"><h3>' + esc(v.title) + '</h3><span class="gb-stat">' + nf(v.views) + " ครั้ง</span></div></button>";
    }).join("") + "</div>" +
      '<div class="gb-modal" id="gb-modal"><div class="gb-modal__box"><div class="gb-modal__bar"><span class="gb-modal__title"></span><a class="gb-modal__dl" id="gb-modal-dl" target="_blank" rel="noopener" style="color:#fff;font-size:var(--fs-small);margin-left:auto;text-decoration:underline">↗</a><button class="gb-modal__close" aria-label="ปิด">×</button></div><div class="gb-modal__video"></div></div></div>';

    var mod = document.getElementById("gb-modal"), vbox = mod.querySelector(".gb-modal__video"), ttl = mod.querySelector(".gb-modal__title"), dl = document.getElementById("gb-modal-dl");
    function close() { mod.classList.remove("is-open"); vbox.innerHTML = ""; }
    root.querySelectorAll(".gb-vid").forEach(function (b) {
      b.onclick = function () {
        var v = items[+b.getAttribute("data-i")]; var id = ytId(v.videoUrl); var sub = media(v.subtitles); ttl.textContent = v.title;
        if (id) {
          // YouTube: เปิดคำบรรยายอัตโนมัติ (cc) — TOR 7.8
          vbox.innerHTML = '<iframe src="https://www.youtube.com/embed/' + id + '?autoplay=1&cc_load_policy=1&cc_lang_pref=th" allow="autoplay; fullscreen" allowfullscreen></iframe>';
        } else if (v.videoUrl && v.videoUrl !== "#") {
          // ไฟล์วิดีโอตรง: ใช้ <video> + <track> สำหรับไฟล์คำบรรยาย .vtt
          vbox.innerHTML = '<video controls autoplay style="width:100%;height:100%"><source src="' + esc(v.videoUrl) + '">' +
            (sub ? '<track kind="subtitles" srclang="th" label="ไทย" src="' + sub + '" default>' : "") + "</video>";
        } else { vbox.innerHTML = '<p style="color:#fff;padding:40px;text-align:center">ยังไม่มีลิงก์วิดีโอ</p>'; }
        // ดาวน์โหลด/เปิดต้นทาง (TOR 7.5): ไฟล์ตรง = ดาวน์โหลด, YouTube/TikTok = เปิดต้นทาง
        if (dl) {
          if (id) { dl.href = v.videoUrl; dl.textContent = "เปิดบน YouTube ↗"; dl.removeAttribute("download"); dl.style.display = ""; }
          else if (v.videoUrl && v.videoUrl !== "#") { dl.href = v.videoUrl; dl.textContent = "⬇ ดาวน์โหลดวิดีโอ"; dl.setAttribute("download", ""); dl.style.display = ""; }
          else { dl.style.display = "none"; }
        }
        mod.classList.add("is-open"); stat("video", v.documentId);
      };
    });
    mod.querySelector(".gb-modal__close").onclick = close;
    mod.onclick = function (e) { if (e.target === mod) close(); };
  }

  // ---------- Download ----------
  function renderDownload(items) {
    if (!items.length) { root.innerHTML = '<p class="gb-empty">ยังไม่มีไฟล์ดาวน์โหลด</p>'; return; }
    items.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var groups = {}; items.forEach(function (d) { (groups[d.category || "ทั่วไป"] = groups[d.category || "ทั่วไป"] || []).push(d); });
    root.innerHTML = Object.keys(groups).map(function (g) {
      return '<div class="gb-dlgroup"><h2>' + esc(g) + "</h2>" + groups[g].map(function (d) {
        var file = media(d.file);
        return '<div class="gb-dl"><span class="gb-dl__ic">' + esc((d.fileType || "DOC").slice(0, 4)) + "</span>" +
          '<div class="gb-dl__body"><b>' + esc(d.title) + "</b><span>" + esc(d.description || "") +
          (d.fileSize ? " · " + esc(d.fileSize) : "") + ' · <span class="gb-stat">' + nf(d.downloads) + ' ดาวน์โหลด</span></span></div>' +
          '<a class="btn ' + (file ? "btn--primary" : "btn--ghost") + '" data-doc="' + esc(d.documentId) + '" ' + (file ? 'href="' + file + '" target="_blank" rel="noopener"' : 'href="#" aria-disabled="true"') + ">" + (file ? "ดาวน์โหลด" : "เร็ว ๆ นี้") + "</a></div>";
      }).join("") + "</div>";
    }).join("");
    root.querySelectorAll("a[data-doc]").forEach(function (a) { a.addEventListener("click", function () { stat("download", a.getAttribute("data-doc")); }); });
  }

  // ---------- FAQ (+ FAQPage JSON-LD) ----------
  function renderFaq(items) {
    if (!items.length) { root.innerHTML = '<p class="gb-empty">ยังไม่มีคำถามที่พบบ่อย</p>'; return; }
    items.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    root.innerHTML =
      '<div class="gb-faqsearch"><input id="gb-fq" type="search" placeholder="ค้นหาคำถาม…" aria-label="ค้นหาคำถาม"></div>' +
      '<div class="gb-acc">' + items.map(function (f, i) {
        return '<div class="gb-acc__item" data-q="' + esc((f.question || "").toLowerCase()) + '" data-doc="' + esc(f.documentId) + '">' +
          '<button class="gb-acc__q">' + esc(f.question) + "</button>" +
          '<div class="gb-acc__a">' + esc(f.answer || "") + "</div></div>";
      }).join("") + "</div>";
    root.querySelectorAll(".gb-acc__item").forEach(function (it) {
      it.querySelector(".gb-acc__q").onclick = function () { var open = it.classList.toggle("is-open"); if (open) stat("faq", it.getAttribute("data-doc")); };
    });
    var fq = document.getElementById("gb-fq");
    fq.oninput = function () { var q = fq.value.toLowerCase(); root.querySelectorAll(".gb-acc__item").forEach(function (it) { it.style.display = it.getAttribute("data-q").indexOf(q) >= 0 ? "" : "none"; }); };
    // FAQPage schema (AEO)
    var ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map(function (f) { return { "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer || "" } }; }) };
    var s = document.createElement("script"); s.type = "application/ld+json"; s.textContent = JSON.stringify(ld); document.head.appendChild(s);
  }

  // ---------- News (+ แท็ก 4.2: แสดง/กรอง + ลิงก์ไปหน้ารายละเอียด) ----------
  function renderNews(items) {
    var now = Date.now();
    items = items.filter(function (a) { return (a.kind || "news") !== "blog"; })
      // 4.9 ช่วงเวลาแสดงผล: ซ่อนถ้ายังไม่ถึง displayStart หรือเลย displayEnd
      .filter(function (a) {
        if (a.displayStart && new Date(a.displayStart).getTime() > now) return false;
        if (a.displayEnd && new Date(a.displayEnd).getTime() < now) return false;
        return true;
      });
    if (!items.length) { root.innerHTML = '<p class="gb-empty">ยังไม่มีข่าว</p>'; return; }
    var tagFilter = new URLSearchParams(location.search).get("tag");
    function cards(list) {
      return '<div class="gb-news">' + list.map(function (a) {
        var img = media(a.coverImage, "medium");
        var tags = (a.tags || []).slice(0, 3).map(function (t) { return "<span>#" + esc(t) + "</span>"; }).join("");
        var href = a.slug ? 'article.html?slug=' + encodeURIComponent(a.slug) : "#";
        return '<a class="ga-post" href="' + href + '" style="text-decoration:none;color:inherit">' +
          (img ? '<div class="ga-post__img" style="background-image:url(\'' + img + "')\"></div>" : '<div class="ga-post__img"></div>') +
          '<div class="ga-post__body">' + (a.categoryLabel ? '<span class="ga-post__cat">' + esc(a.categoryLabel) + "</span>" : "") +
          "<h3>" + esc(a.title) + "</h3><p>" + esc(a.excerpt || "") + "</p>" +
          (tags ? '<div class="gb-cardtags">' + tags + "</div>" : "") +
          '<div class="ga-post__meta"><span>' + esc(a.publishDate || "") + "</span><span>" + nf(a.views) + " อ่าน</span></div></div></a>";
      }).join("") + "</div>";
    }
    if (tagFilter) {
      var matched = items.filter(function (a) { return (a.tags || []).indexOf(tagFilter) >= 0; });
      root.innerHTML = '<p class="gb-stat" style="text-align:center;margin-bottom:18px">กรองด้วยแท็ก <b style="color:var(--c-primary)">#' + esc(tagFilter) + '</b> · พบ ' + matched.length + ' รายการ · <a href="news.html">ดูทั้งหมด</a></p>' + cards(matched);
      return;
    }
    var cats = ["ทั้งหมด"]; items.forEach(function (a) { if (a.categoryLabel && cats.indexOf(a.categoryLabel) < 0) cats.push(a.categoryLabel); });
    root.innerHTML = '<div class="gb-filter">' + cats.map(function (c, i) { return '<button data-c="' + esc(c) + '" aria-pressed="' + (i === 0) + '">' + esc(c) + "</button>"; }).join("") + '</div><div id="gb-newslist">' + cards(items) + "</div>";
    root.querySelectorAll(".gb-filter button").forEach(function (b) {
      b.onclick = function () { root.querySelectorAll(".gb-filter button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); }); b.setAttribute("aria-pressed", "true"); var c = b.getAttribute("data-c"); document.getElementById("gb-newslist").innerHTML = cards(c === "ทั้งหมด" ? items : items.filter(function (a) { return a.categoryLabel === c; })); };
    });
  }

  // ---------- dispatch ----------
  root.innerHTML = '<p class="gb-empty">กำลังโหลด…</p>';
  var fail = function () { root.innerHTML = '<p class="gb-empty">โหลดข้อมูลไม่สำเร็จ</p>'; };
  if (page === "gallery") Promise.all([get("galleries?populate=*&pagination[pageSize]=100"), tenantCfg()]).then(function (r) { renderGallery(r[0], r[1]); }).catch(fail);
  else if (page === "video") get("videos?populate=*&pagination[pageSize]=100").then(renderVideo).catch(fail);
  else if (page === "download") get("downloads?populate=*&pagination[pageSize]=100").then(renderDownload).catch(fail);
  else if (page === "faq") get("faqs?pagination[pageSize]=200").then(renderFaq).catch(fail);
  else if (page === "news") get("articles?populate=*&pagination[pageSize]=100").then(renderNews).catch(fail);
})();
