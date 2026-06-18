/* ============================================================
   analytics.js — แดชบอร์ดสถิติเว็บไซต์ (หลังบ้าน) · TOR โมดูล Web Analytics+Heatmap
   - ล็อกอินด้วยบัญชี Strapi Admin (POST /admin/login) → เก็บ token ใน sessionStorage
   - ดึงสรุปสถิติจาก /api/analytics/summary (ป้องกันด้วย policy admin-only)
   - สลับ tenant ได้ · ลิงก์ไป GA4/Clarity ภายนอก
   หมายเหตุความปลอดภัย: ข้อมูลฟอร์มแสดงเป็น "จำนวนรวม" เท่านั้น ไม่มีตัวเรคคอร์ด (PDPA)
   ============================================================ */
(function () {
  "use strict";
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var TKEY = "dga-admin-token";
  var root = document.getElementById("a-root");
  if (!root) return;

  function tok() { try { return sessionStorage.getItem(TKEY) || ""; } catch (e) { return ""; } }
  function setTok(t) { try { t ? sessionStorage.setItem(TKEY, t) : sessionStorage.removeItem(TKEY); } catch (e) {} }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function nf(n) { return (n || 0).toLocaleString("th-TH"); }
  function bar(label, val, max, cls) {
    var pct = max > 0 ? Math.round((val / max) * 100) : 0;
    return '<div class="a-bar"><div class="a-bar__head"><span>' + esc(label) + "</span><span>" + nf(val) +
      "</span></div><div class=\"a-bar__track\"><div class=\"a-bar__fill" + (cls ? " " + cls : "") +
      '" style="width:' + pct + '%"></div></div></div>';
  }

  // ---------- หน้าล็อกอิน ----------
  function renderLogin(msg) {
    root.innerHTML =
      '<form class="a-login" id="a-login">' +
      "<h1>แดชบอร์ดสถิติเว็บไซต์</h1>" +
      "<p>เข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ (Strapi Admin) เพื่อดูสถิติ</p>" +
      '<p class="a-err" id="a-err">' + esc(msg || "") + "</p>" +
      '<label for="a-email">อีเมล</label><input id="a-email" type="email" autocomplete="username" required>' +
      '<label for="a-pass">รหัสผ่าน</label><input id="a-pass" type="password" autocomplete="current-password" required>' +
      '<button class="btn btn--primary" type="submit">เข้าสู่ระบบ</button></form>';
    document.getElementById("a-login").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = document.getElementById("a-err");
      err.textContent = "กำลังตรวจสอบ…";
      fetch(STRAPI + "/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: document.getElementById("a-email").value, password: document.getElementById("a-pass").value })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.data && j.data.token) { setTok(j.data.token); load(); }
        else { err.textContent = "อีเมลหรือรหัสผ่านไม่ถูกต้อง"; }
      }).catch(function () { err.textContent = "เชื่อมต่อระบบไม่ได้"; });
    });
  }

  // ---------- โหลดสรุปสถิติ ----------
  var currentTenant = "";
  function load(tenant) {
    if (typeof tenant === "string") currentTenant = tenant;
    if (!tok()) { renderLogin(); return; }
    root.innerHTML = '<p class="a-empty" style="text-align:center;padding:48px">กำลังโหลดสถิติ…</p>';
    var q = currentTenant ? "?tenant=" + encodeURIComponent(currentTenant) : "";
    fetch(STRAPI + "/api/analytics/summary" + q, { headers: { Authorization: "Bearer " + tok(), Accept: "application/json" } })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) { setTok(""); renderLogin("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"); return null; }
        return r.json();
      })
      .then(function (j) { if (j && !j.error) render(j); else if (j) root.innerHTML = '<p class="a-empty">โหลดข้อมูลไม่สำเร็จ</p>'; })
      .catch(function () { root.innerHTML = '<p class="a-empty">เชื่อมต่อระบบไม่ได้</p>'; });
  }

  // ---------- แสดงผลแดชบอร์ด ----------
  function render(d) {
    var c = d.content || {}, sub = d.submissions || {}, con = d.consent || {}, eng = d.engagement || {};
    var acceptPct = con.total > 0 ? Math.round((con.accept / con.total) * 100) : 0;

    // ตัวสลับ tenant
    var opts = (d.tenants || []).map(function (t) {
      return '<option value="' + esc(t.key) + '"' + (t.key === d.scope ? " selected" : "") + ">" + esc(t.name || t.key) + "</option>";
    }).join("");

    // KPI
    var kpis =
      kpi("เนื้อหาที่เผยแพร่", nf(d.contentTotal), "ทุกประเภทรวมกัน", true) +
      kpi("ยอดเข้าชมบทความ", nf(eng.totalArticleViews), "สะสมทั้งหมด") +
      kpi("ฟอร์มที่ได้รับ", nf(sub.total), "ร้องเรียน/สมัคร/ลงทะเบียน") +
      kpi("ความยินยอมคุกกี้", acceptPct + "%", "ยอมรับ " + nf(con.accept) + " จาก " + nf(con.total) + " ครั้ง");

    // แยกประเภทเนื้อหา
    var labels = { articles: "ข่าว/บทความ", services: "บริการ", jobs: "ตำแหน่งงาน", faqs: "คำถามพบบ่อย", downloads: "ดาวน์โหลด", ebooks: "e-book", galleries: "แกลเลอรี", banners: "แบนเนอร์", videos: "วิดีโอ", awards: "รางวัล", popups: "ป๊อปอัพ", polls: "โพล", landings: "Landing" };
    var chips = Object.keys(labels).map(function (k) {
      return '<div class="a-chip"><b>' + nf(c[k]) + "</b><span>" + esc(labels[k]) + "</span></div>";
    }).join("");

    // ฟอร์ม (จำนวนรวม)
    var maxSub = Math.max(sub.complaints, sub.applications, sub.registrations, 1);
    var subBars = bar("เรื่องร้องเรียน", sub.complaints, maxSub) +
      bar("ใบสมัครงาน", sub.applications, maxSub, "a-bar__fill--amber") +
      bar("ลงทะเบียนผู้ใช้", sub.registrations, maxSub, "a-bar__fill--green");

    // ความยินยอม
    var conBars = bar("ยอมรับทั้งหมด", con.accept, con.total || 1, "a-bar__fill--green") +
      bar("ปฏิเสธ", con.reject, con.total || 1, "a-bar__fill--red") +
      bar("กำหนดเอง", con.custom, con.total || 1, "a-bar__fill--amber");

    // บทความยอดนิยม
    var maxView = (eng.topArticles && eng.topArticles[0] && eng.topArticles[0].views) || 1;
    var top = (eng.topArticles || []).length
      ? (eng.topArticles).map(function (a) { return bar(a.title, a.views, maxView); }).join("")
      : '<p class="a-empty">ยังไม่มีข้อมูลการเข้าชม</p>';

    // โพล
    var polls = (d.polls || []).length ? (d.polls).map(function (p) {
      var optList = (p.options || []);
      var maxV = optList.reduce(function (m, o) { return Math.max(m, o.votes || 0); }, 1);
      return "<div style=\"margin-bottom:16px\"><div style=\"font-weight:500;margin-bottom:8px\">" + esc(p.question) +
        ' <span class="a-top__meta">(' + nf(p.totalVotes) + " โหวต)</span></div>" +
        optList.map(function (o) { return bar(o.label, o.votes || 0, maxV); }).join("") + "</div>";
    }).join("") : '<p class="a-empty">ยังไม่มีโพล</p>';

    // กิจกรรมแอดมินล่าสุด
    var audit = (d.recentAudit || []).length ? (d.recentAudit).map(function (r) {
      var when = r.at ? new Date(r.at).toLocaleString("th-TH") : "";
      return "<tr><td>" + esc(r.action) + "</td><td>" + esc((r.contentType || "").replace("api::", "").split(".")[0]) +
        "</td><td>" + esc(r.adminEmail || "") + "</td><td>" + esc(when) + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="a-empty">ยังไม่มีบันทึกกิจกรรม</td></tr>';

    // ลิงก์ภายนอก
    var ext = d.externalAnalytics || {};
    var extLinks = "";
    if (ext.ga4) extLinks += '<a href="https://analytics.google.com/" target="_blank" rel="noopener">Google Analytics 4 <code>' + esc(ext.ga4) + "</code></a>";
    if (ext.clarity) extLinks += '<a href="https://clarity.microsoft.com/projects/view/' + esc(ext.clarity) + '/dashboard" target="_blank" rel="noopener">Microsoft Clarity (Heatmap) <code>' + esc(ext.clarity) + "</code></a>";
    if (!extLinks) extLinks = '<p class="a-empty">tenant นี้ยังไม่ได้ตั้งค่า GA4/Clarity</p>';

    root.innerHTML =
      '<div class="a-top"><h1>สถิติเว็บไซต์</h1>' +
      '<span class="a-top__meta">หน่วยงาน:</span><select class="a-select" id="a-tenant">' + opts + "</select>" +
      '<button class="btn btn--ghost" id="a-logout">ออกจากระบบ</button></div>' +
      '<p class="a-top__meta" style="margin:-12px 0 18px">อัปเดต ' + esc(new Date(d.generatedAt).toLocaleString("th-TH")) + " · ข้อมูลภายในระบบ (first-party)</p>" +
      '<div class="a-kpis">' + kpis + "</div>" +
      '<div class="a-card"><h2>เนื้อหาในระบบ (เผยแพร่แล้ว)</h2><div class="a-chips">' + chips + "</div></div>" +
      '<div class="a-cols">' +
      '<div class="a-card"><h2>ฟอร์มที่ได้รับ (จำนวนรวม)</h2>' + subBars + "</div>" +
      '<div class="a-card"><h2>ความยินยอมคุกกี้ (PDPA)</h2>' + conBars + "</div>" +
      "</div>" +
      '<div class="a-cols">' +
      '<div class="a-card"><h2>บทความยอดนิยม</h2>' + top + "</div>" +
      '<div class="a-card"><h2>ผลโพล</h2>' + polls + "</div>" +
      "</div>" +
      '<div class="a-card"><h2>เครื่องมือวิเคราะห์ภายนอก (GA4 / Clarity Heatmap)</h2><div class="a-ext">' + extLinks + "</div></div>" +
      '<div class="a-card"><h2>กิจกรรมผู้ดูแลล่าสุด</h2><table class="a-table"><thead><tr><th>การกระทำ</th><th>ประเภท</th><th>ผู้ดูแล</th><th>เวลา</th></tr></thead><tbody>' + audit + "</tbody></table></div>";

    document.getElementById("a-tenant").addEventListener("change", function () { load(this.value); });
    document.getElementById("a-logout").addEventListener("click", function () { setTok(""); renderLogin("ออกจากระบบแล้ว"); });
  }

  function kpi(label, val, sub, accent) {
    return '<div class="a-kpi' + (accent ? " a-kpi--accent" : "") + '"><p class="a-kpi__label">' + esc(label) +
      '</p><div class="a-kpi__val">' + esc(val) + '</div><p class="a-kpi__sub">' + esc(sub) + "</p></div>";
  }

  load();
})();
