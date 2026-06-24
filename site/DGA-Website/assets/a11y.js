/* =====================================================================
   a11y.js — วิดเจ็ตช่วยการเข้าถึง (Accessibility Widget) · WCAG 2.1 AA
   - ปุ่มลอย + แผงตั้งค่า (สร้างเอง) · บันทึกค่าใน localStorage
   - ปรับขนาดอักษร / คอนทราสต์ / อ่านง่าย / เน้นลิงก์-หัวข้อ / ระยะบรรทัด
     / อ่านออกเสียง (TTS) / ลดการเคลื่อนไหว / เคอร์เซอร์ใหญ่
   - คีย์บอร์ดครบ · role=switch/aria-pressed · aria-live ประกาศสถานะ
   - รองรับ 2 ภาษา (อ่านจาก <html lang>)
   ===================================================================== */
(function () {
  'use strict';
  if (window.__dgaA11y) return; window.__dgaA11y = true;
  var LANG = document.documentElement.lang === 'en' ? 'en' : 'th';
  var KEY = 'dga-a11y';
  var root = document.documentElement;

  var T = {
    th: {
      open: 'ช่วยการเข้าถึง', title: 'ช่วยการเข้าถึง', sub: 'ปรับเว็บไซต์ให้เหมาะกับคุณ ใช้งานง่าย สบายตาขึ้น', close: 'ปิด',
      quick: 'ทางลัดด่วน', biggerFont: 'เพิ่มขนาดตัวอักษร', contrast: 'คอนทราสต์สูง', reduceMotion: 'ลดการเคลื่อนไหว', reading: 'โหมดอ่านง่าย',
      fontSize: 'ขนาดตัวอักษร', small: 'เล็ก', normal: 'ปกติ', large: 'ใหญ่',
      colorMode: 'โหมดการแสดงผล (สี)', cmDefault: 'ปกติ', cmDark: 'โหมดมืด', cmContrast: 'คอนทราสต์สูง',
      display: 'การแสดงผล', links: 'เน้นลิงก์', headings: 'เน้นหัวข้อ', spacing: 'เพิ่มระยะห่างบรรทัด',
      readHelp: 'ช่วยการอ่าน', tts: 'อ่านออกเสียง',
      motionSec: 'การเคลื่อนไหวและการโต้ตอบ', bigCursor: 'เคอร์เซอร์ใหญ่',
      reset: 'รีเซ็ต', save: 'บันทึกการตั้งค่า',
      on: 'เปิด', off: 'ปิด', saved: 'บันทึกการตั้งค่าแล้ว', resetDone: 'รีเซ็ตการตั้งค่าแล้ว',
      ttsHint: 'แตะที่ข้อความเพื่อฟังเสียงอ่าน',
      ttsConfirm: 'เปิดโหมดอ่านออกเสียงแล้ว แตะข้อความที่ต้องการฟัง',
      ttsUnsupported: 'เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง'
    },
    en: {
      open: 'Accessibility', title: 'Accessibility', sub: 'Adjust the site to suit you — easier and clearer to use.', close: 'Close',
      quick: 'Quick actions', biggerFont: 'Bigger text', contrast: 'High contrast', reduceMotion: 'Reduce motion', reading: 'Reading mode',
      fontSize: 'Text size', small: 'Small', normal: 'Normal', large: 'Large',
      colorMode: 'Display mode', cmDefault: 'Default', cmDark: 'Dark', cmContrast: 'High contrast',
      display: 'Display', links: 'Highlight links', headings: 'Highlight headings', spacing: 'Increase line spacing',
      readHelp: 'Reading help', tts: 'Read aloud',
      motionSec: 'Motion & interaction', bigCursor: 'Big cursor',
      reset: 'Reset', save: 'Save settings',
      on: 'on', off: 'off', saved: 'Settings saved', resetDone: 'Settings reset',
      ttsHint: 'Tap any text to hear it read aloud',
      ttsConfirm: 'Read aloud is on. Tap any text to hear it.',
      ttsUnsupported: 'This browser does not support read-aloud.'
    }
  }[LANG];

  var DEFAULTS = { font: 'normal', colormode: 'default', reading: false, links: false, headings: false, spacing: false, tts: false, motion: false, cursor: false };
  var S = load();

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
    // เชื่อมกับค่าที่ระบบเดิมใช้ (แถบบน/โหมดมืด)
    if (!('colormode' in s)) {
      if (localStorage.getItem('dga-contrast') === 'high') s.colormode = 'contrast';
      else if (localStorage.getItem('dga-theme') === 'dark' || root.getAttribute('data-theme') === 'dark') s.colormode = 'dark';
      else s.colormode = 'default';
    }
    var fs = localStorage.getItem('dga-fontscale');
    if (fs === '112.5%') s.font = 'large'; else if (fs === '90%') s.font = 'small';
    var out = {}; for (var k in DEFAULTS) out[k] = (k in s) ? s[k] : DEFAULTS[k];
    return out;
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
      var fs = S.font === 'large' ? '112.5%' : S.font === 'small' ? '90%' : '';
      if (fs) localStorage.setItem('dga-fontscale', fs); else localStorage.removeItem('dga-fontscale');
    } catch (e) {}
  }

  /* ใช้โหมดสี (ปกติ/มืด/คอนทราสต์สูง) + sync ระบบเดิม + ปุ่มโหมดมืดบน header */
  function applyColor() {
    var m = S.colormode;
    if (m === 'dark') { root.setAttribute('data-theme', 'dark'); root.removeAttribute('data-contrast'); }
    else if (m === 'contrast') { root.setAttribute('data-theme', 'light'); root.setAttribute('data-contrast', 'high'); }
    else { root.setAttribute('data-theme', 'light'); root.removeAttribute('data-contrast'); }
    try {
      localStorage.setItem('dga-theme', m === 'dark' ? 'dark' : 'light');
      if (m === 'contrast') localStorage.setItem('dga-contrast', 'high'); else localStorage.removeItem('dga-contrast');
    } catch (e) {}
    var tb = document.getElementById('themeBtn');
    if (tb) { var d = m === 'dark'; tb.setAttribute('aria-pressed', String(d)); var u = tb.querySelector('use'); if (u) u.setAttribute('href', d ? '#i-sun' : '#i-moon'); }
  }

  /* ---------- ใช้ค่ากับหน้าเว็บ ---------- */
  function apply() {
    root.style.fontSize = S.font === 'large' ? '112.5%' : S.font === 'small' ? '90%' : '';
    setAttr('data-a11y-reading', S.reading ? 'on' : null);
    setAttr('data-a11y-links', S.links ? 'on' : null);
    setAttr('data-a11y-headings', S.headings ? 'on' : null);
    setAttr('data-a11y-spacing', S.spacing ? 'on' : null);
    setAttr('data-a11y-motion', S.motion ? 'reduce' : null);
    setAttr('data-a11y-cursor', S.cursor ? 'big' : null);
  }
  function setAttr(a, v) { if (v == null) root.removeAttribute(a); else root.setAttribute(a, v); }
  apply(); // ใช้ทันทีลดการกระพริบ

  /* ---------- สร้าง DOM ---------- */
  var svg = {
    access: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="4" r="2"/><path d="M21 9c-3 1-6 1.5-9 1.5S6 10 3 9" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M12 9v6m0 0-3 6m3-6 3 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M19 17H6"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
    motion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h6l2-7 4 14 2-7h4"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6" stroke-linecap="round"/></svg>',
    cursor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3l13 6.5-5.4 1.4L9 18z"/></svg>'
  };

  function row(id, icon, label) {
    return '<div class="a11y-row"><span class="a11y-row__ic" aria-hidden="true">' + icon + '</span>' +
      '<span class="a11y-row__label" id="' + id + '-l">' + label + '</span>' +
      '<button type="button" class="a11y-sw" role="switch" aria-checked="false" data-toggle="' + id + '" aria-labelledby="' + id + '-l"></button></div>';
  }
  function sec(title, body) {
    return '<div class="a11y-sec"><button type="button" class="a11y-sec__head" aria-expanded="true">' + title + svg.chev + '</button>' +
      '<div class="a11y-sec__body">' + body + '</div></div>';
  }
  function mode(m, cls, label) {
    return '<button type="button" class="a11y-mode" data-mode="' + m + '" aria-pressed="false">' +
      '<span class="a11y-mode__sw ' + cls + '" aria-hidden="true"></span><span>' + label + '</span></button>';
  }

  var panelHTML =
    '<div class="a11y-head"><span class="a11y-head__ic" aria-hidden="true">' + svg.access + '</span>' +
    '<div class="a11y-head__tx"><h2 id="a11yTitle">' + T.title + '</h2><p>' + T.sub + '</p></div>' +
    '<button type="button" class="a11y-close" id="a11yClose" aria-label="' + T.close + '">' + svg.x + '</button></div>' +
    '<div class="a11y-body">' +
      sec(T.quick,
        '<div class="a11y-quick">' +
          '<button type="button" class="a11y-qbtn" data-quick="font" aria-pressed="false"><b>A+</b><span>' + T.biggerFont + '</span></button>' +
          '<button type="button" class="a11y-qbtn" data-quick="contrast" aria-pressed="false">' + svg.eye + '<span>' + T.contrast + '</span></button>' +
          '<button type="button" class="a11y-qbtn" data-toggle="motion" data-quick aria-pressed="false">' + svg.spark + '<span>' + T.reduceMotion + '</span></button>' +
          '<button type="button" class="a11y-qbtn" data-toggle="reading" data-quick aria-pressed="false">' + svg.book + '<span>' + T.reading + '</span></button>' +
        '</div>') +
      sec(T.colorMode,
        '<div class="a11y-modes" role="group" aria-label="' + T.colorMode + '">' +
          mode('default', 'sw-default', T.cmDefault) +
          mode('dark', 'sw-dark', T.cmDark) +
          mode('contrast', 'sw-contrast', T.cmContrast) +
        '</div>') +
      sec(T.fontSize,
        '<div class="a11y-seg" role="group" aria-label="' + T.fontSize + '">' +
          '<button type="button" data-font="small" aria-pressed="false">' + T.small + '</button>' +
          '<button type="button" data-font="normal" aria-pressed="false">' + T.normal + '</button>' +
          '<button type="button" data-font="large" aria-pressed="false">' + T.large + '</button>' +
        '</div>') +
      sec(T.display,
        row('reading', svg.book, T.reading) +
        row('links', svg.link, T.links) +
        row('headings', '<b>T</b>', T.headings) +
        row('spacing', '<b>A=</b>', T.spacing)) +
      sec(T.readHelp, row('tts', svg.speaker, T.tts)) +
      sec(T.motionSec, row('motion', svg.motion, T.reduceMotion) + row('cursor', svg.cursor, T.bigCursor)) +
    '</div>' +
    '<div class="a11y-foot"><button type="button" class="a11y-reset" id="a11yReset">↺ ' + T.reset + '</button>' +
    '<button type="button" class="a11y-save" id="a11ySave">✓ ' + T.save + '</button></div>';

  function build() {
    var fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'a11y-fab'; fab.id = 'a11yFab';
    fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-controls', 'a11yPanel');
    fab.setAttribute('aria-label', T.open);
    fab.innerHTML = '<span class="a11y-fab__ic" aria-hidden="true">' + svg.access + '</span><span class="a11y-fab__tx">' + T.open + '</span>';

    var backdrop = document.createElement('div'); backdrop.className = 'a11y-backdrop'; backdrop.id = 'a11yBackdrop';
    var panel = document.createElement('div');
    panel.className = 'a11y-panel'; panel.id = 'a11yPanel';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'a11yTitle'); panel.setAttribute('aria-modal', 'false');
    panel.hidden = false; panel.innerHTML = panelHTML;

    var live = document.createElement('div'); live.id = 'a11yLive'; live.setAttribute('aria-live', 'polite'); live.className = 'visually-hidden';
    live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';

    document.body.appendChild(fab); document.body.appendChild(backdrop); document.body.appendChild(panel); document.body.appendChild(live);
    return { fab: fab, panel: panel, backdrop: backdrop, live: live };
  }

  function init() {
    var el = build();
    var fab = el.fab, panel = el.panel, backdrop = el.backdrop, live = el.live;
    var lastFocus = null;
    var announce = function (m) { live.textContent = ''; setTimeout(function () { live.textContent = m; }, 30); };

    /* เปิด/ปิด */
    function open() {
      lastFocus = document.activeElement;
      panel.classList.add('open'); backdrop.classList.add('open');
      fab.setAttribute('aria-expanded', 'true'); fab.style.display = 'none';
      panel.querySelector('#a11yClose').focus();
    }
    function close() {
      panel.classList.remove('open'); backdrop.classList.remove('open');
      fab.setAttribute('aria-expanded', 'false'); fab.style.display = '';
      (lastFocus || fab).focus();
    }
    fab.addEventListener('click', open);
    panel.querySelector('#a11yClose').addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });
    // focus trap
    panel.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = panel.querySelectorAll('button:not([disabled])');
      if (!f.length) return; var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    /* sync UI กับสถานะ */
    function syncUI() {
      panel.querySelectorAll('[data-toggle]').forEach(function (b) {
        var on = !!S[b.getAttribute('data-toggle')];
        if (b.hasAttribute('role')) b.setAttribute('aria-checked', on ? 'true' : 'false');
        else b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      panel.querySelectorAll('[data-font]').forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-font') === S.font ? 'true' : 'false');
      });
      var fq = panel.querySelector('[data-quick="font"]');
      if (fq) fq.setAttribute('aria-pressed', S.font === 'large' ? 'true' : 'false');
      // โหมดสี: อ่านสถานะจริง (เผื่อสลับมาจากปุ่มโหมดมืด/แถบบน)
      var cm = root.getAttribute('data-contrast') === 'high' ? 'contrast' : (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'default');
      S.colormode = cm;
      panel.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === cm ? 'true' : 'false'); });
      var cq = panel.querySelector('[data-quick="contrast"]');
      if (cq) cq.setAttribute('aria-pressed', cm === 'contrast' ? 'true' : 'false');
    }
    function setMode(m) {
      S.colormode = m; applyColor(); save(); syncUI();
      announce(T.colorMode + ': ' + (m === 'dark' ? T.cmDark : m === 'contrast' ? T.cmContrast : T.cmDefault));
    }

    /* toggle รายการ */
    function setToggle(name, val) {
      S[name] = (val == null) ? !S[name] : val;
      apply(); save(); syncUI();
      if (name === 'tts') setTTS(S.tts);
      var label = { contrast: T.contrast, reading: T.reading, links: T.links, headings: T.headings, spacing: T.spacing, tts: T.tts, motion: T.reduceMotion, cursor: T.bigCursor }[name] || name;
      announce(label + ' ' + (S[name] ? T.on : T.off));
    }

    panel.addEventListener('click', function (e) {
      var md = e.target.closest('[data-mode]'); if (md) { setMode(md.getAttribute('data-mode')); return; }
      var cq = e.target.closest('[data-quick="contrast"]'); if (cq) { setMode(S.colormode === 'contrast' ? 'default' : 'contrast'); return; }
      var tg = e.target.closest('[data-toggle]'); if (tg) { setToggle(tg.getAttribute('data-toggle')); return; }
      var fbtn = e.target.closest('[data-font]'); if (fbtn) { S.font = fbtn.getAttribute('data-font'); apply(); save(); syncUI(); announce(T.fontSize + ': ' + T[S.font]); return; }
      var fq = e.target.closest('[data-quick="font"]'); if (fq) { S.font = S.font === 'large' ? 'normal' : 'large'; apply(); save(); syncUI(); announce(T.fontSize + ': ' + T[S.font]); return; }
      var sh = e.target.closest('.a11y-sec__head'); if (sh) { var ex = sh.getAttribute('aria-expanded') === 'true'; sh.setAttribute('aria-expanded', ex ? 'false' : 'true'); return; }
    });

    panel.querySelector('#a11yReset').addEventListener('click', function () {
      S = JSON.parse(JSON.stringify(DEFAULTS)); apply(); applyColor(); save(); syncUI(); setTTS(false); announce(T.resetDone);
    });
    panel.querySelector('#a11ySave').addEventListener('click', function () { save(); announce(T.saved); close(); });

    /* ---------- อ่านออกเสียง (TTS) ---------- */
    var ttsOn = false, toast = null;
    var hasTTS = ('speechSynthesis' in window);
    if (hasTTS) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = function () {}; } catch (e) {} }

    function showToast(msg) {
      if (!toast) { toast = document.createElement('div'); toast.className = 'a11y-toast'; toast.setAttribute('role', 'status'); document.body.appendChild(toast); }
      toast.textContent = '🔊 ' + msg; toast.classList.add('show');
      clearTimeout(toast._t); toast._t = setTimeout(function () { toast.classList.remove('show'); }, 4500);
    }
    function clearHL() { document.querySelectorAll('.a11y-reading-now').forEach(function (x) { x.classList.remove('a11y-reading-now'); }); }
    function pickVoice() {
      var vs = (hasTTS && speechSynthesis.getVoices()) || []; var p = LANG === 'en' ? 'en' : 'th';
      return vs.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(p) === 0; })[0] || null;
    }
    function speakText(txt, el) {
      if (!hasTTS || !txt) return;
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(txt); u.lang = LANG === 'en' ? 'en-US' : 'th-TH';
      var v = pickVoice(); if (v) u.voice = v;
      if (el) { clearHL(); el.classList.add('a11y-reading-now'); u.onend = u.onerror = function () { el.classList.remove('a11y-reading-now'); }; }
      setTimeout(function () { speechSynthesis.speak(u); }, 60);
    }
    function ttsClick(e) {
      var t = e.target.closest('p,h1,h2,h3,h4,h5,li,a,button,label,dd,dt,td,th,figcaption,blockquote,span,strong');
      if (!t || panel.contains(t) || fab.contains(t) || (toast && toast.contains(t))) return;
      var txt = (t.textContent || '').trim(); if (!txt || txt.length > 700) return;
      if (t.matches('a,button')) e.preventDefault(); // อ่านแทนการนำทาง
      speakText(txt, t);
    }
    function setTTS(on) {
      if (on === ttsOn) return;
      if (on && !hasTTS) { showToast(T.ttsUnsupported); S.tts = false; save(); syncUI(); return; }
      ttsOn = on;
      if (on) {
        document.addEventListener('click', ttsClick, true);
        document.body.classList.add('a11y-tts-on');
        showToast(T.ttsHint); announce(T.ttsHint);
        speakText(T.ttsConfirm); // ออกเสียงยืนยันทันที (มี action ให้รับรู้)
      } else {
        document.removeEventListener('click', ttsClick, true);
        document.body.classList.remove('a11y-tts-on');
        if (hasTTS) speechSynthesis.cancel(); clearHL();
        if (toast) toast.classList.remove('show');
      }
    }

    syncUI();
    if (S.tts) setTTS(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
