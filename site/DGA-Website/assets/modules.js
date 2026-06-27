/* ============================================================================
   modules.js — โมดูลเนื้อหา (#3) ฝั่งหน้าเว็บ: Popup (ประกาศ) + Poll (โหวต)
   ดึงจาก CMS ตาม tenant ปัจจุบัน · Popup เด้งครั้งเดียว (จำใน localStorage)
   Poll: โหวตได้ครั้งเดียว/เครื่อง แล้วแสดงผลเป็นแถบเปอร์เซ็นต์
   ============================================================================ */
(function () {
  "use strict";
  if (window.__dgaModulesInit) return;
  window.__dgaModulesInit = true;

  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var TQS = window.DGA_TENANT ? "&tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var TQS1 = window.DGA_TENANT ? "?tenant=" + encodeURIComponent(window.DGA_TENANT) : "";
  var LANG = document.documentElement.lang === "en" ? "en" : "th";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  var css =
    ".mod-ov{position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,.5);display:grid;place-items:center;padding:16px}" +
    ".mod-pop{width:min(440px,94vw);background:var(--c-surface,#fff);color:var(--c-text,#1a1a1a);border-radius:18px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.35);position:relative}" +
    ".mod-pop__x{position:absolute;top:10px;right:10px;width:34px;height:34px;border:0;border-radius:50%;background:rgba(0,0,0,.35);color:#fff;font-size:18px;cursor:pointer;z-index:2}" +
    ".mod-pop__img{width:100%;height:160px;object-fit:cover;display:block;background:var(--c-primary,#1a4fa0)}" +
    ".mod-pop__b{padding:22px}" +
    ".mod-pop__b h3{margin:0 0 8px;font-size:18px}.mod-pop__b p{margin:0 0 16px;font-size:14px;line-height:1.6;color:var(--c-text-muted,#555)}" +
    ".mod-pop__cta{display:inline-block;background:var(--c-primary,#1a4fa0);color:#fff;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px}" +
    ".mod-engage{background:var(--c-sunken,#f6f7f9)}" +
    ".mod-engage__grid{display:grid;grid-template-columns:1.15fr .85fr;gap:22px;align-items:stretch;margin:6px auto 0;max-width:980px}" +
    "@media(max-width:860px){.mod-engage__grid{grid-template-columns:1fr;max-width:560px}}" +
    ".mod-poll{border:1px solid var(--c-border,#e5e5e5);border-radius:18px;padding:24px;background:var(--c-surface,#fff);box-shadow:0 8px 30px -16px rgba(20,18,16,.16)}" +
    ".mod-poll h3{margin:0 0 4px;font-size:18px;color:var(--c-text,#1a1a1a)}.mod-poll .pl-sub{font-size:12.5px;color:var(--c-text-muted,#777);margin:0 0 16px}" +
    ".mod-poll__opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
    "@media(max-width:520px){.mod-poll__opts{grid-template-columns:1fr}}" +
    ".mod-poll__opt{text-align:left;border:1.5px solid var(--c-border-strong,#d8d8d8);background:var(--c-surface,#fff);border-radius:12px;padding:13px 15px;font:inherit;font-size:14px;font-weight:600;color:var(--c-text,#1a1a1a);cursor:pointer;transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease}" +
    ".mod-poll__opt:hover{transform:translateY(-2px);border-color:var(--c-primary,#1a4fa0);background:var(--c-primary-50,#eef3fb);box-shadow:0 8px 18px -10px var(--c-primary,#1a4fa0)}" +
    ".mod-poll__opt:active{transform:scale(.97)}" +
    ".mod-poll__opt.sel{border-color:var(--c-primary,#1a4fa0);background:var(--c-primary-50,#eef3fb);animation:plPulse .4s ease}" +
    "@keyframes plPulse{0%{transform:scale(1)}45%{transform:scale(1.05)}100%{transform:scale(1)}}" +
    ".mod-poll__res{position:relative;border:1px solid var(--c-border,#e5e5e5);border-radius:12px;padding:12px 15px;margin-bottom:9px;overflow:hidden;display:flex;align-items:center;justify-content:space-between;gap:10px}" +
    ".mod-poll__res--top{border-color:var(--c-primary,#1a4fa0)}" +
    ".mod-poll__bar{position:absolute;inset:0 auto 0 0;width:0;background:var(--c-primary-50,#eef3fb);z-index:0;transition:width 1.1s cubic-bezier(.2,.8,.2,1)}" +
    ".mod-poll__res--top .mod-poll__bar{background:var(--c-primary,#1a4fa0);opacity:.16}" +
    ".mod-poll__res b,.mod-poll__res .pl-pct{position:relative;z-index:1}.mod-poll__res .pl-pct{font-weight:800;color:var(--c-primary,#1a4fa0)}" +
    ".mod-poll__tot{font-size:12px;color:var(--c-text-muted,#777);margin-top:10px}" +
    ".mod-engage__cta{position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:center;border-radius:18px;padding:32px 30px;color:#fff;background:linear-gradient(140deg,var(--c-primary,#1a4fa0),var(--c-primary-700,#123a7a));box-shadow:0 14px 38px -16px var(--c-primary,#1a4fa0)}" +
    ".mod-engage__cta .cta-wm{position:absolute;right:-16px;bottom:-30px;width:158px;height:158px;opacity:.13;pointer-events:none}.mod-engage__cta .cta-wm svg{width:100%;height:100%;stroke:#fff;fill:none;stroke-width:1.4}" +
    ".mod-engage__cta .cta-body{position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-start}" +
    ".mod-engage__cta .cta-ic{width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;margin-bottom:16px}.mod-engage__cta .cta-ic svg{width:28px;height:28px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
    ".mod-engage__cta h3{margin:0 0 10px;font-size:21px;font-weight:800;color:#fff;line-height:1.35}.mod-engage__cta p{margin:0 0 22px;font-size:14.5px;color:rgba(255,255,255,.96);line-height:1.65;max-width:30ch}" +
    ".mod-engage__cta .cta-btn{align-self:flex-start;background:#fff;color:var(--c-primary,#1a4fa0);font-weight:700;font-size:14.5px;padding:12px 22px;border-radius:12px;text-decoration:none;transition:transform .15s ease,box-shadow .15s ease}.mod-engage__cta .cta-btn:hover{transform:translateY(-2px);box-shadow:0 10px 22px -6px rgba(0,0,0,.35)}" +
    ".mod-reveal{opacity:0;transform:translateY(22px)}.mod-reveal.in{opacity:1;transform:none;transition:opacity .6s ease,transform .7s cubic-bezier(.2,.8,.2,1)}" +
    "@media(prefers-reduced-motion:reduce){.mod-reveal,.mod-poll__opt,.mod-poll__bar,.mod-engage__cta .cta-btn{transition:none!important;animation:none!important}.mod-reveal{opacity:1;transform:none}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function get(path) {
    return fetch(STRAPI + "/api/" + path + TQS, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : { data: [] }; }).then(function (j) { return j.data || []; }).catch(function () { return []; });
  }

  /* ---------- POPUP ---------- */
  get("popups?filters[active][$eq]=true&sort=priority:desc&pagination[pageSize]=1").then(function (rows) {
    var p = rows && rows[0]; if (!p) return;
    try { if (localStorage.getItem("dga-popup-" + p.documentId) === "1") return; } catch (e) {}
    var img = p.image && p.image.url ? (p.image.url.indexOf("http") === 0 ? p.image.url : STRAPI + p.image.url) : "";
    var ov = document.createElement("div"); ov.className = "mod-ov";
    ov.innerHTML = '<div class="mod-pop" role="dialog" aria-label="' + esc(p.title) + '">' +
      '<button class="mod-pop__x" aria-label="ปิด">&times;</button>' +
      (img ? '<img class="mod-pop__img" src="' + img + '" alt="">' : '<div class="mod-pop__img"></div>') +
      '<div class="mod-pop__b"><h3>' + esc(p.title) + "</h3><p>" + esc(p.body || "") + "</p>" +
      (p.linkLabel ? '<a class="mod-pop__cta" href="' + esc(p.linkUrl || "#") + '">' + esc(p.linkLabel) + "</a>" : "") +
      "</div></div>";
    function close() { ov.remove(); try { localStorage.setItem("dga-popup-" + p.documentId, "1"); } catch (e) {} }
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest(".mod-pop__x")) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && ov.parentNode) close(); });
    setTimeout(function () { document.body.appendChild(ov); }, 1200);
  });

  /* ---------- POLL (เฉพาะหน้าแรก) — แถบมีส่วนร่วม 2 คอลัมน์ + อนิเมชัน ---------- */
  if (document.querySelector(".svc-grid")) {
    get("polls?filters[active][$eq]=true&pagination[pageSize]=1").then(function (rows) {
      var poll = rows && rows[0]; if (!poll || !Array.isArray(poll.options)) return;
      var CHAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 1 1 18 0z"/><path d="M8 11h8M8 14h5"/></svg>';
      var sec = document.createElement("section"); sec.className = "block mod-engage mod-reveal";
      sec.innerHTML = '<div class="wrap"><div class="block__head" style="justify-content:center;text-align:center"><div>' +
        '<span class="eyebrow">' + (LANG === "en" ? "Your voice" : "ความเห็นของคุณ") + '</span>' +
        '<h2>' + (LANG === "en" ? "Quick poll" : "ร่วมแสดงความเห็น") + "</h2></div></div>" +
        '<div class="mod-engage__grid">' +
          '<div class="mod-poll"></div>' +
          '<aside class="mod-engage__cta">' +
            '<span class="cta-wm" aria-hidden="true">' + CHAT + "</span>" +
            '<div class="cta-body">' +
              '<span class="cta-ic">' + CHAT + "</span>" +
              "<h3>" + (LANG === "en" ? "Your voice shapes better services" : "เสียงของคุณช่วยพัฒนาบริการดิจิทัล") + "</h3>" +
              "<p>" + (LANG === "en" ? "Every response helps us improve public services for everyone." : "ทุกความคิดเห็นถูกนำไปปรับปรุงบริการให้ดีขึ้น เพื่อประชาชนทุกคน") + "</p>" +
              '<a class="cta-btn" href="/contact.html">' + (LANG === "en" ? "Share more feedback →" : "ส่งความคิดเห็นเพิ่มเติม →") + "</a>" +
            "</div>" +
          "</aside>" +
        "</div></div>";
      var ftr = document.querySelector(".site-footer");
      if (ftr && ftr.parentNode) ftr.parentNode.insertBefore(sec, ftr); else document.body.appendChild(sec);
      renderPoll(sec.querySelector(".mod-poll"), poll);
      reveal(sec);
    });
  }
  function reveal(el) {
    if (!("IntersectionObserver" in window)) { el.classList.add("in"); return; }
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: 0.15 });
    io.observe(el);
  }
  function pct(v, t) { return t > 0 ? Math.round((v / t) * 100) : 0; }
  function results(box, poll) {
    var t = poll.totalVotes || poll.options.reduce(function (s, o) { return s + (o.votes || 0); }, 0);
    var maxV = poll.options.reduce(function (m, o) { return Math.max(m, o.votes || 0); }, 0);
    box.innerHTML = "<h3>" + esc(poll.question) + '</h3><p class="pl-sub">' + (LANG === "en" ? "Results · thanks for voting" : "ผลโหวต · ขอบคุณที่ร่วมแสดงความเห็น") + "</p>" +
      poll.options.map(function (o) {
        var p = pct(o.votes || 0, t), top = (o.votes || 0) === maxV && maxV > 0;
        return '<div class="mod-poll__res' + (top ? " mod-poll__res--top" : "") + '"><span class="mod-poll__bar" data-w="' + p + '"></span>' +
          "<b>" + esc(o.label) + '</b><span class="pl-pct" data-p="' + p + '">0%</span></div>';
      }).join("") + '<div class="mod-poll__tot">' + (LANG === "en" ? "Total votes: " : "โหวตทั้งหมด: ") + "<b>" + t + "</b></div>";
    requestAnimationFrame(function () {
      box.querySelectorAll(".mod-poll__bar").forEach(function (bar) { bar.style.width = bar.getAttribute("data-w") + "%"; });
      box.querySelectorAll(".pl-pct").forEach(function (el) {
        var target = Number(el.getAttribute("data-p")), cur = 0, step = Math.max(1, Math.round(target / 18));
        var iv = setInterval(function () { cur += step; if (cur >= target) { cur = target; clearInterval(iv); } el.textContent = cur + "%"; }, 32);
      });
    });
  }
  function renderPoll(box, poll) {
    var voted = false; try { voted = localStorage.getItem("dga-poll-" + poll.documentId) === "1"; } catch (e) {}
    if (voted) return results(box, poll);
    box.innerHTML = "<h3>" + esc(poll.question) + '</h3><p class="pl-sub">' + (LANG === "en" ? "Choose one" : "เลือก 1 ข้อ") + "</p>" +
      '<div class="mod-poll__opts">' +
      poll.options.map(function (o, i) { return '<button type="button" class="mod-poll__opt" data-i="' + i + '">' + esc(o.label) + "</button>"; }).join("") +
      "</div>";
    box.querySelectorAll(".mod-poll__opt").forEach(function (b) {
      b.addEventListener("click", function () {
        if (box.__voting) return; box.__voting = true;
        b.classList.add("sel");
        var i = Number(b.getAttribute("data-i"));
        fetch(STRAPI + "/api/polls/" + poll.documentId + "/vote" + TQS1, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionIndex: i }) })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { try { localStorage.setItem("dga-poll-" + poll.documentId, "1"); } catch (e) {} setTimeout(function () { results(box, j && j.data ? j.data : poll); }, 280); })
          .catch(function () { setTimeout(function () { results(box, poll); }, 280); });
      });
    });
  }
})();
