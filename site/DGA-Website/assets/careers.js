/* =====================================================================
   careers.js — ระบบรับสมัครงาน (หน้า list + หน้า detail + ฟอร์มสมัคร)
   อ่านข้อมูลจาก window.DGA_JOBS (jobs-data.js) · รองรับ 2 ภาษา (th/en)
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const LANG = document.documentElement.lang === 'en' ? 'en' : 'th';
  const JOBS = window.DGA_JOBS || [];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const jobBase = LANG === 'en' ? '/en/' : '/';

  const T = {
    th: {
      allDepts: 'ทุกฝ่ายงาน', allTypes: 'ทุกประเภท',
      searchPh: 'ค้นหาตำแหน่งงาน...',
      count: n => `พบ <strong>${n}</strong> ตำแหน่งงานที่เปิดรับ`,
      viewDetail: 'ดูรายละเอียด', closes: 'ปิดรับ ', empty: 'ไม่พบตำแหน่งงานที่ตรงกับเงื่อนไข ลองปรับคำค้นหาหรือตัวกรอง',
      range: (a, b) => `แสดง ${a}–${b}`, prev: 'หน้าก่อนหน้า', next: 'หน้าถัดไป', pageOf: (i, n) => `ไปหน้า ${i} จาก ${n}`,
      secResp: 'หน้าที่ความรับผิดชอบ', secQual: 'คุณสมบัติผู้สมัคร', secBenefit: 'สวัสดิการและสิทธิประโยชน์',
      sumTitle: 'สรุปตำแหน่ง', mDept: 'ฝ่ายงาน', mType: 'ประเภท', mLoc: 'สถานที่', mSalary: 'เงินเดือน', mDeadline: 'วันปิดรับสมัคร', mOpen: 'จำนวนที่รับ',
      openVal: n => `${n} อัตรา`, applyBtn: 'สมัครงานตำแหน่งนี้', backList: 'กลับไปหน้ารายการงานทั้งหมด',
      nfTitle: 'ไม่พบตำแหน่งงานนี้', nfText: 'ตำแหน่งงานอาจถูกปิดรับหรือลิงก์ไม่ถูกต้อง',
      applyTitle: 'สมัครงาน', name: 'ชื่อ–นามสกุล', email: 'อีเมล', phone: 'เบอร์โทรศัพท์', resume: 'แนบเรซูเม่ (PDF/รูปภาพ ไม่เกิน 5MB)', note: 'ข้อความถึงผู้รับสมัคร', noteOpt: '(ไม่บังคับ)', resumeOpt: '(ไม่บังคับ)',
      fileChoose: 'เลือกไฟล์ หรือ ลากไฟล์มาวางที่นี่',
      consent: 'ยินยอมให้ สพร. เก็บและใช้ข้อมูลเพื่อพิจารณาการสมัครงานตามนโยบาย PDPA',
      send: 'ส่งใบสมัคร', errHint: 'กรุณาตรวจสอบข้อมูลต่อไปนี้',
      vName: 'กรุณากรอกชื่อ–นามสกุล', vEmail: 'กรุณากรอกอีเมล', vEmailF: 'รูปแบบอีเมลไม่ถูกต้อง',
      vPhone: 'กรุณากรอกเบอร์โทรศัพท์', vPhoneF: 'รูปแบบเบอร์โทรไม่ถูกต้อง', vFile: 'ไฟล์ต้องไม่เกิน 5MB', vConsent: 'กรุณายินยอมตามนโยบาย PDPA',
      lblName: 'ชื่อ', lblEmail: 'อีเมล', lblPhone: 'เบอร์โทร', lblConsent: 'การยินยอม PDPA',
      okTitle: 'ส่งใบสมัครเรียบร้อย', okText: 'เราได้รับใบสมัครของคุณแล้ว ทีมสรรหาจะติดต่อกลับทางอีเมลภายใน 7 วันทำการ', refLabel: 'เลขที่ใบสมัคร', close: 'ปิด'
    },
    en: {
      allDepts: 'All departments', allTypes: 'All types',
      searchPh: 'Search positions...',
      count: n => `<strong>${n}</strong> open position${n === 1 ? '' : 's'} found`,
      viewDetail: 'View details', closes: 'Closes ', empty: 'No positions match your criteria. Try adjusting your search or filters.',
      range: (a, b) => `showing ${a}–${b}`, prev: 'Previous page', next: 'Next page', pageOf: (i, n) => `Go to page ${i} of ${n}`,
      secResp: 'Responsibilities', secQual: 'Qualifications', secBenefit: 'Benefits',
      sumTitle: 'Position summary', mDept: 'Department', mType: 'Type', mLoc: 'Location', mSalary: 'Salary', mDeadline: 'Application deadline', mOpen: 'Openings',
      openVal: n => `${n} position${n === 1 ? '' : 's'}`, applyBtn: 'Apply for this position', backList: 'Back to all jobs',
      nfTitle: 'Position not found', nfText: 'This position may be closed or the link is invalid.',
      applyTitle: 'Apply', name: 'Full name', email: 'Email', phone: 'Phone', resume: 'Attach resume (PDF/image, max 5MB)', note: 'Message to the hiring team', noteOpt: '(optional)', resumeOpt: '(optional)',
      fileChoose: 'Choose a file or drag it here',
      consent: 'I consent to DGA storing and using my data to consider my application, per the PDPA policy',
      send: 'Submit application', errHint: 'Please check the following',
      vName: 'Please enter your full name', vEmail: 'Please enter your email', vEmailF: 'Invalid email format',
      vPhone: 'Please enter your phone number', vPhoneF: 'Invalid phone number format', vFile: 'File must not exceed 5MB', vConsent: 'Please accept the PDPA policy',
      lblName: 'Full name', lblEmail: 'Email', lblPhone: 'Phone', lblConsent: 'PDPA consent',
      okTitle: 'Application submitted', okText: 'We have received your application. Our recruitment team will contact you by email within 7 business days.', refLabel: 'Application reference', close: 'Close'
    }
  }[LANG];

  const t = o => (o && o[LANG]) || '';

  /* ====================================================================
     หน้า LIST
     ==================================================================== */
  const listEl = $('#jobList');
  if (listEl) {
    const searchEl = $('#jobSearch'), deptEl = $('#jobDept'), typeEl = $('#jobType'), countEl = $('#jobCount');

    // สร้างตัวเลือกตัวกรองจากข้อมูลจริง
    const uniq = key => {
      const seen = {}; const out = [];
      JOBS.forEach(j => { if (!seen[j[key + 'Key']]) { seen[j[key + 'Key']] = 1; out.push({ k: j[key + 'Key'], label: t(j[key]) }); } });
      return out;
    };
    deptEl.innerHTML = `<option value="">${T.allDepts}</option>` + uniq('dept').map(o => `<option value="${o.k}">${esc(o.label)}</option>`).join('');
    typeEl.innerHTML = `<option value="">${T.allTypes}</option>` + uniq('type').map(o => `<option value="${o.k}">${esc(o.label)}</option>`).join('');
    searchEl.placeholder = T.searchPh;

    const DEPT_ICON = { tech: 'i-build', data: 'i-grid', design: 'i-eye', security: 'i-shield', pm: 'i-briefcase', corporate: 'i-users' };
    function card(j) {
      const ic = DEPT_ICON[j.deptKey] || 'i-briefcase';
      return `<a class="job-card" href="${jobBase}job.html?id=${encodeURIComponent(j.id)}">
        <span class="job-card__ic" aria-hidden="true"><svg class="icon"><use href="#${ic}"/></svg></span>
        <div class="job-card__main">
          <div class="job-badges">
            <span class="job-badge job-badge--dept">${esc(t(j.dept))}</span>
            <span class="job-badge job-badge--${j.typeKey}">${esc(t(j.type))}</span>
          </div>
          <h3>${esc(t(j.title))}</h3>
          <p class="job-summary">${esc(t(j.summary))}</p>
          <div class="job-meta">
            <span><svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg> ${esc(t(j.location))}</span>
            <span><svg class="icon" aria-hidden="true"><use href="#i-wallet"/></svg> ${esc(t(j.salary))}</span>
            <span><svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg> ${T.closes}${esc(t(j.deadline))}</span>
          </div>
        </div>
        <div class="job-card__foot"><span>${T.viewDetail}</span><svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></div>
      </a>`;
    }

    const PER = 10;          // แสดงครั้งละ 10 ตำแหน่ง
    let page = 1, totalPages = 1;
    const pagerEl = $('#jobPager');

    function pagerHTML() {
      if (totalPages <= 1) return '';
      let dots = '';
      for (let i = 1; i <= totalPages; i++)
        dots += `<button type="button" class="pager-dot${i === page ? ' is-active' : ''}" data-page="${i}" aria-label="${T.pageOf(i, totalPages)}"${i === page ? ' aria-current="true"' : ''}></button>`;
      return `<div class="pager-dots">${dots}</div>
        <div class="pager-arrows">
          <button type="button" class="pager-arrow pager-arrow--prev" data-step="-1" aria-label="${T.prev}"${page === 1 ? ' disabled' : ''}><svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>
          <button type="button" class="pager-arrow" data-step="1" aria-label="${T.next}"${page === totalPages ? ' disabled' : ''}><svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>
        </div>`;
    }

    function render() {
      const q = (searchEl.value || '').trim().toLowerCase();
      const dk = deptEl.value, tk = typeEl.value;
      const filtered = JOBS.filter(j => {
        if (dk && j.deptKey !== dk) return false;
        if (tk && j.typeKey !== tk) return false;
        if (q) {
          const hay = (t(j.title) + ' ' + t(j.dept) + ' ' + t(j.summary) + ' ' + t(j.location)).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      const total = filtered.length;
      totalPages = Math.max(1, Math.ceil(total / PER));
      if (page > totalPages) page = totalPages;

      if (!total) {
        countEl.innerHTML = '';
        listEl.innerHTML = `<div class="job-empty" style="grid-column:1/-1"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg><p>${T.empty}</p></div>`;
        pagerEl.innerHTML = '';
        return;
      }
      const from = (page - 1) * PER, to = Math.min(total, from + PER);
      countEl.innerHTML = T.count(total) + (totalPages > 1 ? ` · ${T.range(from + 1, to)}` : '');
      listEl.innerHTML = filtered.slice(from, to).map(card).join('');
      pagerEl.innerHTML = pagerHTML();
    }

    function goPage(p) {
      page = Math.max(1, Math.min(totalPages, p));
      render();
      document.querySelector('.careers-toolbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    pagerEl.addEventListener('click', e => {
      const dot = e.target.closest('[data-page]'), arr = e.target.closest('[data-step]');
      if (dot) goPage(+dot.dataset.page);
      else if (arr && !arr.disabled) goPage(page + (+arr.dataset.step));
    });

    // สลับมุมมอง grid / list (จำค่าไว้ใน localStorage)
    const viewBtns = [$('#viewGrid'), $('#viewList')];
    let view = (function () { try { return localStorage.getItem('dga-jobview') === 'list' ? 'list' : 'grid'; } catch (e) { return 'grid'; } })();
    function applyView() {
      listEl.className = view === 'list' ? 'job-list' : 'job-grid';
      viewBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false'));
    }
    viewBtns.forEach(b => b.addEventListener('click', () => {
      view = b.dataset.view; try { localStorage.setItem('dga-jobview', view); } catch (e) {} applyView();
    }));
    applyView();

    // เปลี่ยนตัวกรอง/ค้นหา → กลับหน้า 1 เสมอ
    const reset = () => { page = 1; render(); };
    searchEl.addEventListener('input', reset);
    deptEl.addEventListener('change', reset);
    typeEl.addEventListener('change', reset);
    render();
  }

  /* ====================================================================
     หน้า DETAIL
     ==================================================================== */
  const detailEl = $('#jobDetail');
  if (detailEl) {
    const params = new URLSearchParams(location.search);
    const job = JOBS.find(j => j.id === params.get('id'));

    if (!job) {
      detailEl.innerHTML = `<div class="job-notfound"><svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg>
        <h1>${T.nfTitle}</h1><p>${T.nfText}</p>
        <p style="margin-top:18px"><a class="btn btn--primary" href="${jobBase}careers.html">${T.backList}</a></p></div>`;
      return;
    }

    document.title = t(job.title) + ' | DGA';
    const bc = $('#jobCrumb'); if (bc) bc.textContent = t(job.title);

    const liList = arr => (arr || []).map(x => `<li><span class="ck" aria-hidden="true"><svg class="icon"><use href="#i-check"/></svg></span>${esc(x)}</li>`).join('');
    const metaRow = (icon, label, val) => `<div><dt><svg class="icon" aria-hidden="true"><use href="#${icon}"/></svg></dt><dd><small>${label}</small><strong>${esc(val)}</strong></dd></div>`;

    detailEl.innerHTML = `
      <section class="cpl-hero" aria-labelledby="job-h"><div class="wrap">
        <div class="cpl-hero__tx">
          <span class="cpl-eyebrow"><svg class="icon" aria-hidden="true"><use href="#i-build"/></svg> ${esc(t(job.dept))}</span>
          <h1 id="job-h">${esc(t(job.title))}</h1>
          <ul class="cpl-trust">
            <li><svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg> ${esc(t(job.location))}</li>
            <li><svg class="icon" aria-hidden="true"><use href="#i-briefcase"/></svg> ${esc(t(job.type))}</li>
            <li><svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg> ${T.closes}${esc(t(job.deadline))}</li>
          </ul>
        </div>
      </div></section>

      <section class="careers-wrap"><div class="wrap">
        <div class="job-dl-layout">
          <div class="job-dl-main">
            <p class="job-lead">${esc(t(job.summary))}</p>
            <div class="job-section"><h2>${T.secResp}</h2><ul>${liList(t(job.responsibilities))}</ul></div>
            <div class="job-section"><h2>${T.secQual}</h2><ul>${liList(t(job.qualifications))}</ul></div>
            <div class="job-section"><h2>${T.secBenefit}</h2><ul>${liList(t(job.benefits))}</ul></div>
            <p><a href="${jobBase}careers.html" class="link-btn">&larr; ${T.backList}</a></p>
          </div>
          <aside class="job-aside">
            <div class="job-summary-card">
              <h2>${T.sumTitle}</h2>
              <dl>
                ${metaRow('i-build', T.mDept, t(job.dept))}
                ${metaRow('i-briefcase', T.mType, t(job.type))}
                ${metaRow('i-pin', T.mLoc, t(job.location))}
                ${metaRow('i-wallet', T.mSalary, t(job.salary))}
                ${metaRow('i-clock', T.mDeadline, t(job.deadline))}
                ${metaRow('i-users', T.mOpen, T.openVal(job.openings))}
              </dl>
              <div class="job-apply-bar">
                <button type="button" class="btn btn--primary btn--block btn--lg" id="applyOpen">${T.applyBtn}</button>
              </div>
            </div>
          </aside>
        </div>
      </div></section>`;

    /* ----- Apply modal ----- */
    const modal = $('#applyModal'), dialog = modal.querySelector('.cpl-modal__dialog');
    const formView = $('#applyFormView'), doneView = $('#applyDone');
    const aForm = $('#applyForm');
    let lastFocus = null;

    $('#applyJobTitle').textContent = t(job.title);

    function openModal() { lastFocus = document.activeElement; modal.hidden = false; document.body.style.overflow = 'hidden'; dialog.focus(); }
    function closeModal() { modal.hidden = true; document.body.style.overflow = ''; lastFocus && lastFocus.focus(); }
    $('#applyOpen').addEventListener('click', openModal);
    modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeModal));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
    modal.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const f = [...modal.querySelectorAll('a[href],button:not([disabled]),input,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // file display
    const aFile = $('#aResume'), aFileText = $('#aResumeText');
    aFile.addEventListener('change', () => {
      const f = aFile.files[0];
      aFileText.textContent = f ? f.name : T.fileChoose;
      aFile.closest('.file-drop').classList.toggle('has-file', !!f);
    });

    const setErr = (el, m) => { el.setAttribute('aria-invalid', 'true'); const e = document.getElementById(el.id + '-err'); if (e) e.textContent = m; };
    const clrErr = el => { el.removeAttribute('aria-invalid'); const e = document.getElementById(el.id + '-err'); if (e) e.textContent = ''; };
    aForm.querySelectorAll('input,textarea').forEach(el => el.addEventListener('input', () => clrErr(el)));

    aForm.addEventListener('submit', e => {
      e.preventDefault();
      const errs = [];
      const name = $('#aName'), email = $('#aEmail'), phone = $('#aPhone'), consent = $('#aConsent');
      if (!name.value.trim()) { setErr(name, T.vName); errs.push({ id: 'aName', l: T.lblName }); }
      if (!email.value.trim()) { setErr(email, T.vEmail); errs.push({ id: 'aEmail', l: T.lblEmail }); }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { setErr(email, T.vEmailF); errs.push({ id: 'aEmail', l: T.lblEmail }); }
      if (!phone.value.trim()) { setErr(phone, T.vPhone); errs.push({ id: 'aPhone', l: T.lblPhone }); }
      else if (!/^[0-9+\-\s()]{6,20}$/.test(phone.value.trim())) { setErr(phone, T.vPhoneF); errs.push({ id: 'aPhone', l: T.lblPhone }); }
      if (aFile.files[0] && aFile.files[0].size > 5 * 1024 * 1024) { setErr(aFile, T.vFile); errs.push({ id: 'aResume', l: 'resume' }); }
      if (!consent.checked) { setErr(consent, T.vConsent); errs.push({ id: 'aConsent', l: T.lblConsent }); }

      const sum = $('#applyErrSum'), list = $('#applyErrList');
      if (errs.length) {
        list.innerHTML = errs.map(er => `<li><a href="#${er.id}">${er.l}</a></li>`).join('');
        sum.hidden = false;
        sum.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); document.getElementById(a.getAttribute('href').slice(1)).focus(); }));
        sum.focus();
        return;
      }
      sum.hidden = true;
      const ref = 'DGA-JOB-' + (new Date().getFullYear() + 543) + '-' + (100000 + Math.floor(Math.random() * 899999));
      // บันทึกใบสมัครลง localStorage เพื่อใช้ตรวจสอบสถานะภายหลัง
      try {
        const M = { th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
        const d = new Date(), ds = l => d.getDate() + ' ' + M[l][d.getMonth()] + ' ' + (d.getFullYear() + (l === 'th' ? 543 : 0));
        const apps = JSON.parse(localStorage.getItem('dga-applications') || '{}');
        apps[ref] = { ref, position: job.title, name: $('#aName').value.trim(), email: $('#aEmail').value.trim(), date: { th: ds('th'), en: ds('en') }, stage: 0 };
        localStorage.setItem('dga-applications', JSON.stringify(apps));
      } catch (e) {}
      $('#applyRef').textContent = ref;
      formView.hidden = true; doneView.hidden = false; dialog.focus();
    });
  }
})();
