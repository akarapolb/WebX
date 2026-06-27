/* banner-cms.js — แถบประกาศหน้าแรก (แทน popup) แก้ได้จาก CMS (/api/site-banners)
   ดึง banner ที่เผยแพร่ + อยู่ในช่วงเวลา (startAt–endAt) + ตรงหน้า (targetPages)
   → คัดอันดับสูงสุดตามประเภท → เรนเดอร์ inline บนสุด (ดันเนื้อหาลง ไม่ overlay)
   โทนสีผูกกับประเภท · ปิด/ย่อได้ + จำใน localStorage · เคารพ a11y (WCAG 2.2 AA)
   ไว้อาลัย = ปิดถาวรไม่ได้ (ย่อได้เท่านั้น) ตามมารยาท */
(function () {
  "use strict";
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var LANG = document.documentElement.lang === "en" ? "en" : "th";
  var KEY = "dga_banner_v1";
  var pageKey = (location.pathname.replace(/^\//, "").replace(/^en\//, "").replace(/\.html$/, "").replace(/\/$/, "")) || "home";

  // ลำดับความสำคัญ + ธีม + พฤติกรรม ต่อประเภท
  var I = function (p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; };
  var TYPES = {
    mourning:     { rank: 5, dismissible: false, daily: false, icon: I('<path d="M12 3c1.5 3 4 4.5 4 8a4 4 0 0 1-8 0c0-3.5 2.5-5 4-8z"/>'), css: "bg:#17181c;fg:#e9e6dd;bd:#3a3526;ac:#c9a84a;top:#c9a84a" },
    royal:        { rank: 4, dismissible: true,  daily: false, icon: I('<path d="M3 8l4 4 5-7 5 7 4-4v9H3z"/>'), css: "bg:#fbf4e2;fg:#6b5410;bd:#e0cf95;ac:#9a7b1a" },
    urgent:       { rank: 3, dismissible: true,  daily: true,  icon: I('<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'), css: "bg:#fbe9e7;fg:#8e2820;bd:#e9b4ad;ac:#b3261e;left:#b3261e" },
    maintenance:  { rank: 2, dismissible: true,  daily: false, icon: I('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.3L3 18v3h3l6.4-6.3a4 4 0 0 0 5.3-5.4l-2.7 2.7-2.6-.7-.7-2.6z"/>'), css: "bg:#fdf4dd;fg:#6b4e16;bd:#e6cd8f;ac:#9a6b16;left:#b7791f" },
    announcement: { rank: 1, dismissible: true,  daily: true,  icon: I('<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a3 3 0 0 1 0 6"/>'), css: "bg:#eaf1fb;fg:#0f3a63;bd:#aecbeb;ac:#13497a;left:#13497a" },
  };
  function theme(t) { var o = {}; (TYPES[t] ? TYPES[t].css : TYPES.announcement.css).split(";").forEach(function (p) { var kv = p.split(":"); o[kv[0]] = kv[1]; }); return o; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---- การจำการปิด (localStorage; หมดอายุสิ้นวันตามเวลาไทย) ----
  function store() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } }
  function endOfToday() { var d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); }
  function isDismissed(id) { var s = store(); return s[id] && s[id] > Date.now(); }
  function dismiss(id) { var s = store(); s[id] = endOfToday(); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  function active(b) {
    var now = Date.now();
    if (b.startAt && new Date(b.startAt).getTime() > now) return false;   // ยังไม่ถึงเวลา (Scheduled)
    if (b.endAt && new Date(b.endAt).getTime() < now) return false;       // หมดเวลา (Expired)
    if (b.targetPages && b.targetPages.trim()) {
      var pages = b.targetPages.split(",").map(function (p) { return p.trim(); }).filter(Boolean);
      if (pages.length && pages.indexOf(pageKey) === -1 && pages.indexOf("all") === -1) return false;
    }
    return true;
  }

  function injectCss() {
    if (document.getElementById("banner-cms-css")) return;
    var st = document.createElement("style"); st.id = "banner-cms-css";
    st.textContent = [
      ".dga-banner{position:relative;width:100%;animation:dgaBnIn .4s cubic-bezier(.2,.7,.3,1) both}",
      ".dga-banner__wrap{display:flex;align-items:center;gap:14px;max-width:1200px;margin:0 auto;padding:13px 20px}",
      ".dga-banner__ic{width:40px;height:40px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex:none}.dga-banner__ic svg{width:22px;height:22px}",
      ".dga-banner__ic img{width:40px;height:40px;border-radius:9px;object-fit:cover}",
      ".dga-banner__tx{min-width:0;flex:1}",
      ".dga-banner__t{font-size:15px;font-weight:700;margin:0 0 2px;line-height:1.35}",
      ".dga-banner__d{font-size:12.5px;margin:0;line-height:1.45;opacity:.9;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
      ".dga-banner__ac{margin-left:auto;display:flex;align-items:center;gap:8px;flex:none}",
      ".dga-banner__cta{font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:8px;border:1.5px solid currentColor;color:inherit;text-decoration:none;white-space:nowrap;transition:.15s}.dga-banner__cta:hover{background:currentColor}",
      ".dga-banner__cta:hover span{color:#fff}",
      ".dga-banner__daily{font-size:11.5px;background:none;border:none;color:inherit;opacity:.7;cursor:pointer;text-decoration:underline;white-space:nowrap;padding:4px}",
      ".dga-banner__btn{width:32px;height:32px;border-radius:7px;background:none;border:none;color:inherit;opacity:.65;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex:none;transition:.15s}.dga-banner__btn:hover{opacity:1;background:rgba(127,127,127,.15)}",
      ".dga-banner__btn:focus-visible,.dga-banner__cta:focus-visible{outline:2px solid currentColor;outline-offset:2px}",
      ".dga-banner--collapsed .dga-banner__wrap{padding-top:8px;padding-bottom:8px}.dga-banner--collapsed .dga-banner__d,.dga-banner--collapsed .dga-banner__cta,.dga-banner--collapsed .dga-banner__daily{display:none}.dga-banner--collapsed .dga-banner__t{font-size:13px}",
      ".dga-banner__ic--img{background:none!important;width:auto;height:auto;border-radius:0}.dga-banner__ic--img img{width:46px;height:46px;border-radius:8px;object-fit:cover}",
      ".dga-banner--mourning.dga-banner--has-img .dga-banner__wrap{padding-top:14px;padding-bottom:14px}.dga-banner--mourning .dga-banner__ic--img img{width:56px;height:56px;border:1px solid #c9a84a}",
      ".dga-banner--collapsed .dga-banner__ic--img img{width:34px!important;height:34px!important}",
      ".dga-banner__wrap--img{position:relative;justify-content:center;padding:14px 20px}",
      ".dga-banner__full{display:block;max-width:100%;max-height:clamp(120px,30vh,280px);width:auto;height:auto;margin:0 auto;object-fit:contain}",
      ".dga-banner--imageonly .dga-banner__ac{position:absolute;top:10px;right:14px;margin:0}",
      ".dga-banner--imageonly .dga-banner__btn{background:rgba(0,0,0,.42);color:#fff}.dga-banner--imageonly .dga-banner__btn:hover{background:rgba(0,0,0,.62)}",
      ".dga-banner--imageonly.dga-banner--collapsed .dga-banner__full{max-height:46px}",
      "@keyframes dgaBnIn{from{opacity:0;transform:translateY(-100%)}to{opacity:1;transform:none}}",
      "@media(max-width:680px){.dga-banner__wrap{flex-wrap:wrap;padding:11px 14px;gap:10px}.dga-banner__ac{width:100%;margin-left:52px}.dga-banner__d{-webkit-line-clamp:3}}",
      "@media(prefers-reduced-motion:reduce){.dga-banner{animation:none}}",
      ".dga-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(10,10,14,.72);animation:dgaMdIn .28s ease both;transition:opacity .22s}",
      ".dga-modal__box{position:relative;max-width:min(600px,92vw);animation:dgaMdPop .32s cubic-bezier(.2,.8,.3,1.1) both}",
      ".dga-modal__img{display:block;max-width:100%;max-height:86vh;width:auto;height:auto;border-radius:10px;box-shadow:0 30px 80px -20px rgba(0,0,0,.7)}",
      ".dga-modal__box a{display:block}",
      ".dga-modal__x{position:absolute;top:-15px;right:-15px;width:38px;height:38px;border-radius:50%;border:0;background:#fff;color:#222;font-size:17px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}",
      ".dga-modal__x:hover{background:#efefef}.dga-modal__x:focus-visible{outline:3px solid #fff;outline-offset:2px}",
      "@keyframes dgaMdIn{from{opacity:0}to{opacity:1}}@keyframes dgaMdPop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}",
      "@media(max-width:680px){.dga-modal{padding:16px}.dga-modal__x{top:-12px;right:-12px;width:34px;height:34px}}",
      "@media(prefers-reduced-motion:reduce){.dga-modal,.dga-modal__box{animation:none}}",
    ].join("");
    document.head.appendChild(st);
  }

  function mediaUrl(m) { if (!m) return ""; var u = m.url || (m.data && m.data.attributes && m.data.attributes.url) || ""; return u && u.indexOf("http") !== 0 ? STRAPI + u : u; }

  function render(b) {
    injectCss();
    var t = theme(b.bannerType), conf = TYPES[b.bannerType] || TYPES.announcement;
    var img = mediaUrl(b.image);
    var imageOnly = img && !(b.body && String(b.body).trim());

    // ===== โหมดรูปอย่างเดียว → popup กลางจอ (modal) — โชว์รูปเต็ม สง่างาม =====
    if (imageOnly) {
      var ov = document.createElement("div");
      ov.className = "dga-modal dga-modal--" + b.bannerType;
      ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-modal", "true");
      ov.setAttribute("aria-label", b.title || (LANG === "en" ? "Announcement" : "ประกาศ"));
      var imgTag = '<img class="dga-modal__img" src="' + esc(img) + '" alt="' + esc(b.title || "") + '">';
      var inner = b.ctaUrl ? '<a href="' + esc(b.ctaUrl) + '" aria-label="' + esc(b.title || "") + '">' + imgTag + "</a>" : imgTag;
      ov.innerHTML = '<div class="dga-modal__box">' + inner +
        '<button type="button" class="dga-modal__x" data-act="close" aria-label="' + (LANG === "en" ? "Close" : "ปิด") + '">✕</button></div>';
      var prevOverflow = document.body.style.overflow;
      function closeModal() { dismiss(b.id); ov.style.opacity = "0"; document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onEsc); setTimeout(function () { ov.remove(); }, 220); }
      function onEsc(e) { if (e.key === "Escape") closeModal(); }
      ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest('[data-act="close"]')) closeModal(); });
      document.addEventListener("keydown", onEsc);
      document.body.style.overflow = "hidden";
      document.body.appendChild(ov);
      var x = ov.querySelector(".dga-modal__x"); if (x) try { x.focus(); } catch (e) {}
      return;
    }

    // ===== โหมดข้อความ → แถบบนสุด (banner strip, ดันเนื้อหาลง ไม่ overlay) =====
    var collapsedStart = b.bannerType === "mourning" && store()["c_" + b.id];
    var el = document.createElement("div");
    el.className = "dga-banner dga-banner--" + b.bannerType + (collapsedStart ? " dga-banner--collapsed" : "") + (img ? " dga-banner--has-img" : "");
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", LANG === "en" ? "Site announcement" : "ประกาศของหน่วยงาน");
    el.setAttribute("aria-live", b.bannerType === "urgent" ? "assertive" : "polite");
    el.style.cssText = "background:" + t.bg + ";color:" + t.fg + ";border-bottom:1px solid " + t.bd + (t.top ? ";box-shadow:inset 0 3px 0 " + t.top : "") + (t.left ? ";border-left:4px solid " + t.left : "");
    var icon = img ? '<img src="' + esc(img) + '" alt="' + esc(b.title) + '">' : (conf.icon);
    var cta = (b.ctaUrl && b.ctaLabel) ? '<a class="dga-banner__cta" href="' + esc(b.ctaUrl) + '"><span>' + esc(b.ctaLabel) + "</span></a>" : "";
    var daily = conf.daily ? '<button type="button" class="dga-banner__daily" data-act="daily">' + (LANG === "en" ? "Don’t show today" : "ไม่แสดงอีกวันนี้") + "</button>" : "";
    var closer = conf.dismissible
      ? '<button type="button" class="dga-banner__btn" data-act="close" aria-label="' + (LANG === "en" ? "Dismiss" : "ปิด") + '">✕</button>'
      : '<button type="button" class="dga-banner__btn" data-act="collapse" aria-label="' + (LANG === "en" ? "Collapse" : "ย่อ/ขยาย") + '">' + (collapsedStart ? "▼" : "▲") + "</button>";
    el.innerHTML =
      '<div class="dga-banner__wrap">' +
        '<span class="dga-banner__ic' + (img ? " dga-banner__ic--img" : "") + '"' + (img ? "" : ' style="background:rgba(127,127,127,.14);color:' + t.ac + '"') + ">" + icon + "</span>" +
        '<div class="dga-banner__tx"><p class="dga-banner__t">' + esc(b.title) + "</p>" +
          (b.body ? '<p class="dga-banner__d">' + esc(b.body) + "</p>" : "") + "</div>" +
        '<div class="dga-banner__ac">' + cta + daily + closer + "</div>" +
      "</div>";
    el.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]"); if (!btn) return;
      var act = btn.getAttribute("data-act");
      if (act === "close" || act === "daily") { dismiss(b.id); el.style.transition = "opacity .25s,transform .25s"; el.style.opacity = "0"; el.style.transform = "translateY(-100%)"; setTimeout(function () { el.remove(); }, 250); }
      else if (act === "collapse") { var c = el.classList.toggle("dga-banner--collapsed"); btn.textContent = c ? "▼" : "▲"; var s = store(); if (c) s["c_" + b.id] = 1; else delete s["c_" + b.id]; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (er) {} }
    });
    el.addEventListener("keydown", function (e) { if (e.key === "Escape") { var a = el.querySelector('[data-act="close"],[data-act="collapse"]'); if (a) a.click(); } });

    var header = document.querySelector("header.site-header, header, .site-header");
    if (header && header.parentNode) header.parentNode.insertBefore(el, header);
    else document.body.insertBefore(el, document.body.firstChild);
  }

  fetch(STRAPI + "/api/site-banners?populate=image&pagination[pageSize]=50", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var list = (j && j.data) || [];
      var pick = list.map(function (d) { return d.attributes ? Object.assign({ id: d.id }, d.attributes) : d; })
        .filter(function (b) { return b.title && active(b) && !isDismissed(b.id); })
        .sort(function (a, b) {
          var ra = (TYPES[a.bannerType] || {}).rank || 0, rb = (TYPES[b.bannerType] || {}).rank || 0;
          if (rb !== ra) return rb - ra;
          if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
          return (b.id || 0) - (a.id || 0);
        })[0];
      if (pick) render(pick);
    })
    .catch(function () {});
})();
