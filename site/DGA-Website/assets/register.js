/* =====================================================================
   register.js — ลงทะเบียนผู้ใช้งานระบบ (wizard 3 ขั้นตอน, เดโมฝั่ง client)
   - ตรวจสอบต่อขั้นตอน + สรุป error + โฟกัสช่องผิด (WCAG)
   - วัดความแข็งแรงรหัสผ่าน · ตรวจเลขบัตรประชาชน 13 หลัก (checksum จริง)
   - ยืนยันตัวตนด้วย ThaID (จำลอง) · สร้างบัญชี + popup
   - รองรับ 2 ภาษา: อ่านจาก <html lang> (th/en)
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const LANG = document.documentElement.lang === 'en' ? 'en' : 'th';

  const DICT = {
    th: {
      required: 'กรุณากรอกข้อมูล',
      selectType: 'กรุณาเลือกประเภทผู้ใช้งาน',
      email: 'กรุณากรอกอีเมล',
      emailInvalid: 'รูปแบบอีเมลไม่ถูกต้อง',
      passReq: 'กรุณาตั้งรหัสผ่าน',
      passWeak: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว และผสมตัวอักษร/ตัวเลข',
      pass2: 'กรุณายืนยันรหัสผ่าน',
      passMatch: 'รหัสผ่านไม่ตรงกัน',
      first: 'กรุณากรอกชื่อ',
      last: 'กรุณากรอกนามสกุล',
      nid: 'กรุณากรอกเลขประจำตัวประชาชน',
      nidInvalid: 'เลขประจำตัวประชาชนไม่ถูกต้อง (13 หลัก)',
      phone: 'กรุณากรอกเบอร์โทรศัพท์',
      phoneInvalid: 'รูปแบบเบอร์โทรไม่ถูกต้อง',
      terms: 'กรุณายอมรับเงื่อนไขการใช้บริการ',
      consent: 'กรุณายินยอมตามนโยบาย PDPA',
      strength: ['', 'อ่อนมาก', 'พอใช้', 'ดี', 'แข็งแรง'],
      strengthPre: 'ความแข็งแรง: ',
      thaidConnected: 'เชื่อมต่อ ThaID แล้ว',
      thaidBadgeOk: 'ยืนยันแล้ว',
      reviewThaID: 'ยืนยันด้วย ThaID',
      reviewManual: 'กรอกข้อมูลด้วยตนเอง',
      none: '—',
      labels: { utype: 'ประเภทผู้ใช้งาน', email: 'อีเมล', password: 'รหัสผ่าน', password2: 'ยืนยันรหัสผ่าน', first: 'ชื่อ', last: 'นามสกุล', nid: 'เลขประจำตัวประชาชน', phone: 'เบอร์โทรศัพท์', terms: 'เงื่อนไขการใช้บริการ', consent: 'การยินยอม PDPA' }
    },
    en: {
      required: 'This field is required',
      selectType: 'Please select a user type',
      email: 'Please enter your email',
      emailInvalid: 'Invalid email format',
      passReq: 'Please set a password',
      passWeak: 'Password must be at least 8 characters and mix letters/numbers',
      pass2: 'Please confirm your password',
      passMatch: 'Passwords do not match',
      first: 'Please enter your first name',
      last: 'Please enter your last name',
      nid: 'Please enter your national ID',
      nidInvalid: 'Invalid national ID number (13 digits)',
      phone: 'Please enter your phone number',
      phoneInvalid: 'Invalid phone number format',
      terms: 'Please accept the terms of service',
      consent: 'Please accept the PDPA policy',
      strength: ['', 'Very weak', 'Fair', 'Good', 'Strong'],
      strengthPre: 'Strength: ',
      thaidConnected: 'ThaID connected',
      thaidBadgeOk: 'Verified',
      reviewThaID: 'Verified with ThaID',
      reviewManual: 'Entered manually',
      none: '—',
      labels: { utype: 'User type', email: 'Email', password: 'Password', password2: 'Confirm password', first: 'First name', last: 'Last name', nid: 'National ID', phone: 'Phone', terms: 'Terms of service', consent: 'PDPA consent' }
    }
  };
  const T = DICT[LANG];

  /* ---------- helpers ---------- */
  function setError(input, msg) {
    input.setAttribute('aria-invalid', 'true');
    const el = document.getElementById(input.id + '-err');
    if (el) el.textContent = msg;
  }
  function clearError(input) {
    input.removeAttribute('aria-invalid');
    const el = document.getElementById(input.id + '-err');
    if (el) el.textContent = '';
  }
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const phoneOk = v => /^[0-9+\-\s()]{6,20}$/.test(v.trim());

  // เลขบัตรประชาชน: ตรวจ checksum หลักที่ 13
  function nidOk(id) {
    id = (id || '').replace(/\D/g, '');
    if (!/^\d{13}$/.test(id)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(id[i], 10) * (13 - i);
    return (11 - (sum % 11)) % 10 === parseInt(id[12], 10);
  }
  function nidCheckDigit(b12) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(b12[i], 10) * (13 - i);
    return (11 - (sum % 11)) % 10;
  }
  // คะแนนความแข็งแรงรหัสผ่าน 0–4
  function pwScore(v) {
    let s = 0;
    if (v.length >= 8) s++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
    if (/\d/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    return s;
  }

  // ปุ่ม "ถาม DGA Guide" ในแผงข้าง → เปิดแผงผู้ช่วย (คลิกปุ่มลอย)
  $('#sideAskGuide')?.addEventListener('click', () => document.getElementById('aiBtn')?.click());

  const form = $('#regForm');
  if (!form) return;
  let verified = false; // ยืนยันด้วย ThaID แล้วหรือยัง

  /* ====================================================================
     Password meter + toggle
     ==================================================================== */
  const pass = $('#rPass'), pass2 = $('#rPass2');
  const pwBar = $('#pwBar'), pwStrength = $('#pwStrength');
  const reqEls = { len: $('[data-req="len"]'), case: $('[data-req="case"]'), num: $('[data-req="num"]'), sym: $('[data-req="sym"]') };
  pass.addEventListener('input', () => {
    const v = pass.value;
    reqEls.len.classList.toggle('ok', v.length >= 8);
    reqEls.case.classList.toggle('ok', /[a-z]/.test(v) && /[A-Z]/.test(v));
    reqEls.num.classList.toggle('ok', /\d/.test(v));
    reqEls.sym.classList.toggle('ok', /[^A-Za-z0-9]/.test(v));
    const s = v ? pwScore(v) : 0;
    pwBar.className = 'pw-meter__bar' + (s ? ' s' + s : '');
    pwStrength.className = 'pw-strength' + (s ? ' s' + s : '');
    pwStrength.textContent = v ? T.strengthPre + T.strength[s] : '';
    clearError(pass);
  });
  $('#pwToggle').addEventListener('click', () => {
    const btn = $('#pwToggle'), show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    btn.setAttribute('aria-label', show ? (LANG === 'en' ? 'Hide password' : 'ซ่อนรหัสผ่าน') : (LANG === 'en' ? 'Show password' : 'แสดงรหัสผ่าน'));
    btn.querySelector('use').setAttribute('href', show ? '#i-eye-off' : '#i-eye');
  });

  // ล้าง error ขณะแก้ไข
  form.querySelectorAll('input').forEach(el => {
    el.addEventListener('input', () => clearError(el));
    el.addEventListener('change', () => clearError(el));
  });

  // ประเภทผู้ใช้งาน (การ์ดเรดิโอ)
  const utypeField = form.querySelector('.type-field');
  const utypeCards = [...form.querySelectorAll('.type-card')];
  const syncUtype = () => utypeCards.forEach(c => c.classList.toggle('is-checked', !!c.querySelector('input').checked));
  form.querySelectorAll('input[name="utype"]').forEach(r => r.addEventListener('change', () => {
    utypeField.removeAttribute('aria-invalid'); $('#uType-err').textContent = ''; syncUtype();
  }));

  /* ====================================================================
     ThaID (จำลองการยืนยันตัวตน)
     ==================================================================== */
  $('#thaidBtn').addEventListener('click', () => {
    const base = '110170023070';
    const demo = LANG === 'en'
      ? { first: 'Somchai', last: 'Jaidee' }
      : { first: 'สมชาย', last: 'ใจดี' };
    $('#rFirst').value = demo.first;
    $('#rLast').value = demo.last;
    $('#rNid').value = base + nidCheckDigit(base);
    ['rFirst', 'rLast', 'rNid'].forEach(id => { const el = $('#' + id); el.readOnly = true; clearError(el); });
    verified = true;
    const card = $('#thaidCard'); card.classList.add('is-verified');
    card.querySelector('.thaid-card__badge').innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg> ' + T.thaidBadgeOk;
    const btn = $('#thaidBtn'); btn.disabled = true;
    btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg> ' + T.thaidConnected;
  });

  /* ====================================================================
     Wizard
     ==================================================================== */
  const panels = [$('#step-1'), $('#step-2'), $('#step-3')];
  const stepItems = [...document.querySelectorAll('#regSteps li')];
  const errSum = $('#regErrSum'), errList = $('#regErrList');
  const btnBack = $('#regBack'), btnNext = $('#regNext'), btnSubmit = $('#regSubmit');
  const loadingEl = $('#regLoading');
  const prefersReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = 0, loadTimer = null;

  // เปลี่ยนขั้นตอน — มี loading ตอนเดินหน้า (จำลองการบันทึก), ย้อนกลับทันที
  function goStep(i, withLoad) {
    if (!withLoad || prefersReduce || !loadingEl) { showStep(i); return; }
    form.hidden = true;
    loadingEl.hidden = false; loadingEl.setAttribute('aria-hidden', 'false');
    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      loadingEl.hidden = true; loadingEl.setAttribute('aria-hidden', 'true');
      form.hidden = false; showStep(i);
    }, 450);
  }

  function showStep(i) {
    cur = i;
    panels.forEach((p, idx) => { p.hidden = idx !== i; });
    stepItems.forEach((li, idx) => {
      li.classList.toggle('is-current', idx === i);
      li.classList.toggle('is-done', idx < i);
      if (idx === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    btnBack.hidden = i === 0;
    btnNext.hidden = i === panels.length - 1;
    btnSubmit.hidden = i !== panels.length - 1;
    if (i === panels.length - 1) buildReview();
    errSum.hidden = true;
    panels[i].focus();
    panels[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showErrors(errors) {
    if (!errors.length) { errSum.hidden = true; return false; }
    errList.innerHTML = errors.map(er => `<li><a href="#${er.id}">${er.label}</a></li>`).join('');
    errSum.hidden = false;
    errSum.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => {
      ev.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); t && t.focus();
    }));
    errSum.focus();
    return true;
  }

  function validateStep(i) {
    const errs = [];
    const need = (el, label, msg) => { if (!el.value.trim()) { setError(el, msg || T.required); errs.push({ id: el.id, label }); return false; } return true; };

    if (i === 0) {
      if (!form.querySelector('input[name="utype"]:checked')) {
        utypeField.setAttribute('aria-invalid', 'true'); $('#uType-err').textContent = T.selectType;
        errs.push({ id: 'rEmail', label: T.labels.utype });
      }
      const email = $('#rEmail');
      if (need(email, T.labels.email, T.email) && !emailOk(email.value)) { setError(email, T.emailInvalid); errs.push({ id: 'rEmail', label: T.labels.email }); }
      if (!pass.value) { setError(pass, T.passReq); errs.push({ id: 'rPass', label: T.labels.password }); }
      else if (pass.value.length < 8 || pwScore(pass.value) < 2) { setError(pass, T.passWeak); errs.push({ id: 'rPass', label: T.labels.password }); }
      if (!pass2.value) { setError(pass2, T.pass2); errs.push({ id: 'rPass2', label: T.labels.password2 }); }
      else if (pass.value !== pass2.value) { setError(pass2, T.passMatch); errs.push({ id: 'rPass2', label: T.labels.password2 }); }
    }
    if (i === 1) {
      need($('#rFirst'), T.labels.first, T.first);
      need($('#rLast'), T.labels.last, T.last);
      const nid = $('#rNid');
      if (need(nid, T.labels.nid, T.nid) && !nidOk(nid.value)) { setError(nid, T.nidInvalid); errs.push({ id: 'rNid', label: T.labels.nid }); }
      const phone = $('#rPhone');
      if (need(phone, T.labels.phone, T.phone) && !phoneOk(phone.value)) { setError(phone, T.phoneInvalid); errs.push({ id: 'rPhone', label: T.labels.phone }); }
    }
    if (i === 2) {
      const terms = $('#rTerms'), consent = $('#rConsent');
      if (!terms.checked) { setError(terms, T.terms); errs.push({ id: 'rTerms', label: T.labels.terms }); }
      if (!consent.checked) { setError(consent, T.consent); errs.push({ id: 'rConsent', label: T.labels.consent }); }
    }
    return errs;
  }

  function buildReview() {
    const val = (sel) => ($(sel).value || '').trim() || T.none;
    const set = (k, v) => { const el = form.querySelector(`[data-rev="${k}"]`); if (el) el.textContent = v; };
    set('utype', (form.querySelector('input[name="utype"]:checked') || {}).value || T.none);
    set('email', val('#rEmail'));
    set('name', (($('#rFirst').value || '') + ' ' + ($('#rLast').value || '')).trim() || T.none);
    const nid = ($('#rNid').value || '').replace(/\D/g, '');
    set('nid', nid ? nid.slice(0, 1) + '-' + '••••-•••••-••' + '-' + nid.slice(-1) : T.none);
    set('phone', val('#rPhone'));
    set('verify', verified ? T.reviewThaID : T.reviewManual);
  }

  btnNext.addEventListener('click', () => { if (!showErrors(validateStep(cur))) goStep(cur + 1, true); });
  btnBack.addEventListener('click', () => goStep(cur - 1, false));

  /* ====================================================================
     Modal สร้างบัญชีสำเร็จ
     ==================================================================== */
  const modal = $('#regModal'), modalDialog = modal.querySelector('.cpl-modal__dialog');
  let lastFocus = null;
  function openModal() { lastFocus = document.activeElement; modal.hidden = false; document.body.style.overflow = 'hidden'; modalDialog.focus(); }
  function closeModal() { if (modal.hidden) return; modal.hidden = true; document.body.style.overflow = ''; lastFocus && lastFocus.focus(); }
  modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeModal));
  $('#regModalClose').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  modal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = modal.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* --- ส่งฟอร์ม (ขั้นตอนสุดท้าย) --- */
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (showErrors(validateStep(2))) return;
    // สร้าง username จาก local-part ของอีเมล + เลขสุ่ม
    const local = ($('#rEmail').value.split('@')[0] || 'user').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 16) || 'user';
    const username = local + (1000 + Math.floor(Math.random() * 9000));
    $('#regUser').textContent = username;
    openModal();
  });

  syncUtype();
})();
