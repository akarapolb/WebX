/* ============================================================
   console.js — WebX Console (หลังบ้านรวมศูนย์ต่อ tenant) · SPA
   - ล็อกอินบัญชี Strapi Admin ครั้งเดียว (POST /admin/login)
   - /api/console/context → ผู้ล็อกอิน + tenant ที่เข้าถึงได้ (แบรนด์ต่อ tenant)
   - sidebar + topbar + hash router → views: home / analytics / content / users / chat / branding
   ความปลอดภัย: ใช้ token admin (sessionStorage), ทุก endpoint หลังบ้านผ่าน policy admin-only
   ============================================================ */
(function () {
  "use strict";
  var STRAPI = window.DGA_CMS_URL || "http://localhost:1337";
  var TKEY = "dga-admin-token";
  var app = document.getElementById("wx");
  if (!app) return;

  // ---------- utils ----------
  function tok() { try { return sessionStorage.getItem(TKEY) || ""; } catch (e) { return ""; } }
  function setTok(t) { try { t ? sessionStorage.setItem(TKEY, t) : sessionStorage.removeItem(TKEY); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function nf(n) { return (n || 0).toLocaleString("th-TH"); }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: "Bearer " + tok(), Accept: "application/json" }, opts.headers || {});
    return fetch(STRAPI + path, opts).then(function (r) {
      if (r.status === 401 || r.status === 403) { setTok(""); renderLogin("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"); throw new Error("auth"); }
      return r.json();
    });
  }
  function ic(id) { return '<svg aria-hidden="true"><use href="#' + id + '"></use></svg>'; }
  // SSO เข้า Strapi Admin โดยไม่ล็อกอินซ้ำ — ส่ง token ผ่าน fragment ไปยัง bridge ของ Strapi
  function strapiAdmin(adminPath) {
    return STRAPI + "/api/sso/bridge#token=" + encodeURIComponent(tok()) + "&redirect=" + encodeURIComponent(adminPath);
  }

  // ---------- โมดูล ----------
  var MODULES = [
    { id: "analytics", icon: "i-chart", label: "สถิติ (Analytics)", desc: "ยอดเข้าชม เนื้อหา ฟอร์ม ความยินยอม และลิงก์ GA4/Clarity", status: "live" },
    { id: "content", icon: "i-doc", label: "จัดการเนื้อหา", desc: "ข่าว บริการ ตำแหน่งงาน Landing และสื่อต่าง ๆ ของหน่วยงาน", status: "live" },
    { id: "users", icon: "i-users", label: "ผู้ใช้งาน", desc: "กำหนดผู้ดูแลเนื้อหาของหน่วยงาน (สิทธิ์ต่อ tenant)", status: "live" },
    { id: "chat", icon: "i-chat", label: "แชต/ติดต่อ", desc: "จัดช่องทาง Live Chat (LINE/Messenger/FB/โทร) ของหน่วยงาน", status: "live" },
    { id: "branding", icon: "i-palette", label: "แบรนด์/เว็บไซต์", desc: "เทมเพลต 3 แบบ สีแบรนด์ พื้นหลัง และลายน้ำคลังภาพ — ปรับเองไม่ต้องเขียนโค้ด", status: "live" },
  ];
  function modById(id) { for (var i = 0; i < MODULES.length; i++) if (MODULES[i].id === id) return MODULES[i]; return null; }

  // ---------- state ----------
  var ctxData = null, currentTenant = "";
  function tenantObj() { return (ctxData.tenants || []).filter(function (t) { return t.key === currentTenant; })[0] || ctxData.tenants[0] || null; }
  function accentOf(t) { return (t && t.brand && (t.brand.primaryColor || t.brand.color)) || "#1a4fa0"; }

  // ---------- login ----------
  function renderLogin(msg) {
    document.body.className = "wx";
    app.innerHTML =
      '<form class="wx-login" id="wx-login">' +
      '<div class="wx-login__brand"><div class="wx-login__logo">WX</div><div><h1>WebX Console</h1></div></div>' +
      '<p class="sub">หลังบ้านรวมศูนย์ — เข้าสู่ระบบด้วยบัญชีผู้ดูแล</p>' +
      '<p class="wx-err" id="wx-err">' + esc(msg || "") + "</p>" +
      '<label for="wx-email">อีเมล</label><input id="wx-email" type="email" autocomplete="username" required>' +
      '<label for="wx-pass">รหัสผ่าน</label><input id="wx-pass" type="password" autocomplete="current-password" required>' +
      '<button class="btn btn--primary" type="submit">เข้าสู่ระบบ</button></form>';
    document.getElementById("wx-login").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = document.getElementById("wx-err"); err.textContent = "กำลังตรวจสอบ…";
      fetch(STRAPI + "/admin/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: document.getElementById("wx-email").value, password: document.getElementById("wx-pass").value })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.data && j.data.token) { setTok(j.data.token); boot(); }
        else err.textContent = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
      }).catch(function () { err.textContent = "เชื่อมต่อระบบไม่ได้"; });
    });
  }

  // ---------- shell ----------
  function renderShell() {
    var t = tenantObj();
    var accent = accentOf(t);
    document.documentElement.style.setProperty("--wx-accent", accent);
    var logo = (t && t.brand && t.brand.logoUrl)
      ? '<img src="' + esc(t.brand.logoUrl.indexOf("http") === 0 ? t.brand.logoUrl : STRAPI + t.brand.logoUrl) + '" alt="">'
      : esc((t && (t.name || t.key) || "W").slice(0, 2)).toUpperCase();
    var orgName = (t && (t.name)) || "WebX";

    var nav = MODULES.map(function (m) {
      return '<button class="wx-nav__item" data-view="' + m.id + '">' + ic(m.icon) + "<span>" + esc(m.label) + "</span>" +
        (m.status === "soon" ? '<span class="wx-nav__soon">เร็ว ๆ นี้</span>' : "") + "</button>";
    }).join("");

    var switcher = (ctxData.tenants.length > 1)
      ? '<select class="wx-select" id="wx-tenant" aria-label="เลือกหน่วยงาน">' +
        ctxData.tenants.map(function (x) { return '<option value="' + esc(x.key) + '"' + (x.key === currentTenant ? " selected" : "") + ">" + esc(x.name || x.key) + "</option>"; }).join("") +
        "</select>" : "";

    app.className = "wx-app";
    app.innerHTML =
      '<aside class="wx-side">' +
        '<div class="wx-side__brand"><div class="wx-side__logo">' + logo + "</div>" +
          '<div class="wx-side__name">' + esc(orgName) + "<small>WebX Console</small></div></div>" +
        '<nav class="wx-nav"><button class="wx-nav__item" data-view="home">' + ic("i-home") + "<span>หน้าแรก</span></button>" + nav + "</nav>" +
        '<div class="wx-side__foot"><button class="btn btn--ghost" id="wx-logout" style="width:100%">' + ic("i-out") + " ออกจากระบบ</button></div>" +
      "</aside>" +
      '<div class="wx-main">' +
        '<div class="wx-top"><button class="wx-burger" id="wx-burger">' + ic("i-menu") + "</button>" +
          '<h1 id="wx-title">หน้าแรก</h1>' + switcher +
          '<span class="wx-top__email">' + esc(ctxData.admin.email) + (ctxData.admin.isSuper ? " · ผู้ดูแลระบบ" : "") + "</span></div>" +
        '<div class="wx-view" id="wx-view"></div>' +
      "</div>";

    app.querySelectorAll(".wx-nav__item").forEach(function (b) {
      b.addEventListener("click", function () { location.hash = "#" + b.getAttribute("data-view"); app.classList.remove("wx-open"); });
    });
    document.getElementById("wx-logout").addEventListener("click", function () { setTok(""); renderLogin("ออกจากระบบแล้ว"); });
    var bg = document.getElementById("wx-burger"); if (bg) bg.addEventListener("click", function () { app.classList.toggle("wx-open"); });
    var ts = document.getElementById("wx-tenant"); if (ts) ts.addEventListener("change", function () { currentTenant = this.value; try { sessionStorage.setItem("wx-tenant", currentTenant); } catch (e) {} renderShell(); route(); });
    route();
  }

  function setActive(view) {
    app.querySelectorAll(".wx-nav__item").forEach(function (b) { b.setAttribute("aria-current", b.getAttribute("data-view") === view ? "page" : "false"); });
    var titles = { home: "หน้าแรก" }; MODULES.forEach(function (m) { titles[m.id] = m.label; });
    var ttl = document.getElementById("wx-title"); if (ttl) ttl.textContent = titles[view] || "หน้าแรก";
  }

  // ---------- router ----------
  function route() {
    var view = (location.hash || "#home").slice(1);
    if (view !== "home" && !modById(view)) view = "home";
    setActive(view);
    var el = document.getElementById("wx-view"); if (!el) return;
    if (view === "home") return viewHome(el);
    if (view === "analytics") return viewAnalytics(el);
    if (view === "content") return viewContent(el);
    if (view === "branding") return viewBranding(el);
    if (view === "users") return viewUsers(el);
    if (view === "chat") return viewChat(el);
    return viewSoon(el, modById(view));
  }

  // ---------- view: home ----------
  function viewHome(el) {
    var t = tenantObj();
    var tiles = MODULES.map(function (m) {
      var live = m.status === "live";
      return '<button class="wx-tile" data-go="' + m.id + '"' + (live ? "" : " disabled") + '>' +
        '<div class="wx-tile__ic">' + ic(m.icon) + "</div>" +
        "<h3>" + esc(m.label) + "</h3><p>" + esc(m.desc) + "</p>" +
        '<span class="wx-tile__badge ' + (live ? "wx-badge--live" : "wx-badge--soon") + '">' + (live ? "พร้อมใช้งาน" : "เร็ว ๆ นี้") + "</span></button>";
    }).join("");
    el.innerHTML =
      '<div class="wx-hero"><h2>สวัสดี ' + esc(ctxData.admin.firstname || "ผู้ดูแล") + "</h2>" +
      "<p>ยินดีต้อนรับสู่หลังบ้านของ " + esc((t && (t.name || t.key)) || "") + " — เลือกโมดูลที่ต้องการจัดการ</p></div>" +
      '<div class="wx-tiles">' + tiles + "</div>";
    el.querySelectorAll(".wx-tile[data-go]").forEach(function (b) {
      if (b.disabled) return; b.addEventListener("click", function () { location.hash = "#" + b.getAttribute("data-go"); });
    });
  }

  // ---------- view: analytics ----------
  function viewAnalytics(el) {
    el.innerHTML = '<p class="wx-empty">กำลังโหลดสถิติ…</p>';
    api("/api/analytics/summary?tenant=" + encodeURIComponent(currentTenant)).then(function (d) {
      if (!d || d.error) { el.innerHTML = '<p class="wx-empty">โหลดข้อมูลไม่สำเร็จ</p>'; return; }
      var c = d.content || {}, sub = d.submissions || {}, con = d.consent || {}, eng = d.engagement || {};
      var acceptPct = con.total > 0 ? Math.round((con.accept / con.total) * 100) : 0;
      function kpi(l, v, s) { return '<div class="a-kpi a-kpi--accent" style="border-color:var(--wx-accent)"><p class="a-kpi__label">' + esc(l) + '</p><div class="a-kpi__val" style="color:var(--wx-accent)">' + esc(v) + '</div><p class="a-kpi__sub">' + esc(s) + "</p></div>"; }
      var labels = { articles: "ข่าว/บทความ", services: "บริการ", jobs: "ตำแหน่งงาน", faqs: "คำถามพบบ่อย", downloads: "ดาวน์โหลด", ebooks: "e-book", galleries: "แกลเลอรี", banners: "แบนเนอร์", videos: "วิดีโอ", awards: "รางวัล", popups: "ป๊อปอัพ", polls: "โพล", landings: "Landing" };
      var chips = Object.keys(labels).map(function (k) { return '<div class="a-chip"><b>' + nf(c[k]) + "</b><span>" + esc(labels[k]) + "</span></div>"; }).join("");
      var maxView = (eng.topArticles && eng.topArticles[0] && eng.topArticles[0].views) || 1;
      var top = (eng.topArticles || []).length ? eng.topArticles.map(function (a) {
        var pct = Math.round((a.views / maxView) * 100);
        return '<div class="a-bar"><div class="a-bar__head"><span>' + esc(a.title) + "</span><span>" + nf(a.views) + '</span></div><div class="a-bar__track"><div class="a-bar__fill" style="width:' + pct + '%;background:var(--wx-accent)"></div></div></div>';
      }).join("") : '<p class="a-empty">ยังไม่มีข้อมูลการเข้าชม</p>';
      var ext = d.externalAnalytics || {}, extLinks = "";
      if (ext.ga4) extLinks += '<a href="https://analytics.google.com/" target="_blank" rel="noopener">Google Analytics 4 <code>' + esc(ext.ga4) + "</code></a>";
      if (ext.clarity) extLinks += '<a href="https://clarity.microsoft.com/projects/view/' + esc(ext.clarity) + '/dashboard" target="_blank" rel="noopener">Microsoft Clarity (Heatmap) <code>' + esc(ext.clarity) + "</code></a>";
      if (!extLinks) extLinks = '<p class="a-empty">ยังไม่ได้ตั้งค่า GA4/Clarity</p>';
      el.innerHTML =
        '<div class="a-kpis">' + kpi("เนื้อหาที่เผยแพร่", nf(d.contentTotal), "ทุกประเภทรวมกัน") +
          kpi("ยอดเข้าชมบทความ", nf(eng.totalArticleViews), "สะสมทั้งหมด") +
          kpi("ฟอร์มที่ได้รับ", nf(sub.total), "ร้องเรียน/สมัคร/ลงทะเบียน") +
          kpi("ความยินยอมคุกกี้", acceptPct + "%", "ยอมรับ " + nf(con.accept) + " จาก " + nf(con.total)) + "</div>" +
        '<div class="a-card" style="margin-bottom:20px"><h2>เนื้อหาในระบบ</h2><div class="a-chips">' + chips + "</div></div>" +
        '<div class="a-cols"><div class="a-card"><h2>บทความยอดนิยม</h2>' + top + "</div>" +
        '<div class="a-card"><h2>เครื่องมือวิเคราะห์ภายนอก</h2><div class="a-ext">' + extLinks + "</div></div></div>";
    }).catch(function () {});
  }

  // ---------- view: content (ลิงก์เข้า Strapi content-manager) ----------
  function viewContent(el) {
    var types = [
      { uid: "api::article.article", label: "ข่าว/บทความ", icon: "i-doc" },
      { uid: "api::service.service", label: "บริการ", icon: "i-grid" },
      { uid: "api::job.job", label: "ตำแหน่งงาน", icon: "i-build" },
      { uid: "api::landing.landing", label: "หน้า Landing", icon: "i-palette" },
      { uid: "api::faq.faq", label: "คำถามพบบ่อย", icon: "i-chat" },
      { uid: "api::banner.banner", label: "แบนเนอร์", icon: "i-grid" },
      { uid: "api::gallery.gallery", label: "คลังภาพ", icon: "i-grid" },
      { uid: "api::video.video", label: "คลังวิดีโอ", icon: "i-grid" },
      { uid: "api::download.download", label: "ดาวน์โหลด", icon: "i-doc" },
      { uid: "api::ebook.ebook", label: "e-book", icon: "i-book" },
      { uid: "api::blog.blog", label: "บล็อก", icon: "i-doc" },
      { uid: "api::catalog.catalog", label: "e-catalog", icon: "i-book" },
      { uid: "api::weblink.weblink", label: "เว็บลิงก์", icon: "i-grid" },
      { uid: "api::top-graphic.top-graphic", label: "Top Graphic", icon: "i-palette" },
      { uid: "api::event.event", label: "ปฏิทินกิจกรรม", icon: "i-doc" },
      { uid: "api::location.location", label: "จุดที่ตั้ง (Map)", icon: "i-grid" },
      { uid: "api::sitemap-node.sitemap-node", label: "แผนผังเว็บไซต์", icon: "i-doc" },
    ];
    var tiles = types.map(function (x) {
      var url = strapiAdmin("/admin/content-manager/collection-types/" + x.uid);
      return '<a class="wx-tile" href="' + url + '" target="_blank" rel="noopener">' +
        '<div class="wx-tile__ic">' + ic(x.icon) + '</div><h3>' + esc(x.label) + "</h3>" +
        '<p>เพิ่ม/แก้ไข/เผยแพร่ใน Strapi (สิทธิ์จำกัดตามหน่วยงานอัตโนมัติ)</p>' +
        '<span class="wx-tile__badge wx-badge--live">เปิดตัวจัดการ ↗</span></a>';
    }).join("");
    el.innerHTML =
      '<div class="wx-card" style="margin-bottom:20px"><p style="margin:0;color:var(--c-text-muted)">จัดการเนื้อหาผ่าน Strapi Content Manager — ระบบบังคับสิทธิ์ให้เห็น/แก้เฉพาะข้อมูลของหน่วยงานคุณโดยอัตโนมัติ (multi-tenant RBAC)</p></div>' +
      '<div class="wx-tiles">' + tiles + "</div>";
  }

  // ---------- view: branding (เทมเพลต/สี/พื้นหลัง/ลายน้ำ) ----------
  function viewBranding(el) {
    var t = tenantObj(); var tpl = t.template || {}, wm = t.watermark || {}, br = t.brand || {};
    var sel = { preset: tpl.preset || "a", background: tpl.background || "", primaryColor: br.primaryColor || accentOf(t), wmEnabled: !!wm.enabled, wmText: wm.text || "" };
    function mini(p) {
      return '<button class="wx-tplpick" data-p="' + p + '" aria-pressed="' + (p === sel.preset) + '" style="border:2px solid ' + (p === sel.preset ? "var(--wx-accent)" : "var(--c-border)") + ';border-radius:12px;padding:8px;background:none;cursor:pointer">' +
        '<div class="tpl-preview" data-template="' + p + '" style="--c-primary:' + sel.primaryColor + ';--c-action:' + sel.primaryColor + (sel.background ? ";--c-bg:" + sel.background : "") + '"><div class="tp-bar"><i></i><i></i><i></i></div><div class="tp-body"><div class="tp-h"></div><div class="tp-line"></div><div class="tp-line" style="width:78%"></div><div class="tp-cards"><div class="tp-card"></div><div class="tp-card"></div><div class="tp-card"></div></div><span class="tp-btn"></span></div></div>' +
        '<div style="margin-top:6px;font-weight:600;color:var(--c-text)">แบบ ' + p.toUpperCase() + "</div></button>";
    }
    el.innerHTML =
      '<div class="wx-card" style="margin-bottom:20px"><h2 style="margin:0 0 4px;color:var(--c-text)">เทมเพลตสำเร็จรูป (No-code)</h2>' +
      '<p style="margin:0 0 16px;color:var(--c-text-muted);font-size:var(--fs-small)">เลือกเทมเพลต ปรับสีและพื้นหลัง — พรีวิวด้านล่างอัปเดตทันที</p>' +
      '<div id="wx-tpls" style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:640px"></div></div>' +
      '<div class="a-cols">' +
      '<div class="wx-card"><h2 style="margin:0 0 14px;color:var(--c-text)">สีและพื้นหลัง</h2>' +
      '<label style="display:block;margin-bottom:6px;color:var(--c-text)">สีแบรนด์หลัก</label><input type="color" id="wx-color" value="' + esc(sel.primaryColor) + '" style="width:60px;height:38px;border:1px solid var(--c-border-strong);border-radius:8px;background:none">' +
      '<label style="display:block;margin:16px 0 6px;color:var(--c-text)">สีพื้นหลังเว็บ</label><input type="color" id="wx-bg" value="' + esc(sel.background || "#fafaf8") + '" style="width:60px;height:38px;border:1px solid var(--c-border-strong);border-radius:8px;background:none"> <button class="btn btn--ghost" id="wx-bg-reset">ใช้ค่าเริ่มต้น</button></div>' +
      '<div class="wx-card"><h2 style="margin:0 0 14px;color:var(--c-text)">ลายน้ำคลังภาพ</h2>' +
      '<label style="display:flex;gap:10px;align-items:center;color:var(--c-text);cursor:pointer"><input type="checkbox" id="wx-wm" ' + (sel.wmEnabled ? "checked" : "") + '> แสดงลายน้ำบนรูปในคลังภาพ</label>' +
      '<label style="display:block;margin:14px 0 6px;color:var(--c-text)">ข้อความลายน้ำ</label><input type="text" id="wx-wmtext" value="' + esc(sel.wmText) + '" placeholder="เช่น สพร. • DGA" style="width:100%;padding:10px 12px;border:1px solid var(--c-border-strong);border-radius:8px;background:var(--c-bg);color:var(--c-text)"></div>' +
      "</div>" +
      '<div style="margin-top:20px;display:flex;gap:10px;align-items:center"><button class="btn btn--primary" id="wx-save">บันทึกการตั้งค่า</button><span id="wx-save-msg" style="color:var(--c-success);font-size:var(--fs-small)"></span></div>';

    function repaint() {
      var box = document.getElementById("wx-tpls");
      box.innerHTML = mini("a") + mini("b") + mini("c");
      box.querySelectorAll(".wx-tplpick").forEach(function (b) { b.onclick = function () { sel.preset = b.getAttribute("data-p"); repaint(); }; });
    }
    repaint();
    document.getElementById("wx-color").oninput = function () { sel.primaryColor = this.value; repaint(); };
    document.getElementById("wx-bg").oninput = function () { sel.background = this.value; repaint(); };
    document.getElementById("wx-bg-reset").onclick = function () { sel.background = ""; document.getElementById("wx-bg").value = "#fafaf8"; repaint(); };
    document.getElementById("wx-wm").onchange = function () { sel.wmEnabled = this.checked; };
    document.getElementById("wx-wmtext").oninput = function () { sel.wmText = this.value; };
    document.getElementById("wx-save").onclick = function () {
      var msg = document.getElementById("wx-save-msg"); msg.textContent = "กำลังบันทึก…"; msg.style.color = "var(--c-text-muted)";
      api("/api/console/branding?tenant=" + encodeURIComponent(currentTenant), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: { primaryColor: sel.primaryColor }, template: { preset: sel.preset, background: sel.background }, watermark: { enabled: sel.wmEnabled, text: sel.wmText } }),
      }).then(function (r) {
        if (r && r.ok) {
          msg.textContent = "บันทึกแล้ว ✓"; msg.style.color = "var(--c-success)";
          t.template = r.template; t.watermark = r.watermark; t.brand = Object.assign(t.brand || {}, r.brand);
          document.documentElement.style.setProperty("--wx-accent", sel.primaryColor);
        } else { msg.textContent = "บันทึกไม่สำเร็จ"; msg.style.color = "var(--c-danger)"; }
      }).catch(function () { msg.textContent = "บันทึกไม่สำเร็จ"; msg.style.color = "var(--c-danger)"; });
    };
  }

  // ---------- view: users (ผู้ดูแลต่อ tenant = adminEmails) ----------
  function viewUsers(el) {
    el.innerHTML = '<p class="wx-empty">กำลังโหลด…</p>';
    api("/api/console/users?tenant=" + encodeURIComponent(currentTenant)).then(function (d) {
      if (!d || d.error) { el.innerHTML = '<p class="wx-empty">โหลดไม่สำเร็จ</p>'; return; }
      var editors = (d.tenant.adminEmails || []).map(function (e) { return String(e).toLowerCase(); });
      var rows = d.users.map(function (u) {
        var isEd = editors.indexOf(String(u.email).toLowerCase()) >= 0;
        var badge = u.active ? '<span class="wx-tile__badge wx-badge--live">ใช้งาน</span>' : '<span class="wx-tile__badge wx-badge--soon">ระงับ</span>';
        var chk = u.isSuper ? '<span class="a-top__meta">ทุกหน่วยงาน</span>'
          : '<input type="checkbox" class="wx-uchk" data-email="' + esc(u.email) + '"' + (isEd ? " checked" : "") + ' style="width:18px;height:18px">';
        return "<tr><td>" + esc(u.name || "-") + "</td><td>" + esc(u.email) + "</td><td>" + esc(u.roles) + "</td><td>" + badge + '</td><td style="text-align:center">' + chk + "</td></tr>";
      }).join("");
      el.innerHTML =
        '<div class="wx-card"><p style="margin:0 0 16px;color:var(--c-text-muted);font-size:var(--fs-small)">เลือกผู้ที่เป็น <b style="color:var(--c-text)">ผู้ดูแลเนื้อหาของ ' + esc(d.tenant.name) + '</b> — จะเห็น/แก้เฉพาะข้อมูลของหน่วยงานนี้ (per-tenant RBAC). ผู้ดูแลระบบ (Super Admin) เข้าถึงทุกหน่วยงานอยู่แล้ว.</p>' +
        '<table class="a-table"><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท</th><th>สถานะ</th><th style="text-align:center">ผู้ดูแล ' + esc(d.tenant.key) + '</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
        '<div style="margin-top:16px;display:flex;gap:10px;align-items:center"><button class="btn btn--primary" id="wx-usave">บันทึกสิทธิ์</button><span id="wx-umsg" style="font-size:var(--fs-small)"></span></div>';
      document.getElementById("wx-usave").onclick = function () {
        var emails = [].map.call(document.querySelectorAll(".wx-uchk:checked"), function (c) { return c.getAttribute("data-email"); });
        var msg = document.getElementById("wx-umsg"); msg.textContent = "กำลังบันทึก…"; msg.style.color = "var(--c-text-muted)";
        api("/api/console/users?tenant=" + encodeURIComponent(currentTenant), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminEmails: emails }) })
          .then(function (r) { if (r && r.ok) { msg.textContent = "บันทึกแล้ว ✓"; msg.style.color = "var(--c-success)"; } else { msg.textContent = "บันทึกไม่สำเร็จ"; msg.style.color = "var(--c-danger)"; } })
          .catch(function () { msg.textContent = "บันทึกไม่สำเร็จ"; msg.style.color = "var(--c-danger)"; });
      };
    }).catch(function () {});
  }

  // ---------- view: chat (Live Chat channels) ----------
  function viewChat(el) {
    var t = tenantObj();
    var channels = (((t.liveChat || {}).channels) || []).slice();
    var TYPES = [["line", "LINE"], ["messenger", "Messenger"], ["facebook", "Facebook"], ["phone", "โทรศัพท์"], ["x", "X (Twitter)"], ["other", "อื่น ๆ"]];
    var INP = 'style="padding:9px 11px;border:1px solid var(--c-border-strong);border-radius:8px;background:var(--c-bg);color:var(--c-text);font:inherit;width:100%"';
    function row(c) {
      return '<div class="wx-chatrow" style="display:grid;grid-template-columns:140px 1fr 1.4fr 42px;gap:8px;margin-bottom:8px;align-items:center">' +
        '<select class="wx-csel wx-select">' + TYPES.map(function (tp) { return '<option value="' + tp[0] + '"' + ((c.type || "line") === tp[0] ? " selected" : "") + ">" + tp[1] + "</option>"; }).join("") + "</select>" +
        '<input class="wx-clabel" ' + INP + ' value="' + esc(c.label || "") + '" placeholder="ป้ายชื่อ">' +
        '<input class="wx-curl" ' + INP + ' value="' + esc(c.url || "") + '" placeholder="URL หรือ tel:0...">' +
        '<button class="btn btn--ghost wx-cdel" aria-label="ลบ" style="min-height:38px">✕</button></div>';
    }
    function render() {
      el.innerHTML =
        '<div class="wx-card"><h2 style="margin:0 0 6px;color:var(--c-text)">ช่องทาง Live Chat / ติดต่อ</h2>' +
        '<p style="margin:0 0 16px;color:var(--c-text-muted);font-size:var(--fs-small)">ช่องทางเหล่านี้แสดงในปุ่ม “แชตสด” บนหน้าเว็บของหน่วยงาน</p>' +
        '<div id="wx-chans">' + channels.map(row).join("") + "</div>" +
        '<button class="btn btn--ghost" id="wx-cadd" style="margin-top:6px">+ เพิ่มช่องทาง</button></div>' +
        '<div style="margin-top:16px;display:flex;gap:10px;align-items:center"><button class="btn btn--primary" id="wx-csave">บันทึก</button><span id="wx-cmsg" style="font-size:var(--fs-small)"></span></div>';
      el.querySelectorAll(".wx-cdel").forEach(function (b, i) { b.onclick = function () { collect(); channels.splice(i, 1); render(); }; });
      document.getElementById("wx-cadd").onclick = function () { collect(); channels.push({ type: "line", label: "", url: "" }); render(); };
      document.getElementById("wx-csave").onclick = function () {
        collect();
        var msg = document.getElementById("wx-cmsg"); msg.textContent = "กำลังบันทึก…"; msg.style.color = "var(--c-text-muted)";
        api("/api/console/branding?tenant=" + encodeURIComponent(currentTenant), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ liveChat: { channels: channels.filter(function (c) { return c.url || c.label; }) } }) })
          .then(function (r) { if (r && r.ok) { msg.textContent = "บันทึกแล้ว ✓"; msg.style.color = "var(--c-success)"; t.liveChat = r.liveChat; } else { msg.textContent = "บันทึกไม่สำเร็จ"; msg.style.color = "var(--c-danger)"; } })
          .catch(function () { msg.textContent = "บันทึกไม่สำเร็จ"; msg.style.color = "var(--c-danger)"; });
      };
    }
    function collect() {
      var out = [];
      el.querySelectorAll(".wx-chatrow").forEach(function (r) {
        out.push({ type: r.querySelector(".wx-csel").value, label: r.querySelector(".wx-clabel").value, url: r.querySelector(".wx-curl").value });
      });
      channels = out;
    }
    render();
  }

  // ---------- view: soon ----------
  function viewSoon(el, m) {
    el.innerHTML = '<div class="wx-card wx-empty"><div class="wx-tile__ic" style="margin:0 auto 14px">' + ic(m ? m.icon : "i-grid") + "</div>" +
      "<h2 style=\"color:var(--c-text);margin:0 0 6px\">" + esc(m ? m.label : "") + "</h2>" +
      "<p>โมดูลนี้กำลังพัฒนา — จะเปิดใช้งานในรุ่นถัดไป</p></div>";
  }

  // ---------- boot ----------
  function boot() {
    if (!tok()) { renderLogin(); return; }
    api("/api/console/context").then(function (d) {
      if (!d || !d.tenants) { renderLogin("ไม่พบสิทธิ์เข้าถึง"); return; }
      ctxData = d;
      try { var saved = sessionStorage.getItem("wx-tenant"); } catch (e) {}
      var keys = d.tenants.map(function (t) { return t.key; });
      currentTenant = (saved && keys.indexOf(saved) >= 0) ? saved : (keys[0] || "");
      if (!d.tenants.length) { app.className = ""; app.innerHTML = '<p class="wx-empty">บัญชีนี้ไม่ได้ผูกกับหน่วยงานใด</p>'; return; }
      renderShell();
    }).catch(function () {});
  }

  window.addEventListener("hashchange", route);
  boot();
})();
