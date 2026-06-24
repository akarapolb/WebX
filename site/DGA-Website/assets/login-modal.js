/* =====================================================================
   login-modal.js — popup เข้าสู่ระบบ (โหลดทุกหน้าโดย home.js)
   เปิดจากปุ่ม .btn-login (เฮดเดอร์) และปุ่มเข้าสู่ระบบใน drawer
   คงหน้า /login.html เป็น fallback กรณีปิด JS · รองรับ th/en
   ===================================================================== */
(function () {
  'use strict';
  if (window.__lgmInit) return; window.__lgmInit = true;

  var LANG = document.documentElement.lang === 'en' ? 'en' : 'th';
  var THAID = '/assets/image/smp_thaid_logo.png';

  var T = {
    th: { title:'เข้าสู่ระบบ', sub:'เข้าใช้บริการดิจิทัลของ สพร. ด้วย ThaID หรือบัญชีผู้ใช้งานระบบ',
      withThaid:'เข้าสู่ระบบด้วย ThaID', hint:'ยืนยันตัวตนผ่านแอป ThaID — ปลอดภัยตามมาตรฐานการพิสูจน์ตัวตนภาครัฐ',
      or:'หรือ', user:'ชื่อผู้ใช้ หรือ อีเมล', pass:'รหัสผ่าน', passPh:'รหัสผ่านของคุณ',
      remember:'จดจำฉันไว้', forgot:'ลืมรหัสผ่าน?', noAcc:'ยังไม่มีบัญชี?', register:'ลงทะเบียนผู้ใช้งานระบบ', regHref:'/register.html',
      note:'ปลอดภัยและคุ้มครองข้อมูลตามมาตรฐาน PDPA',
      okTitle:'เข้าสู่ระบบสำเร็จ', okText:'ยินดีต้อนรับกลับ — กำลังพาคุณไปยังหน้าบริการของ สพร.', goHome:'ไปยังหน้าแรก', homeHref:'/index.html',
      close:'ปิด', show:'แสดงรหัสผ่าน', hide:'ซ่อนรหัสผ่าน', connecting:'กำลังเชื่อมต่อ ThaID…',
      vUser:'กรุณากรอกชื่อผู้ใช้หรืออีเมล', vPass:'กรุณากรอกรหัสผ่าน', vPassShort:'รหัสผ่านอย่างน้อย 6 ตัวอักษร',
      brandTitle:'บริการดิจิทัลภาครัฐ เพื่อประชาชน', brandSub:'สะดวก ปลอดภัย ครบในที่เดียว',
      pt1:'ยืนยันตัวตนด้วย ThaID', pt2:'ติดตามคำขอและใบสมัครได้ทุกที่', pt3:'ปลอดภัยตามมาตรฐาน PDPA',
      tbadge:'' },
    en: { title:'Sign in', sub:'Access DGA digital services with ThaID or your system account.',
      withThaid:'Sign in with ThaID', hint:'Verify your identity via the ThaID app — secure to the national digital identity standard.',
      or:'or', user:'Username or email', pass:'Password', passPh:'Your password',
      remember:'Remember me', forgot:'Forgot password?', noAcc:'Don’t have an account?', register:'Register a user account', regHref:'/en/register.html',
      note:'Secure and protected under the PDPA',
      okTitle:'Signed in successfully', okText:'Welcome back — taking you to the DGA services.', goHome:'Go to homepage', homeHref:'/en/index.html',
      close:'Close', show:'Show password', hide:'Hide password', connecting:'Connecting to ThaID…',
      vUser:'Please enter your username or email', vPass:'Please enter your password', vPassShort:'Password must be at least 6 characters',
      brandTitle:'Digital government services', brandSub:'Simple, secure, all in one place.',
      pt1:'Verify with ThaID', pt2:'Track requests and applications anytime', pt3:'Protected under the PDPA',
      tbadge:'' }
  }[LANG];

  var P = {
    x:'<path d="M6 6l12 12M18 6 6 18"/>',
    login:'<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M5 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff:'<path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A9.5 9.5 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.3 3.9M6.1 6.1A17 17 0 0 0 2 12s4 7 10 7a9.5 9.5 0 0 0 3-.5"/>',
    shield:'<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
    check:'<path d="m5 12 5 5 9-10"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    account:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3.2"/><path d="M6.3 18.4a6 6 0 0 1 11.4 0"/>'
  };
  function svg(inner, attrs){ return '<svg viewBox="0 0 24 24" ' + (attrs || '') + '>' + inner + '</svg>'; }

  /* ---- สร้าง modal ครั้งเดียว ---- */
  var overlay = document.createElement('div');
  overlay.className = 'lgm-overlay';
  overlay.innerHTML =
    '<div class="lgm-dialog" role="dialog" aria-modal="true" aria-labelledby="lgmTitle">' +
      '<button class="lgm-close" type="button" aria-label="' + T.close + '">' + svg(P.x) + '</button>' +
      '<aside class="lgm-brand" aria-hidden="true"><div class="lgm-brand-in">' +
        '<h3>' + T.brandTitle + '</h3>' +
        '<p>' + T.brandSub + '</p>' +
        '<ul class="lgm-pts">' +
          '<li><span class="ic">' + svg(P.check) + '</span> ' + T.pt1 + '</li>' +
          '<li><span class="ic">' + svg(P.check) + '</span> ' + T.pt2 + '</li>' +
          '<li><span class="ic">' + svg(P.check) + '</span> ' + T.pt3 + '</li>' +
        '</ul>' +
      '</div></aside>' +
      '<div class="lgm-form-side">' +
      '<div id="lgmMain">' +
        '<div class="lgm-head"><h2 id="lgmTitle">' + T.title + '</h2></div>' +
        '<button type="button" class="lgm-thaid" id="lgmThaid"><img src="' + THAID + '" alt=""> ' + T.withThaid + '</button>' +
        '<div class="lgm-or">' + T.or + '</div>' +
        '<form id="lgmForm" novalidate>' +
          '<div class="lgm-field"><label for="lgmUser">' + T.user + '</label>' +
            '<div class="lgm-ic">' + svg(P.user, 'class="lgm-lead"') + '<input class="input" id="lgmUser" type="text" autocomplete="username" placeholder="name@example.com"></div>' +
            '<p class="lgm-err" id="lgmErrUser" hidden></p></div>' +
          '<div class="lgm-field"><label for="lgmPass">' + T.pass + '</label>' +
            '<div class="lgm-ic has-toggle">' + svg(P.lock, 'class="lgm-lead"') +
              '<input class="input" id="lgmPass" type="password" autocomplete="current-password" placeholder="' + T.passPh + '">' +
              '<button type="button" class="lgm-toggle" id="lgmToggle" aria-label="' + T.show + '">' + svg(P.eye) + '</button></div>' +
            '<p class="lgm-err" id="lgmErrPass" hidden></p></div>' +
          '<div class="lgm-row"><label><input type="checkbox"> ' + T.remember + '</label><a href="#">' + T.forgot + '</a></div>' +
          '<button type="submit" class="btn btn--primary lgm-submit">' + svg(P.login) + ' ' + T.title + '</button>' +
        '</form>' +
        '<p class="lgm-foot">' + T.noAcc + ' <a href="' + T.regHref + '">' + T.register + '</a></p>' +
        '<p class="lgm-note">' + svg(P.shield) + ' ' + T.note + '</p>' +
      '</div>' +
      '<div class="lgm-ok" id="lgmOk" role="status" aria-live="polite">' +
        '<span class="ok-ic">' + svg(P.check) + '</span><h2>' + T.okTitle + '</h2><p>' + T.okText + '</p>' +
        '<a class="btn btn--primary lgm-submit" href="' + T.homeHref + '">' + T.goHome + '</a></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var dialog = overlay.querySelector('.lgm-dialog');
  var main = overlay.querySelector('#lgmMain');
  var ok = overlay.querySelector('#lgmOk');
  var form = overlay.querySelector('#lgmForm');
  var user = overlay.querySelector('#lgmUser'), pass = overlay.querySelector('#lgmPass');
  var eu = overlay.querySelector('#lgmErrUser'), ep = overlay.querySelector('#lgmErrPass');
  var toggle = overlay.querySelector('#lgmToggle');
  var thaid = overlay.querySelector('#lgmThaid');
  var lastFocus = null;

  function setErr(el, input, msg){ el.textContent = msg; el.hidden = !msg; if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false'); }
  function reset(){
    main.style.display = ''; ok.classList.remove('is-on');
    thaid.disabled = false; thaid.innerHTML = '<img src="' + THAID + '" alt=""> ' + T.withThaid;
    setErr(eu, user, ''); setErr(ep, pass, ''); form.reset();
    pass.type = 'password'; toggle.setAttribute('aria-label', T.show); toggle.innerHTML = svg(P.eye);
  }
  function open(){
    reset();
    lastFocus = document.activeElement;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(function(){ thaid.focus(); }, 50);
  }
  function close(){
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function success(){ main.style.display = 'none'; ok.classList.add('is-on'); ok.querySelector('a').focus(); }

  /* ---- เปิดจากปุ่มเข้าสู่ระบบ (เฮดเดอร์ + drawer) ---- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a, button');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var isTrigger = a.classList.contains('btn-login') ||
      (a.tagName === 'A' && /(^|\/)(en\/)?login\.html$/.test(href) && !a.closest('.lang-switch'));
    if (!isTrigger) return;
    e.preventDefault();
    open();
  });

  /* ---- ปิด ---- */
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  overlay.querySelector('.lgm-close').addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {
      var f = dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled])');
      f = Array.prototype.filter.call(f, function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---- ฟังก์ชันฟอร์ม ---- */
  toggle.addEventListener('click', function () {
    var show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-label', show ? T.hide : T.show);
    toggle.innerHTML = svg(show ? P.eyeoff : P.eye);
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var good = true;
    if (!user.value.trim()) { setErr(eu, user, T.vUser); good = false; } else setErr(eu, user, '');
    if (!pass.value) { setErr(ep, pass, T.vPass); good = false; }
    else if (pass.value.length < 6) { setErr(ep, pass, T.vPassShort); good = false; }
    else setErr(ep, pass, '');
    if (!good) { (user.value.trim() ? pass : user).focus(); return; }
    success();
  });
  thaid.addEventListener('click', function () {
    thaid.disabled = true;
    thaid.innerHTML = '<span class="lgm-spin" aria-hidden="true"></span> ' + T.connecting;
    setTimeout(success, 1500);
  });
})();
