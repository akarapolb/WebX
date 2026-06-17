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
    ".mod-poll{border:1px solid var(--c-border,#e5e5e5);border-radius:16px;padding:22px;max-width:560px;margin:0 auto;background:var(--c-surface,#fff)}" +
    ".mod-poll h3{margin:0 0 4px;font-size:18px}.mod-poll .pl-sub{font-size:12.5px;color:var(--c-text-muted,#777);margin:0 0 16px}" +
    ".mod-poll__opt{display:block;width:100%;text-align:left;border:1px solid var(--c-border-strong,#cfcfcf);background:transparent;border-radius:10px;padding:12px 14px;margin-bottom:9px;font:inherit;font-size:14px;cursor:pointer;transition:.15s}" +
    ".mod-poll__opt:hover{border-color:var(--c-primary,#1a4fa0);background:var(--c-primary-50,#eef3fb)}" +
    ".mod-poll__res{position:relative;border:1px solid var(--c-border,#e5e5e5);border-radius:10px;padding:11px 14px;margin-bottom:9px;overflow:hidden}" +
    ".mod-poll__bar{position:absolute;inset:0 auto 0 0;background:var(--c-primary-50,#eef3fb);z-index:0}" +
    ".mod-poll__res b,.mod-poll__res span{position:relative;z-index:1}.mod-poll__res .pl-pct{float:right;font-weight:700;color:var(--c-primary,#1a4fa0)}" +
    ".mod-poll__tot{font-size:12px;color:var(--c-text-muted,#777);margin-top:6px}";
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

  /* ---------- POLL (เฉพาะหน้าแรก) ---------- */
  if (document.querySelector(".svc-grid")) {
    get("polls?filters[active][$eq]=true&pagination[pageSize]=1").then(function (rows) {
      var poll = rows && rows[0]; if (!poll || !Array.isArray(poll.options)) return;
      var sec = document.createElement("section"); sec.className = "block";
      sec.innerHTML = '<div class="wrap"><div class="block__head" style="justify-content:center;text-align:center"><div>' +
        '<span class="eyebrow">' + (LANG === "en" ? "Your voice" : "ความเห็นของคุณ") + '</span>' +
        '<h2>' + (LANG === "en" ? "Quick poll" : "โพลสำรวจความคิดเห็น") + "</h2></div></div>" +
        '<div class="mod-poll"></div></div>';
      var ftr = document.querySelector(".site-footer");
      if (ftr && ftr.parentNode) ftr.parentNode.insertBefore(sec, ftr); else document.body.appendChild(sec);
      renderPoll(sec.querySelector(".mod-poll"), poll);
    });
  }
  function pct(v, t) { return t > 0 ? Math.round((v / t) * 100) : 0; }
  function results(box, poll) {
    var t = poll.totalVotes || poll.options.reduce(function (s, o) { return s + (o.votes || 0); }, 0);
    box.innerHTML = "<h3>" + esc(poll.question) + '</h3><p class="pl-sub">' + (LANG === "en" ? "Results" : "ผลโหวต") + "</p>" +
      poll.options.map(function (o) {
        var p = pct(o.votes || 0, t);
        return '<div class="mod-poll__res"><span class="mod-poll__bar" style="width:' + p + '%"></span>' +
          "<b>" + esc(o.label) + '</b><span class="pl-pct">' + p + "%</span></div>";
      }).join("") + '<div class="mod-poll__tot">' + (LANG === "en" ? "Total votes: " : "โหวตทั้งหมด: ") + t + "</div>";
  }
  function renderPoll(box, poll) {
    var voted = false; try { voted = localStorage.getItem("dga-poll-" + poll.documentId) === "1"; } catch (e) {}
    if (voted) return results(box, poll);
    box.innerHTML = "<h3>" + esc(poll.question) + '</h3><p class="pl-sub">' + (LANG === "en" ? "Choose one" : "เลือก 1 ข้อ") + "</p>" +
      poll.options.map(function (o, i) { return '<button type="button" class="mod-poll__opt" data-i="' + i + '">' + esc(o.label) + "</button>"; }).join("");
    box.querySelectorAll(".mod-poll__opt").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = Number(b.getAttribute("data-i"));
        fetch(STRAPI + "/api/polls/" + poll.documentId + "/vote" + TQS1, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionIndex: i }) })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { try { localStorage.setItem("dga-poll-" + poll.documentId, "1"); } catch (e) {} results(box, j && j.data ? j.data : poll); })
          .catch(function () { results(box, poll); });
      });
    });
  }
})();
