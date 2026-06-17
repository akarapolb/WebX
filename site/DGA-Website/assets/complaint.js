/* =====================================================================
   complaint.js — ระบบรับเรื่องร้องเรียน / e-Complaint (เดโมทำงานจริงฝั่ง client)
   - สลับแท็บ (ยื่นเรื่อง / ติดตามสถานะ) แบบ WCAG (tablist + ลูกศร) + loading
   - ตรวจสอบความถูกต้องของฟอร์ม + โฟกัส error แรก + สรุป error
   - ออกเลขที่เรื่อง + บันทึกใน localStorage + ติดตามสถานะ (timeline) + popup
   - รองรับ 2 ภาษา: อ่านจาก <html lang> (th/en)
   ข้อมูลถูกเก็บในเครื่องผู้ใช้เท่านั้น (ไม่ส่งเซิร์ฟเวอร์จริง — เป็นการสาธิต)
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const STORE_KEY = 'dga-complaints';
  const LANG = document.documentElement.lang === 'en' ? 'en' : 'th';

  /* ---------- พจนานุกรมข้อความ 2 ภาษา ---------- */
  const DICT = {
    th: {
      fileChoose: 'เลือกไฟล์ หรือ ลากไฟล์มาวางที่นี่',
      fileSize: 'ไฟล์ต้องมีขนาดไม่เกิน 5MB',
      required: 'กรุณากรอกข้อมูล',
      selectType: 'กรุณาเลือกประเภทเรื่อง',
      subject: 'กรุณากรอกหัวข้อเรื่อง',
      detailReq: 'กรุณากรอกรายละเอียด',
      detailMin: 'กรุณากรอกรายละเอียดอย่างน้อย 10 ตัวอักษร',
      name: 'กรุณากรอกชื่อ–นามสกุล',
      email: 'กรุณากรอกอีเมล',
      emailInvalid: 'รูปแบบอีเมลไม่ถูกต้อง',
      phoneInvalid: 'รูปแบบเบอร์โทรไม่ถูกต้อง',
      consent: 'กรุณายินยอมตามนโยบาย PDPA เพื่อดำเนินการต่อ',
      copied: 'คัดลอกแล้ว ✓',
      errSummaryHint: 'กรุณาตรวจสอบข้อมูลต่อไปนี้',
      labels: { type: 'ประเภทเรื่อง', subject: 'หัวข้อเรื่อง', detail: 'รายละเอียด', name: 'ชื่อ–นามสกุล', email: 'อีเมล', phone: 'เบอร์โทรศัพท์', file: 'แนบไฟล์', consent: 'การยินยอม PDPA' },
      badges: ['รับเรื่องแล้ว', 'กำลังดำเนินการ', 'กำลังดำเนินการ', 'ดำเนินการเสร็จสิ้น'],
      newSteps: [
        { t: 'รับเรื่องร้องเรียน', d: 'ระบบบันทึกเรื่องและออกเลขที่เรื่องเรียบร้อย' },
        { t: 'กำลังตรวจสอบ', d: 'เจ้าหน้าที่จะตรวจสอบและประสานหน่วยงานที่เกี่ยวข้อง' },
        { t: 'ส่งต่อหน่วยงานผู้รับผิดชอบ', d: 'มอบหมายผู้รับผิดชอบดำเนินการ' },
        { t: 'ดำเนินการเสร็จสิ้น', d: 'แจ้งผลการดำเนินการกลับผู้ร้องเรียน' }
      ],
      demo: {
        ref: 'DGA-CMP-2569-100001', type: 'ปัญหาระบบ/เว็บไซต์/แอป',
        subject: 'แอปทางรัฐล่มขณะยืนยันตัวตน', date: '8 มิ.ย. 2569', stage: 2,
        steps: [
          { t: 'รับเรื่องร้องเรียน', time: '8 มิ.ย. 2569 09:12 น.', d: 'ระบบบันทึกเรื่องและออกเลขที่เรื่องเรียบร้อย' },
          { t: 'กำลังตรวจสอบ', time: '9 มิ.ย. 2569 10:40 น.', d: 'เจ้าหน้าที่กำลังตรวจสอบและประสานหน่วยงานที่เกี่ยวข้อง' },
          { t: 'ส่งต่อหน่วยงานผู้รับผิดชอบ', time: '—', d: 'อยู่ระหว่างมอบหมายผู้รับผิดชอบ' },
          { t: 'ดำเนินการเสร็จสิ้น', time: '—', d: 'แจ้งผลการดำเนินการกลับผู้ร้องเรียน' }
        ]
      },
      months: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
      yearOffset: 543
    },
    en: {
      fileChoose: 'Choose a file or drag it here',
      fileSize: 'File must not exceed 5MB',
      required: 'This field is required',
      selectType: 'Please select a category',
      subject: 'Please enter a subject',
      detailReq: 'Please enter the details',
      detailMin: 'Please enter at least 10 characters',
      name: 'Please enter your full name',
      email: 'Please enter your email',
      emailInvalid: 'Invalid email format',
      phoneInvalid: 'Invalid phone number format',
      consent: 'Please accept the PDPA policy to continue',
      copied: 'Copied ✓',
      errSummaryHint: 'Please check the following',
      labels: { type: 'Category', subject: 'Subject', detail: 'Details', name: 'Full name', email: 'Email', phone: 'Phone', file: 'Attachment', consent: 'PDPA consent' },
      badges: ['Received', 'In progress', 'In progress', 'Completed'],
      newSteps: [
        { t: 'Complaint received', d: 'Your complaint was logged and a reference number was issued' },
        { t: 'Under review', d: 'Staff will review and coordinate with relevant agencies' },
        { t: 'Forwarded to responsible unit', d: 'Assigning a responsible officer' },
        { t: 'Completed', d: 'Result reported back to the complainant' }
      ],
      demo: {
        ref: 'DGA-CMP-2569-100001', type: 'System / website / app issue',
        subject: 'Tang Rath app crashed during identity verification', date: '8 Jun 2026', stage: 2,
        steps: [
          { t: 'Complaint received', time: '8 Jun 2026 09:12', d: 'Your complaint was logged and a reference number was issued' },
          { t: 'Under review', time: '9 Jun 2026 10:40', d: 'Staff are reviewing and coordinating with relevant agencies' },
          { t: 'Forwarded to responsible unit', time: '—', d: 'Assigning a responsible officer' },
          { t: 'Completed', time: '—', d: 'Result reported back to the complainant' }
        ]
      },
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      yearOffset: 0
    }
  };
  const T = DICT[LANG];

  /* ---------- เก็บ/อ่านเรื่องร้องเรียนจาก localStorage ---------- */
  const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } };
  const writeStore = (o) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) {} };

  /* ---------- ข้อมูลตัวอย่างสำหรับสาธิตการติดตามสถานะ ---------- */
  const DEMO = {};
  DEMO[T.demo.ref] = T.demo;

  const prefersReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ====================================================================
     1) แท็บ (tablist) + loading ระหว่างสลับ (จำลองระบบจริง)
     ==================================================================== */
  const tabs = [...document.querySelectorAll('.cpl-tab')];
  const panels = { 'tab-file': $('#panel-file'), 'tab-track': $('#panel-track') };
  const loadingEl = $('#cplLoading');
  let loadTimer = null;
  function selectTab(tab, focus, instant) {
    tabs.forEach(t => {
      const sel = t === tab;
      t.setAttribute('aria-selected', sel ? 'true' : 'false');
      t.tabIndex = sel ? 0 : -1;
    });
    const target = panels[tab.id];
    if (instant || prefersReduce || !loadingEl) {
      Object.values(panels).forEach(p => { p.hidden = (p !== target); });
      if (loadingEl) loadingEl.hidden = true;
      if (focus) tab.focus();
      return;
    }
    // แสดงสปินเนอร์สั้น ๆ ก่อนเผยแผงเป้าหมาย
    Object.values(panels).forEach(p => { p.hidden = true; });
    loadingEl.hidden = false;
    loadingEl.parentElement?.setAttribute('aria-busy', 'true');
    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      loadingEl.hidden = true;
      loadingEl.parentElement?.removeAttribute('aria-busy');
      target.hidden = false;
      if (focus) tab.focus();
    }, 450);
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', e => {
      let n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') n = tabs[0];
      else if (e.key === 'End') n = tabs[tabs.length - 1];
      if (n) { e.preventDefault(); selectTab(n, true, true); }
    });
  });
  // เปิดแท็บติดตามถ้า URL ลงท้าย #track (ทันที ไม่ต้อง loading ตอนโหลดหน้า)
  if (location.hash === '#track') selectTab($('#tab-track'), false, true);

  // ปุ่ม "ถาม DGA Guide" ในแผงข้าง → เปิดแผงผู้ช่วย (คลิกปุ่มลอย)
  $('#sideAskGuide')?.addEventListener('click', () => document.getElementById('aiBtn')?.click());

  /* ====================================================================
     Popup modal "ส่งเรื่องเรียบร้อย"
     ==================================================================== */
  const modal = $('#cplModal');
  const modalDialog = modal?.querySelector('.cpl-modal__dialog');
  let modalLastFocus = null;
  function openModal() {
    modalLastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modalDialog.focus();
  }
  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    modalLastFocus && modalLastFocus.focus();
  }
  modal?.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeModal));
  $('#cplModalClose')?.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  // focus trap ภายใน modal (WCAG 2.4.3)
  modal?.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = modal.querySelectorAll('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ====================================================================
     2) ฟอร์มยื่นเรื่อง
     ==================================================================== */
  const form = $('#cplForm');
  if (form) {
    const anon = $('#cAnon'), person = $('#cplPerson');
    const detail = $('#cDetail'), detailCount = $('#cDetail-count');
    const fileInput = $('#cFile'), fileDrop = $('.file-drop'), fileText = $('#cFileText');
    const errSum = $('#cplErrSum'), errList = $('#cplErrList');

    /* --- นับตัวอักษร textarea --- */
    const updateCount = () => { detailCount.textContent = detail.value.length + ' / 1000'; };
    detail.addEventListener('input', updateCount);

    /* --- ไม่ระบุตัวตน → ปิดช่องข้อมูลส่วนบุคคล --- */
    anon.addEventListener('change', () => {
      person.classList.toggle('is-disabled', anon.checked);
      person.querySelectorAll('input').forEach(inp => { inp.disabled = anon.checked; if (anon.checked) clearError(inp); });
    });

    /* --- แสดงชื่อไฟล์ที่เลือก + ลากวาง --- */
    const showFile = () => {
      const f = fileInput.files[0];
      if (f) { fileText.textContent = f.name; fileDrop.classList.add('has-file'); }
      else { fileText.textContent = T.fileChoose; fileDrop.classList.remove('has-file'); }
    };
    fileInput.addEventListener('change', () => { clearError(fileInput); validateFile(); showFile(); });
    ['dragenter', 'dragover'].forEach(ev => fileDrop.addEventListener(ev, e => { e.preventDefault(); fileDrop.classList.add('is-drag'); }));
    ['dragleave', 'drop'].forEach(ev => fileDrop.addEventListener(ev, e => { e.preventDefault(); fileDrop.classList.remove('is-drag'); }));
    fileDrop.addEventListener('drop', e => { if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event('change')); } });

    /* --- helper: ตั้ง/ล้าง error ของ field --- */
    function setError(input, msg) {
      input.setAttribute('aria-invalid', 'true');
      const errEl = document.getElementById(input.id + '-err');
      if (errEl) errEl.textContent = msg;
    }
    function clearError(input) {
      input.removeAttribute('aria-invalid');
      const errEl = document.getElementById(input.id + '-err');
      if (errEl) errEl.textContent = '';
    }
    // ล้าง error ทันทีที่ผู้ใช้แก้ไข
    form.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', () => clearError(el));
      el.addEventListener('change', () => clearError(el));
    });

    // ประเภทเรื่อง (การ์ดเรดิโอ) — ล้าง error เมื่อเลือก + ตั้ง id ให้ตัวแรกเพื่อโฟกัสได้
    const typeField = form.querySelector('.type-field');
    const typeRadios = [...form.querySelectorAll('input[name="type"]')];
    if (typeRadios[0]) typeRadios[0].id = 'type-first';
    const clearTypeErr = () => { typeField.removeAttribute('aria-invalid'); $('#cType-err').textContent = ''; };
    const typeCards = [...form.querySelectorAll('.type-card')];
    const syncTypeCards = () => typeCards.forEach(c => c.classList.toggle('is-checked', !!c.querySelector('input').checked));
    typeRadios.forEach(r => r.addEventListener('change', () => { clearTypeErr(); syncTypeCards(); }));

    function validateFile() {
      const f = fileInput.files[0];
      if (!f) return true;
      if (f.size > 5 * 1024 * 1024) { setError(fileInput, T.fileSize); return false; }
      return true;
    }

    /* --- ตรวจสอบทั้งฟอร์ม --- */
    function validate() {
      const errors = []; // {id, label, msg}
      const need = (input, label, msg) => {
        if (!input.value.trim()) { setError(input, msg || T.required); errors.push({ id: input.id, label }); return false; }
        return true;
      };
      if (!form.querySelector('input[name="type"]:checked')) {
        typeField.setAttribute('aria-invalid', 'true');
        $('#cType-err').textContent = T.selectType;
        errors.push({ id: 'type-first', label: T.labels.type });
      }
      need($('#cSubject'), T.labels.subject, T.subject);
      need($('#cDetail'), T.labels.detail, T.detailReq);
      if ($('#cDetail').value.trim() && $('#cDetail').value.trim().length < 10) {
        setError($('#cDetail'), T.detailMin); errors.push({ id: 'cDetail', label: T.labels.detail });
      }
      // ข้อมูลผู้ร้องเรียน (เฉพาะเมื่อไม่ได้เลือกไม่ระบุตัวตน)
      if (!anon.checked) {
        need($('#cName'), T.labels.name, T.name);
        const email = $('#cEmail');
        if (need(email, T.labels.email, T.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
          setError(email, T.emailInvalid); errors.push({ id: 'cEmail', label: T.labels.email });
        }
        const phone = $('#cPhone');
        if (phone.value.trim() && !/^[0-9+\-\s()]{6,20}$/.test(phone.value.trim())) {
          setError(phone, T.phoneInvalid); errors.push({ id: 'cPhone', label: T.labels.phone });
        }
      }
      if (!validateFile()) errors.push({ id: 'cFile', label: T.labels.file });
      const consent = $('#cConsent');
      if (!consent.checked) { setError(consent, T.consent); errors.push({ id: 'cConsent', label: T.labels.consent }); }
      return errors;
    }

    /* --- ออกเลขที่เรื่อง: DGA-CMP-<พ.ศ.>-<6หลัก> (ใช้ พ.ศ. เป็นรหัสระบบทั้ง 2 ภาษา) --- */
    function genRef() {
      const yearBE = new Date().getFullYear() + 543;
      const n = 100000 + Math.floor(Math.random() * 899999);
      return 'DGA-CMP-' + yearBE + '-' + n;
    }
    function today() {
      const d = new Date();
      return d.getDate() + ' ' + T.months[d.getMonth()] + ' ' + (d.getFullYear() + T.yearOffset);
    }

    /* --- ส่งฟอร์ม --- */
    form.addEventListener('submit', e => {
      e.preventDefault();
      const errors = validate();
      if (errors.length) {
        // สรุป error + ลิงก์โฟกัสไปยังช่องที่ผิด
        errList.innerHTML = errors.map(er => `<li><a href="#${er.id}">${er.label}</a></li>`).join('');
        errSum.hidden = false;
        errSum.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => {
          ev.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); t && t.focus();
        }));
        errSum.focus();
        return;
      }
      errSum.hidden = true;

      // บันทึกเรื่อง
      const ref = genRef();
      const record = {
        ref, type: (form.querySelector('input[name="type"]:checked') || {}).value || '',
        subject: $('#cSubject').value.trim(),
        date: today(), stage: 0,
        steps: T.newSteps.map((s, i) => ({ t: s.t, time: i === 0 ? today() : '—', d: s.d }))
      };
      const store = readStore(); store[ref] = record; writeStore(store);

      // รีเซ็ตฟอร์มให้พร้อมใช้ใหม่ แล้วเด้ง popup แจ้งสำเร็จ
      $('#cplRefNo').textContent = ref;
      form.reset(); updateCount(); showFile(); clearTypeErr(); syncTypeCards();
      person.classList.remove('is-disabled'); person.querySelectorAll('input').forEach(i => i.disabled = false);
      form.querySelectorAll('[aria-invalid]').forEach(clearError);
      openModal();
    });

    /* --- ปุ่มใน popup --- */
    $('#cplCopy').addEventListener('click', () => {
      const ref = $('#cplRefNo').textContent;
      navigator.clipboard?.writeText(ref).then(() => {
        const b = $('#cplCopy'); const o = b.innerHTML; b.innerHTML = T.copied;
        setTimeout(() => b.innerHTML = o, 1600);
      });
    });
    $('#cplNew').addEventListener('click', () => {
      closeModal();
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#cplGoTrack').addEventListener('click', () => {
      const ref = $('#cplRefNo').textContent;
      closeModal();
      $('#trackRef').value = ref;
      selectTab($('#tab-track'));
      $('#cplTrackForm').requestSubmit();
      $('#panel-track').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    updateCount();
  }

  /* ====================================================================
     3) ติดตามสถานะ
     ==================================================================== */
  const trackForm = $('#cplTrackForm');
  if (trackForm) {
    const result = $('#cplResult'), notFound = $('#cplNotFound');
    const badgeClass = ['is-received', 'is-progress', 'is-progress', 'is-done'];

    function render(rec) {
      notFound.hidden = true;
      $('#resRef').textContent = rec.ref;
      $('#resType').textContent = rec.type || '—';
      $('#resSubject').textContent = rec.subject || '—';
      $('#resDate').textContent = rec.date || '—';
      const badge = $('#resBadge');
      badge.textContent = T.badges[rec.stage] || T.badges[0];
      badge.className = 'cpl-badge ' + (badgeClass[rec.stage] || 'is-received');

      $('#resTimeline').innerHTML = rec.steps.map((s, i) => {
        let cls = 'pending', icon = '';
        if (i < rec.stage) { cls = 'done'; icon = '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>'; }
        else if (i === rec.stage) { cls = 'current'; icon = '<svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg>'; }
        return `<li class="${cls}"><span class="tl-dot">${icon}</span>
          <span class="tl-title">${s.t}</span>
          <span class="tl-time">${s.time}</span>
          <span class="tl-desc">${s.d}</span></li>`;
      }).join('');
      result.hidden = false;
    }

    function lookup(ref) {
      ref = (ref || '').trim().toUpperCase();
      if (!ref) return;
      const rec = DEMO[ref] || readStore()[ref];
      if (rec) render(rec);
      else { result.hidden = true; notFound.hidden = false; }
    }

    trackForm.addEventListener('submit', e => { e.preventDefault(); lookup($('#trackRef').value); });
    $('#trackDemo').addEventListener('click', () => { $('#trackRef').value = T.demo.ref; lookup(T.demo.ref); });
  }
})();
