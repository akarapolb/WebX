/* =====================================================================
   appstatus.js — ตรวจสอบสถานะใบสมัครงาน (เดโมฝั่ง client)
   อ่านเลขที่ใบสมัคร → แสดง timeline สถานะ จาก localStorage หรือเลขตัวอย่าง
   รองรับ 2 ภาษา (th/en) · ใช้สไตล์ timeline ร่วมกับ complaint.css
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const LANG = document.documentElement.lang === 'en' ? 'en' : 'th';
  const STORE = 'dga-applications';

  const T = {
    th: {
      vRef: 'กรุณากรอกเลขที่ใบสมัคร',
      badges: ['รับใบสมัครแล้ว', 'กำลังคัดกรอง', 'นัดสัมภาษณ์', 'แจ้งผลแล้ว'],
      badgeCls: ['is-received', 'is-progress', 'is-progress', 'is-done'],
      steps: [
        { t: 'รับใบสมัครแล้ว', d: 'ระบบบันทึกใบสมัครและออกเลขที่อ้างอิงเรียบร้อย' },
        { t: 'คัดกรองคุณสมบัติ', d: 'ทีมสรรหากำลังพิจารณาคุณสมบัติเบื้องต้น' },
        { t: 'นัดสัมภาษณ์', d: 'ผู้ผ่านการคัดกรองจะได้รับการติดต่อเพื่อนัดสัมภาษณ์' },
        { t: 'แจ้งผลการพิจารณา', d: 'แจ้งผลการพิจารณากลับผู้สมัครทางอีเมล' }
      ],
      none: '—',
      demo: { ref: 'DGA-JOB-2569-100001', position: { th: 'นักพัฒนาระบบ (Full-stack Developer)', en: 'Full-stack Developer' }, date: { th: '10 มิ.ย. 2569', en: '10 Jun 2026' }, stage: 2 }
    },
    en: {
      vRef: 'Please enter your application reference',
      badges: ['Received', 'Screening', 'Interview', 'Result issued'],
      badgeCls: ['is-received', 'is-progress', 'is-progress', 'is-done'],
      steps: [
        { t: 'Application received', d: 'Your application was logged and a reference number issued' },
        { t: 'Screening', d: 'The recruitment team is reviewing your initial qualifications' },
        { t: 'Interview', d: 'Shortlisted candidates will be contacted to schedule an interview' },
        { t: 'Result', d: 'The result will be sent back to applicants by email' }
      ],
      none: '—',
      demo: { ref: 'DGA-JOB-2569-100001', position: { th: 'นักพัฒนาระบบ (Full-stack Developer)', en: 'Full-stack Developer' }, date: { th: '10 มิ.ย. 2569', en: '10 Jun 2026' }, stage: 2 }
    }
  }[LANG];

  const DEMO = {}; DEMO[T.demo.ref] = T.demo;
  const tv = o => (o && typeof o === 'object' ? (o[LANG] || o.th || '') : (o || ''));

  // ปุ่ม "ถาม DGA Guide" ในแผงข้าง → เปิดแผงผู้ช่วย (คลิกปุ่มลอย)
  document.getElementById('sideAskGuide')?.addEventListener('click', () => document.getElementById('aiBtn')?.click());

  const form = $('#appForm');
  if (!form) return;
  const input = $('#appInput'), result = $('#appResult'), notFound = $('#appNotFound');

  const read = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } };

  function render(rec) {
    notFound.hidden = true;
    $('#appRef').textContent = rec.ref;
    $('#appPos').textContent = tv(rec.position) || T.none;
    $('#appDate').textContent = tv(rec.date) || T.none;
    const b = $('#appBadge');
    b.textContent = T.badges[rec.stage] || T.badges[0];
    b.className = 'cpl-badge ' + (T.badgeCls[rec.stage] || 'is-received');
    $('#appTimeline').innerHTML = T.steps.map((s, i) => {
      let cls = 'pending', icon = '';
      if (i < rec.stage) { cls = 'done'; icon = '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>'; }
      else if (i === rec.stage) { cls = 'current'; icon = '<svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg>'; }
      return `<li class="${cls}"><span class="tl-dot">${icon}</span>
        <span class="tl-title">${s.t}</span>
        <span class="tl-desc">${s.d}</span></li>`;
    }).join('');
    result.hidden = false;
  }

  function lookup(ref) {
    ref = (ref || '').trim().toUpperCase();
    if (!ref) { input.setAttribute('aria-invalid', 'true'); $('#appInput-err').textContent = T.vRef; return; }
    input.removeAttribute('aria-invalid'); $('#appInput-err').textContent = '';
    const rec = DEMO[ref] || read()[ref];
    if (rec) render(rec); else { result.hidden = true; notFound.hidden = false; }
  }

  input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); $('#appInput-err').textContent = ''; });
  form.addEventListener('submit', e => { e.preventDefault(); lookup(input.value); });
  $('#appDemo')?.addEventListener('click', () => { input.value = T.demo.ref; lookup(T.demo.ref); });

  // เปิดมาพร้อม ?ref= (เช่น มาจากลิงก์หลังสมัคร)
  const pre = new URLSearchParams(location.search).get('ref');
  if (pre) { input.value = pre; lookup(pre); }
})();
