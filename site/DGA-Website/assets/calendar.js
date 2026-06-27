/* ============================================================
   calendar.js — ปฏิทินกิจกรรม (Time-grid + sidebar ซ้าย) · Strapi
   sidebar: mini calendar + ตัวกรองหมวด + กิจกรรมที่จะถึง
   main: สัปดาห์ (time-grid) / เดือน / วัน + popover การ์ด
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
  var root = document.getElementById("ga-root");
  if (!root) return;

  var DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."], DOW1 = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  var MON = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  var MONS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ymd(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function hhmm(d) { return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function sameDay(a, b) { return ymd(a) === ymd(b); }
  function thDate(d) { return d.getDate() + " " + MON[d.getMonth()] + " " + (d.getFullYear() + 543); }
  function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>"; }
  var I_PIN = '<path d="M12 21s-7-6.6-7-11a7 7 0 1 1 14 0c0 4.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    I_CLOCK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', I_CAL = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
    I_ARROW = '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', I_FILTER = '<path d="M3 5h18M6 12h12M10 19h4"/>';

  var events = [], view = "week", cursor = new Date(), today = new Date(), H0 = 8, H1 = 18, HH = 52, hiddenCats = {};
  function catOf(e) { return e.category || "อื่นๆ"; }
  function visible(e) { return !hiddenCats[catOf(e)]; }
  function evDate(e) { return new Date(e.start); }
  function evEnd(e) { return e.end ? new Date(e.end) : new Date(evDate(e).getTime() + 3600000); }
  function eventsOn(d, timed) { return events.filter(function (e) { return visible(e) && sameDay(evDate(e), d) && (timed == null || !!e.allDay !== timed); }).sort(function (a, b) { return evDate(a) - evDate(b); }); }
  var COLORS = { event: "blue", talk: "purple", std: "green", seminar: "orange", workshop: "purple" };
  function evColor(e) { return e.color || COLORS[e.categoryKey] || COLORS[e.category] || "blue"; }
  var HEX = { blue: "#13497a", green: "#1e7b34", orange: "#d97706", amber: "#d97706", purple: "#7e22ce", red: "#b3261e", teal: "#0f766e" };
  function weekStart(d) { var s = new Date(d); s.setDate(d.getDate() - d.getDay()); s.setHours(0, 0, 0, 0); return s; }

  if (!document.getElementById("cal2-css")) {
    var st = document.createElement("style"); st.id = "cal2-css";
    st.textContent = `
    .cal2{background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius-lg);overflow:hidden;box-shadow:0 8px 30px -12px rgba(20,18,16,.16),0 2px 6px -3px rgba(20,18,16,.07)}
    .cal2-bar{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid var(--c-border);background:var(--c-surface)}
    .cal2-nav{display:flex;align-items:center;gap:8px}
    .cal2-title{font-size:var(--fs-h3);margin:0;min-width:140px;color:var(--c-text)}
    .cal2-arrow{width:36px;height:36px;border-radius:10px;border:1px solid var(--c-border);background:var(--c-surface);color:var(--c-text);cursor:pointer;font-size:19px;line-height:1;display:flex;align-items:center;justify-content:center;transition:.15s}
    .cal2-arrow:hover{background:var(--c-primary);color:#fff;border-color:var(--c-primary)}
    .cal2-today{height:36px;padding:0 15px;border-radius:10px;border:1px solid var(--c-primary);background:transparent;color:var(--c-primary);font:inherit;font-weight:600;cursor:pointer;margin-left:4px;transition:.15s}
    .cal2-today:hover{background:var(--c-primary);color:#fff}
    .cal2-views{display:inline-flex;background:var(--c-sunken);border:1px solid var(--c-border);border-radius:11px;padding:3px}
    .cal2-views button{height:34px;padding:0 16px;border:0;border-radius:8px;background:transparent;color:var(--c-text-muted);font:inherit;font-weight:600;cursor:pointer;transition:.15s}
    .cal2-views button[aria-pressed="true"]{background:var(--c-surface);color:var(--c-primary);box-shadow:var(--shadow-1)}
    .cal2-layout{display:grid;grid-template-columns:256px minmax(0,1fr)}
    .cal2-side{border-right:1px solid var(--c-border);background:var(--c-sunken);padding:18px 16px;min-width:0;display:flex;flex-direction:column;gap:20px}
    .cal2-main{padding:16px;animation:cal2Fade .35s ease both;min-width:0}
    /* ---- mini calendar ---- */
    .mc-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}
    .mc-bar b{font-size:13.5px;color:var(--c-text);font-weight:600}
    .mc-nav{width:27px;height:27px;border:0;background:transparent;color:var(--c-text-muted);border-radius:7px;cursor:pointer;font-size:16px;line-height:1;transition:.15s}
    .mc-nav:hover{background:var(--c-primary);color:#fff}
    .mc-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
    .mc-dow{text-align:center;font-size:10px;color:var(--c-text-muted);padding:2px 0 5px;font-weight:600}
    .mc-d{position:relative;aspect-ratio:1;border:0;background:transparent;color:var(--c-text);font-size:11.5px;border-radius:50%;cursor:pointer;transition:.12s;display:flex;align-items:center;justify-content:center;font-family:inherit}
    .mc-d:hover{background:var(--c-border)}
    .mc-d--out{color:var(--c-text-muted);opacity:.4}
    .mc-d--today{font-weight:700;color:var(--c-primary)}
    .mc-d--sel{background:var(--c-primary);color:#fff!important;font-weight:600}
    .mc-d i{position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--c-primary)}
    .mc-d--sel i{background:#fff}
    /* ---- filters ---- */
    .cf h3,.cal2-up-wrap h3{font-size:13px;margin:0 0 11px;color:var(--c-text);display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:.01em}
    .cf h3 svg,.cal2-up-wrap h3 svg{width:16px;height:16px;color:var(--c-primary)}
    .cf-row{display:flex;align-items:center;gap:9px;padding:5px 0;font-size:13px;color:var(--c-text);cursor:pointer;user-select:none}
    .cf-row input{width:16px;height:16px;accent-color:var(--c-primary);cursor:pointer;flex:0 0 16px}
    .cf-dot{width:10px;height:10px;border-radius:50%;flex:0 0 10px}
    .cf-row.off{opacity:.5}
    /* ---- upcoming ---- */
    .cal2-up{display:flex;gap:11px;background:var(--c-surface);border:1px solid var(--c-border);border-radius:12px;padding:10px;margin-bottom:9px;cursor:pointer;transition:.15s;animation:cal2Fade .4s ease both}
    .cal2-up:hover{transform:translateY(-2px);box-shadow:var(--shadow-2);border-color:var(--c-primary)}
    .cal2-up__d{flex:0 0 42px;text-align:center;border-radius:9px;padding:5px 0;color:#fff;line-height:1.1}.cal2-up__d b{font-size:17px;display:block}.cal2-up__d span{font-size:10.5px;opacity:.92}
    .cal2-up__b{min-width:0}.cal2-up__b h4{font-size:13px;margin:0 0 2px;color:var(--c-text);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cal2-up__b p{font-size:11.5px;color:var(--c-text-muted);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cal2-up-wrap .ga-empty{color:var(--c-text-muted);font-size:12.5px;padding:6px 0}
    /* ---- เดือน ---- */
    .cal2-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--c-border);border:1px solid var(--c-border);border-radius:14px;overflow:hidden}
    .cal2-dow{text-align:center;font-weight:700;color:var(--c-text-muted);font-size:11.5px;letter-spacing:.04em;padding:12px 0;background:var(--c-sunken)}
    .cal2-cell{min-height:80px;background:var(--c-surface);padding:7px 8px 8px;display:flex;flex-direction:column;gap:4px;transition:background .15s}
    .cal2-cell:hover{background:var(--c-primary-50)}
    .cal2-cell--out{background:#f7f6f3}.cal2-cell--out .cal2-daynum{color:var(--c-text-muted);opacity:.5;font-weight:500}
    .cal2-cell--today{background:var(--c-primary-50)}
    .cal2-daynum{font-size:13px;font-weight:600;color:var(--c-text);width:25px;height:25px;display:flex;align-items:center;justify-content:center;align-self:flex-start;border-radius:50%}
    .cal2-cell--today .cal2-daynum{background:var(--c-primary);color:#fff}
    .cal2-ev{display:block;width:100%;min-width:0;box-sizing:border-box;font-size:11px;line-height:1.3;padding:3px 9px;border-radius:7px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;transition:filter .12s}
    .cal2-ev:hover{filter:brightness(.94)}
    .cal2-ev--blue{background:#e7eef8;color:#13497a}.cal2-ev--green{background:#e5f4e8;color:#1e7b34}.cal2-ev--orange,.cal2-ev--amber{background:#fbefd6;color:#8a5a00}.cal2-ev--purple{background:#efe7fb;color:#6b21a8}.cal2-ev--red{background:#fbe3e1;color:#b3261e}.cal2-ev--teal{background:#dcf5f1;color:#0f766e}
    /* ---- สัปดาห์/วัน (time-grid) ---- */
    .cw{border:1px solid var(--c-border);border-radius:14px;overflow:hidden}
    .cw-head{display:grid;border-bottom:1px solid var(--c-border);background:var(--c-sunken)}
    .cw-gmt{font-size:10.5px;color:var(--c-text-muted);display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px}
    .cw-dh{text-align:center;padding:9px 0 8px;border-left:1px solid var(--c-border)}
    .cw-dh span{font-size:11.5px;color:var(--c-text-muted);display:block;font-weight:600}
    .cw-dh b{font-size:18px;color:var(--c-text);font-weight:600;display:inline-flex;min-width:34px;height:34px;padding:0 6px;align-items:center;justify-content:center;border-radius:18px;margin-top:3px}
    .cw-dh--today b{background:var(--c-primary);color:#fff}
    .cw-allday{display:grid;border-bottom:1px solid var(--c-border);min-height:30px}
    .cw-adlb{font-size:10px;color:var(--c-text-muted);display:flex;align-items:center;justify-content:center}
    .cw-adcol{border-left:1px solid var(--c-border);padding:4px;display:flex;flex-direction:column;gap:3px;min-width:0}
    .cw-body{display:grid;max-height:560px;overflow-y:auto}
    .cw-times{display:flex;flex-direction:column}
    .cw-time{height:${HH}px;font-size:10.5px;color:var(--c-text-muted);text-align:right;padding-right:8px;transform:translateY(-7px)}
    .cw-col{position:relative;border-left:1px solid var(--c-border);background-image:repeating-linear-gradient(var(--c-border) 0 1px,transparent 1px ${HH}px)}
    .cw-col--today{background-color:var(--c-primary-50)}
    .cw-ev{position:absolute;left:3px;right:3px;border-radius:9px;padding:5px 8px;overflow:hidden;cursor:pointer;border-left:3px solid;box-shadow:0 2px 6px -2px rgba(20,18,16,.18);transition:filter .15s,transform .15s;min-height:24px}
    .cw-ev:hover{filter:brightness(.98);transform:scale(1.015);z-index:6}
    .cw-ev b{font-weight:700;font-size:12px;display:block;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cw-ev span{font-size:10.5px;opacity:.9;display:block;margin-top:1px}
    .cw-ad{font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;border-left:3px solid;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cw-ev--blue,.cw-ad--blue{background:#e7eef8;color:#13497a;border-color:#13497a}.cw-ev--green,.cw-ad--green{background:#e5f4e8;color:#1e7b34;border-color:#1e7b34}.cw-ev--orange,.cw-ev--amber,.cw-ad--orange,.cw-ad--amber{background:#fbefd6;color:#8a5a00;border-color:#d97706}.cw-ev--purple,.cw-ad--purple{background:#efe7fb;color:#6b21a8;border-color:#7e22ce}.cw-ev--red,.cw-ad--red{background:#fbe3e1;color:#b3261e;border-color:#b3261e}.cw-ev--teal,.cw-ad--teal{background:#dcf5f1;color:#0f766e;border-color:#0f766e}
    /* ---- popover ---- */
    .cal2-pop{position:fixed;z-index:1200;width:332px;max-width:calc(100vw - 24px);border-radius:18px;padding:2px;background:linear-gradient(135deg,#ec4899,#8b5cf6 45%,#06b6d4);box-shadow:0 26px 54px -18px rgba(20,18,16,.45);animation:cal2Pop .26s cubic-bezier(.2,.9,.3,1.3)}
    .cal2-pop--center{left:50%!important;top:50%!important;transform:translate(-50%,-50%)}
    .cal2-pbd{background:var(--c-surface);border-radius:16px;padding:18px 20px 20px;position:relative}
    .cal2-px{position:absolute;top:13px;right:13px;width:28px;height:28px;border:0;border-radius:8px;background:var(--c-sunken);color:var(--c-text-muted);font-size:17px;line-height:1;cursor:pointer;transition:.15s}.cal2-px:hover{background:var(--c-primary);color:#fff;transform:rotate(90deg)}
    .cal2-pcat{font-size:12.5px;color:var(--c-text-muted);font-weight:600;margin:0 0 7px}
    .cal2-pt{font-size:17px;line-height:1.35;margin:0 0 15px;color:var(--c-text);padding-right:24px;font-weight:700}
    .cal2-pmeta{display:flex;flex-direction:column;gap:9px;margin-bottom:14px}.cal2-pmeta span{display:flex;align-items:center;gap:9px;font-size:13.5px;color:var(--c-text)}.cal2-pmeta svg{width:17px;height:17px;color:var(--c-primary);flex:0 0 17px}
    .cal2-pst{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:13px 0;border-top:1px solid var(--c-border);border-bottom:1px solid var(--c-border);margin-bottom:15px}
    .cal2-badge{font-size:12px;font-weight:700;padding:5px 13px;border-radius:20px;display:inline-flex;align-items:center;gap:6px}.cal2-badge::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
    .cal2-badge--up{background:#e7eef8;color:#13497a}.cal2-badge--today{background:#fbefd6;color:#b45309}.cal2-badge--past{background:#eeedea;color:#5b5f66}
    .cal2-pdate{font-size:12.5px;color:var(--c-text-muted);display:flex;align-items:center;gap:6px}.cal2-pdate svg{width:15px;height:15px}
    .cal2-pnote{font-size:13.5px;color:var(--c-text-muted);line-height:1.6;margin:0 0 16px}
    .cal2-pcta{display:inline-flex;align-items:center;gap:8px;background:var(--c-primary);color:#fff;font-weight:600;font-size:14px;padding:11px 20px;border-radius:11px;text-decoration:none;transition:.15s}.cal2-pcta:hover{background:var(--c-action-700);transform:translateX(3px)}.cal2-pcta svg{width:16px;height:16px}
    @keyframes cal2Fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
    @keyframes cal2Pop{from{opacity:0;transform:scale(.92) translateY(8px)}to{opacity:1;transform:none}}
    @media (prefers-reduced-motion:reduce){.cal2-main,.cal2-up,.cal2-pop{animation:none}}
    @media(max-width:980px){.cal2-layout{grid-template-columns:1fr}.cal2-side{order:2;border-right:0;border-top:1px solid var(--c-border);flex-direction:row;flex-wrap:wrap;gap:24px}.cal2-side>*{flex:1 1 220px}}
    @media(max-width:680px){.cw-dh span{font-size:10px}.cw-dh b{font-size:15px;min-width:28px;height:28px}.cw-ev b{font-size:11px}.cal2-pop{left:50%!important;top:auto!important;bottom:12px;transform:translateX(-50%)}.cal2-side{flex-direction:column}}
    @media(max-width:560px){.cal2-cell{min-height:62px}.cal2-ev{font-size:0;padding:3px;border-radius:50%;width:8px;height:8px}.cal2-daynum{font-size:12px}}`;
    document.head.appendChild(st);
  }

  /* ---------- mini calendar ---------- */
  function miniCal() {
    var first = new Date(cursor.getFullYear(), cursor.getMonth(), 1), sg = new Date(first); sg.setDate(1 - first.getDay());
    var cells = "";
    for (var i = 0; i < 42; i++) {
      var d = new Date(sg); d.setDate(sg.getDate() + i);
      var out = d.getMonth() !== cursor.getMonth(), has = eventsOn(d).length > 0;
      cells += '<button class="mc-d' + (out ? " mc-d--out" : "") + (sameDay(d, today) ? " mc-d--today" : "") + (sameDay(d, cursor) && !out ? " mc-d--sel" : "") + '" data-mc="' + ymd(d) + '">' + d.getDate() + (has ? "<i></i>" : "") + "</button>";
    }
    return '<div class="mc"><div class="mc-bar"><button class="mc-nav" data-mcnav="-1" aria-label="เดือนก่อน">‹</button><b>' + MON[cursor.getMonth()] + " " + (cursor.getFullYear() + 543) + '</b><button class="mc-nav" data-mcnav="1" aria-label="เดือนถัดไป">›</button></div>' +
      '<div class="mc-grid">' + DOW1.map(function (w) { return '<span class="mc-dow">' + w + "</span>"; }).join("") + cells + "</div></div>";
  }

  /* ---------- ตัวกรองหมวด ---------- */
  function filtersHTML() {
    var cats = {};
    events.forEach(function (e) { var c = catOf(e); if (!cats[c]) cats[c] = evColor(e); });
    var keys = Object.keys(cats);
    if (!keys.length) return "";
    var rows = keys.map(function (c) {
      var on = !hiddenCats[c];
      return '<label class="cf-row' + (on ? "" : " off") + '"><input type="checkbox" data-cat="' + esc(c) + '"' + (on ? " checked" : "") + '><span class="cf-dot" style="background:' + (HEX[cats[c]] || "#13497a") + '"></span>' + esc(c) + "</label>";
    }).join("");
    return '<div class="cf"><h3>' + ic(I_FILTER) + "ตัวกรองหมวด</h3>" + rows + "</div>";
  }

  function upcomingHTML() {
    var up = events.filter(function (e) { return visible(e) && evDate(e) >= new Date(today.getFullYear(), today.getMonth(), today.getDate()); }).sort(function (a, b) { return evDate(a) - evDate(b); }).slice(0, 4);
    var head = '<div class="cal2-up-wrap"><h3>' + ic(I_CAL) + "กิจกรรมที่จะถึง</h3>";
    if (!up.length) return head + '<p class="ga-empty">ยังไม่มีกิจกรรมที่จะถึง</p></div>';
    return head + up.map(function (e, k) {
      var d = evDate(e), bg = HEX[evColor(e)] || "#13497a";
      return '<div class="cal2-up" data-ev="' + events.indexOf(e) + '" style="animation-delay:' + (k * 50) + 'ms"><div class="cal2-up__d" style="background:' + bg + '"><b>' + d.getDate() + "</b><span>" + MONS[d.getMonth()] + "</span></div>" +
        '<div class="cal2-up__b"><h4>' + esc(e.title) + "</h4><p>" + (e.allDay ? "ทั้งวัน" : hhmm(d)) + (e.location ? " · " + esc(e.location) : "") + "</p></div></div>";
    }).join("") + "</div>";
  }

  /* ---------- เดือน ---------- */
  function monthGrid() {
    var first = new Date(cursor.getFullYear(), cursor.getMonth(), 1), sg = new Date(first); sg.setDate(1 - first.getDay());
    var cells = "";
    for (var i = 0; i < 42; i++) {
      var d = new Date(sg); d.setDate(sg.getDate() + i);
      var out = d.getMonth() !== cursor.getMonth();
      var evs = eventsOn(d).map(function (e) { return '<span class="cal2-ev cal2-ev--' + evColor(e) + '" data-ev="' + events.indexOf(e) + '" title="' + esc(e.title) + '">' + esc(e.title) + "</span>"; }).join("");
      cells += '<div class="cal2-cell' + (out ? " cal2-cell--out" : "") + (sameDay(d, today) ? " cal2-cell--today" : "") + '"><span class="cal2-daynum">' + d.getDate() + "</span>" + evs + "</div>";
    }
    return '<div class="cal2-grid">' + DOW.map(function (w) { return '<div class="cal2-dow">' + w + "</div>"; }).join("") + cells + "</div>";
  }

  /* ---------- สัปดาห์/วัน (time-grid) ---------- */
  function timeGrid(days) {
    var n = days.length, tpl = "54px repeat(" + n + ",minmax(0,1fr))";
    var head = '<div class="cw-gmt">น.</div>' + days.map(function (d) { return '<div class="cw-dh' + (sameDay(d, today) ? " cw-dh--today" : "") + '"><span>' + DOW[d.getDay()] + '</span><b>' + d.getDate() + (n === 1 ? " " + MONS[d.getMonth()] : "") + "</b></div>"; }).join("");
    var allday = '<div class="cw-adlb">ทั้งวัน</div>' + days.map(function (d) { return '<div class="cw-adcol">' + eventsOn(d, false).map(function (e) { return '<div class="cw-ad cw-ad--' + evColor(e) + '" data-ev="' + events.indexOf(e) + '" title="' + esc(e.title) + '">' + esc(e.title) + "</div>"; }).join("") + "</div>"; }).join("");
    var times = ""; for (var h = H0; h <= H1; h++) times += '<div class="cw-time">' + ("0" + h).slice(-2) + ":00</div>";
    var cols = days.map(function (d) {
      var blocks = eventsOn(d, true).map(function (e) {
        var s = evDate(e), en = evEnd(e), top = (s.getHours() + s.getMinutes() / 60 - H0) * HH, hgt = Math.max(26, ((en - s) / 3600000) * HH);
        return '<div class="cw-ev cw-ev--' + evColor(e) + '" data-ev="' + events.indexOf(e) + '" style="top:' + Math.max(0, top) + "px;height:" + hgt + 'px"><b>' + esc(e.title) + "</b><span>" + hhmm(s) + (e.end ? "–" + hhmm(en) : "") + "</span></div>";
      }).join("");
      return '<div class="cw-col' + (sameDay(d, today) ? " cw-col--today" : "") + '" style="height:' + ((H1 - H0 + 1) * HH) + 'px">' + blocks + "</div>";
    }).join("");
    return '<div class="cw"><div class="cw-head" style="grid-template-columns:' + tpl + '">' + head + '</div><div class="cw-allday" style="grid-template-columns:' + tpl + '">' + allday + '</div><div class="cw-body" style="grid-template-columns:' + tpl + '"><div class="cw-times">' + times + "</div>" + cols + "</div></div>";
  }
  function weekGrid() { var s = weekStart(cursor), days = []; for (var i = 0; i < 7; i++) { var d = new Date(s); d.setDate(s.getDate() + i); days.push(d); } return timeGrid(days); }
  function dayGrid() { return timeGrid([new Date(cursor)]); }

  /* ---------- popover ---------- */
  var curPop = null;
  function closePop() { if (curPop) { curPop.remove(); curPop = null; document.removeEventListener("keydown", onKey); document.removeEventListener("click", onDoc, true); } }
  function onKey(ev) { if (ev.key === "Escape") closePop(); }
  function onDoc(ev) { if (curPop && !curPop.contains(ev.target) && !ev.target.closest("[data-ev]")) closePop(); }
  function openPop(e, anchor) {
    closePop();
    var d = evDate(e), t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()), ed = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var stt = ed.getTime() === t0.getTime() ? { t: "วันนี้", c: "today" } : ed > t0 ? { t: "กำลังจะมาถึง", c: "up" } : { t: "ผ่านไปแล้ว", c: "past" };
    var time = e.allDay ? "ทั้งวัน" : hhmm(d) + (e.end ? " – " + hhmm(evEnd(e)) : "") + " น.";
    var pop = document.createElement("div"); pop.className = "cal2-pop";
    pop.innerHTML = '<div class="cal2-pbd" role="dialog" aria-modal="true" aria-label="' + esc(e.title) + '"><button class="cal2-px" aria-label="ปิด">×</button>' +
      '<p class="cal2-pcat">กิจกรรม' + (e.category ? " · " + esc(e.category) : "") + '</p><h3 class="cal2-pt">' + esc(e.title) + '</h3><div class="cal2-pmeta">' +
      (e.location ? "<span>" + ic(I_PIN) + esc(e.location) + "</span>" : "") + "<span>" + ic(I_CLOCK) + time + "</span></div>" +
      '<div class="cal2-pst"><span class="cal2-badge cal2-badge--' + stt.c + '">' + stt.t + '</span><span class="cal2-pdate">' + ic(I_CAL) + thDate(d) + "</span></div>" +
      (e.description ? '<p class="cal2-pnote">' + esc(e.description) + "</p>" : "") + '<a class="cal2-pcta" href="#">ดูรายละเอียด ' + ic(I_ARROW) + "</a></div>";
    document.body.appendChild(pop); curPop = pop;
    var pw = pop.offsetWidth, ph = pop.offsetHeight, r = anchor.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, gap = 12;
    if (vw > 680) { var left = r.right + gap; if (left + pw > vw - 8) left = r.left - pw - gap; if (left < 8) left = 8; var top = Math.max(8, Math.min(r.top, vh - ph - 8)); pop.style.left = left + "px"; pop.style.top = top + "px"; }
    else pop.classList.add("cal2-pop--center");
    pop.querySelector(".cal2-px").onclick = closePop;
    document.addEventListener("keydown", onKey);
    setTimeout(function () { document.addEventListener("click", onDoc, true); }, 0);
  }

  function titleStr() {
    if (view === "month") return MON[cursor.getMonth()] + " " + (cursor.getFullYear() + 543);
    if (view === "day") return thDate(cursor);
    var s = weekStart(cursor), e = new Date(s); e.setDate(s.getDate() + 6);
    return s.getDate() + (s.getMonth() !== e.getMonth() ? " " + MONS[s.getMonth()] : "") + " – " + e.getDate() + " " + MONS[e.getMonth()] + " " + (e.getFullYear() + 543);
  }

  function render() {
    closePop();
    var views = [["week", "สัปดาห์"], ["month", "เดือน"], ["day", "วัน"]].map(function (v) { return '<button data-v="' + v[0] + '" aria-pressed="' + (view === v[0]) + '">' + v[1] + "</button>"; }).join("");
    var body = view === "month" ? monthGrid() : view === "day" ? dayGrid() : weekGrid();
    root.innerHTML = '<div class="cal2"><div class="cal2-bar"><div class="cal2-nav">' +
      '<button class="cal2-arrow" id="cal-prev" aria-label="ก่อนหน้า">‹</button><h2 class="cal2-title">' + esc(titleStr()) + '</h2>' +
      '<button class="cal2-arrow" id="cal-next" aria-label="ถัดไป">›</button><button class="cal2-today" id="cal-today">วันนี้</button></div>' +
      '<div class="cal2-views" role="group" aria-label="มุมมอง">' + views + "</div></div>" +
      '<div class="cal2-layout"><aside class="cal2-side">' + miniCal() + filtersHTML() + upcomingHTML() + '</aside><div class="cal2-main">' + body + "</div></div></div>";
    document.getElementById("cal-prev").onclick = function () { step(-1); };
    document.getElementById("cal-next").onclick = function () { step(1); };
    document.getElementById("cal-today").onclick = function () { cursor = new Date(); render(); };
    root.querySelectorAll(".cal2-views button").forEach(function (b) { b.onclick = function () { view = b.getAttribute("data-v"); render(); }; });
    root.querySelectorAll("[data-mc]").forEach(function (b) { b.onclick = function () { var p = b.getAttribute("data-mc").split("-"); cursor = new Date(+p[0], +p[1] - 1, +p[2]); render(); }; });
    root.querySelectorAll("[data-mcnav]").forEach(function (b) { b.onclick = function () { cursor.setMonth(cursor.getMonth() + (+b.getAttribute("data-mcnav"))); render(); }; });
    root.querySelectorAll("[data-cat]").forEach(function (cb) { cb.onchange = function () { var c = cb.getAttribute("data-cat"); if (cb.checked) delete hiddenCats[c]; else hiddenCats[c] = true; render(); }; });
    root.querySelectorAll("[data-ev]").forEach(function (el) { el.onclick = function (ev) { ev.stopPropagation(); openPop(events[+el.getAttribute("data-ev")], el); }; });
    var bdy = root.querySelector(".cw-body"); if (bdy) bdy.scrollTop = Math.max(0, (9 - H0) * HH - 10);
  }
  function step(dir) {
    if (view === "month") cursor.setMonth(cursor.getMonth() + dir);
    else if (view === "week") cursor.setDate(cursor.getDate() + 7 * dir);
    else cursor.setDate(cursor.getDate() + dir);
    render();
  }

  root.innerHTML = '<p class="ga-empty" style="text-align:center;color:var(--c-text-muted);padding:40px">กำลังโหลดปฏิทิน…</p>';
  fetch(STRAPI + "/api/events?pagination[pageSize]=200" + TQS, { headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (j) { events = (j && j.data) || []; render(); })
    .catch(function () { root.innerHTML = '<p class="ga-empty" style="text-align:center;color:var(--c-text-muted);padding:40px">โหลดปฏิทินไม่สำเร็จ</p>'; });
})();
