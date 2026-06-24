/* hero-cms.js — ทำให้แบนเนอร์หัวหน้า (.cpl-hero) แก้ไขได้จาก CMS (/api/page-heroes)
   ดึงตาม pageKey (จาก URL) → อัปเดต eyebrow/title/description + เติมรูปด้านขวา
   ถ้า CMS ไม่มี hero ของหน้านั้น → คงเนื้อหา static เดิม (fallback) */
(function () {
  "use strict";
  var hero = document.querySelector(".cpl-hero");
  if (!hero) return;
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var LANG = document.documentElement.lang === "en" ? "en" : "th";
  var key = window.DGA_HERO_KEY || location.pathname.replace(/^\//, "").replace(/^en\//, "").replace(/\.html$/, "").replace(/\/$/, "") || "home";
  var mediaUrl = function (m) { if (!m) return ""; var u = m.url || (m.data && m.data.attributes && m.data.attributes.url) || ""; return u && u.indexOf("http") !== 0 ? STRAPI + u : u; };

  if (!document.getElementById("hero-cms-css")) {
    var st = document.createElement("style"); st.id = "hero-cms-css";
    st.textContent = `
    .cpl-hero .wrap{position:relative;z-index:2}
    .cpl-hero__img{position:absolute;top:0;right:0;height:100%;width:46%;object-fit:cover;z-index:1;opacity:.92;
      -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 58%);mask-image:linear-gradient(90deg,transparent 0,#000 58%);
      animation:heroImgIn .7s cubic-bezier(.2,.7,.3,1) both;pointer-events:none}
    @keyframes heroImgIn{from{opacity:0;transform:scale(1.06) translateX(14px)}to{opacity:.92;transform:none}}
    .cpl-hero__tx>*{animation:heroTxIn .5s ease both}
    .cpl-hero__tx>:nth-child(2){animation-delay:.06s}.cpl-hero__tx>:nth-child(3){animation-delay:.12s}
    @keyframes heroTxIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
    @media(max-width:820px){.cpl-hero__img{width:60%;opacity:.5;-webkit-mask-image:linear-gradient(90deg,transparent,#000 80%);mask-image:linear-gradient(90deg,transparent,#000 80%)}}
    @media(max-width:560px){.cpl-hero__img{display:none}}
    @media(prefers-reduced-motion:reduce){.cpl-hero__img,.cpl-hero__tx>*{animation:none}}`;
    document.head.appendChild(st);
  }

  fetch(STRAPI + "/api/page-heroes?filters[pageKey][$eq]=" + encodeURIComponent(key) + "&populate=*&locale=" + LANG, { headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var h = j && j.data && j.data[0];
      if (!h) return;                                  // ไม่มีใน CMS → ใช้ static เดิม
      var tx = hero.querySelector(".cpl-hero__tx") || hero;
      var eb = hero.querySelector(".cpl-eyebrow"), h1 = hero.querySelector("h1"), p = tx.querySelector("p");
      if (eb && h.eyebrow) { var ic = eb.querySelector("svg"); eb.textContent = ""; if (ic) eb.appendChild(ic); eb.appendChild(document.createTextNode(" " + h.eyebrow)); }
      if (h1 && h.title) h1.textContent = h.title;
      if (p && h.description) p.textContent = h.description;
      var img = mediaUrl(h.image);
      if (img && !hero.querySelector(".cpl-hero__img")) {
        var el = document.createElement("img"); el.className = "cpl-hero__img"; el.src = img; el.alt = ""; el.setAttribute("aria-hidden", "true"); el.setAttribute("loading", "eager");
        el.onerror = function () { el.remove(); };
        hero.appendChild(el);
      }
    })
    .catch(function () {});
})();
