/* =====================================================================
   list-page.js — renderer กลางสำหรับหน้าเนื้อหา (blog/gallery/catalog/download)
   UX เดียวกับ news/video: grid/list + pagination · ดึงสดจาก CMS
   ตั้งค่าในหน้า: window.DGA_LIST = { type, collection, sort, noun, perPage }
   ===================================================================== */
(function () {
  'use strict';
  const cfg = window.DGA_LIST || {};
  if (!cfg.type) return;
  const $ = (s, r = document) => r.querySelector(s);
  const LANG = document.documentElement.lang === 'en' ? 'en' : 'th';
  const STRAPI = window.DGA_CMS_URL || 'http://localhost:1337';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mediaUrl = m => { if (!m) return ''; const u = m.url || (m.data && m.data.attributes && m.data.attributes.url) || ''; return u && u.indexOf('http') !== 0 ? STRAPI + u : u; };
  const nf = n => (n | 0).toLocaleString('th-TH');
  const fmtDate = d => { if (!d) return ''; try { const x = new Date(d); return x.getDate() + ' ' + ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][x.getMonth()] + ' ' + (x.getFullYear() + 543); } catch (e) { return ''; } };

  const wrap = $('#listItems'); if (!wrap) return;
  const toolbar = $('#listToolbar'), pagerEl = $('#listPager');
  const noun = cfg.noun || 'รายการ';
  const TT = { read: 'อ่านบทความ', viewFile: 'ดูเอกสาร', download: 'ดาวน์โหลด', photos: 'รูป', prev: 'หน้าก่อนหน้า', next: 'หน้าถัดไป', loading: 'กำลังโหลด…', fail: 'โหลดข้อมูลไม่สำเร็จ', views: 'ครั้ง' };

  // ---- CSS ในตัว (ใช้ร่วม .news-card) ----
  if (!document.getElementById('list-page-css')) {
    const st = document.createElement('style'); st.id = 'list-page-css';
    st.textContent = `
    .gallery-card .news-thumb{position:relative;display:block;overflow:hidden}
    .gallery-card .gl-badge,.dl-card .dl-type{position:absolute;right:8px;bottom:8px;background:rgba(15,18,28,.82);color:#fff;font-size:12px;font-weight:600;padding:2px 8px;border-radius:6px}
    .dl-card{display:flex;flex-direction:column}
    .dl-card .dl-icon{display:flex;align-items:center;justify-content:center;height:120px;background:linear-gradient(135deg,var(--c-primary-50),#fff);border-bottom:1px solid var(--c-border);position:relative}
    .dl-card .dl-icon svg{width:48px;height:48px;color:var(--c-primary)}
    .dl-card .dl-meta{position:absolute;right:10px;top:10px;background:var(--c-primary);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;letter-spacing:.03em}`;
    document.head.appendChild(st);
  }

  // ---- การ์ด 4 ชนิด ----
  const CARDS = {
    blog: b => {
      const img = mediaUrl(b.coverImage);
      return `<article class="news-card">
        <a class="news-thumb" href="#" aria-hidden="true" tabindex="-1">${img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}${b.category ? `<span class="cat">${esc(b.category)}</span>` : ''}</a>
        <div class="nc-body">
          <h3 class="nc-title"><a href="#">${esc(b.title)}</a></h3>
          <p class="news-meta"><span><svg class="icon" aria-hidden="true"><use href="#i-cal"/></svg>${esc(fmtDate(b.publishDate))}</span><span><svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg>${nf(b.views)} ${TT.views}</span></p>
          <p class="nc-excerpt">${esc(b.excerpt || '')}</p>
          <a class="nws-btn" href="#">${TT.read} <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></a>
        </div></article>`;
    },
    gallery: g => {
      const img = mediaUrl(g.coverImage);
      const n = (g.images && (g.images.length || (g.images.data && g.images.data.length))) || 0;
      return `<article class="news-card gallery-card">
        <a class="news-thumb" href="#" aria-label="${esc(g.title)}">${img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}${n ? `<span class="gl-badge"><svg class="icon" aria-hidden="true" style="width:13px;height:13px"><use href="#i-grid"/></svg> ${n} ${TT.photos}</span>` : ''}</a>
        <div class="nc-body">
          <h3 class="nc-title"><a href="#">${esc(g.title)}</a></h3>
          <p class="news-meta"><span><svg class="icon" aria-hidden="true"><use href="#i-cal"/></svg>${esc(fmtDate(g.date))}</span><span><svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg>${nf(g.views)} ${TT.views}</span></p>
        </div></article>`;
    },
    catalog: c => {
      const img = mediaUrl(c.coverImage), file = mediaUrl(c.file) || '#';
      return `<article class="news-card">
        <a class="news-thumb" href="${esc(file)}" target="_blank" rel="noopener">${img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}${c.category ? `<span class="cat">${esc(c.category)}</span>` : ''}</a>
        <div class="nc-body">
          <h3 class="nc-title"><a href="${esc(file)}" target="_blank" rel="noopener">${esc(c.title)}</a></h3>
          <p class="nc-excerpt">${esc(c.description || '')}</p>
          <a class="nws-btn" href="${esc(file)}" target="_blank" rel="noopener">${TT.viewFile} <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></a>
        </div></article>`;
    },
    download: d => {
      const file = mediaUrl(d.file) || '#';
      const meta = [d.fileType, d.fileSize].filter(Boolean).join(' · ');
      return `<article class="news-card dl-card">
        <div class="dl-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><path d="M9 13h6M9 17h6"/></svg>${meta ? `<span class="dl-meta">${esc(d.fileType || '')}</span>` : ''}</div>
        <div class="nc-body">
          <h3 class="nc-title"><a href="${esc(file)}" target="_blank" rel="noopener">${esc(d.title)}</a></h3>
          <p class="nc-excerpt">${esc(d.description || '')}</p>
          <p class="news-meta"><span><svg class="icon" aria-hidden="true"><use href="#i-doc"/></svg>${esc(meta || d.fileType || '')}</span><span><svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg>${nf(d.downloads)} ครั้ง</span></p>
          <a class="nws-btn" href="${esc(file)}" target="_blank" rel="noopener" download>${TT.download} <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></a>
        </div></article>`;
    }
  };
  const card = CARDS[cfg.type];
  if (!card) return;

  const PER = cfg.perPage || 6;
  let page = 1, view = 'grid', ITEMS = [], totalPages = 1;
  try { const v = localStorage.getItem('dga-listview-' + cfg.type); if (v === 'list' || v === 'grid') view = v; } catch (e) {}

  function pageList(cur, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out = [1]; if (cur > 3) out.push('…');
    for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) out.push(i);
    if (cur < total - 2) out.push('…'); out.push(total); return out;
  }
  function pagerHTML() {
    if (totalPages <= 1) return '';
    let h = `<button type="button" class="news-pager__btn news-pager__btn--nav" data-step="-1" aria-label="${TT.prev}"${page === 1 ? ' disabled' : ''}><svg class="icon news-pager__prev" aria-hidden="true"><use href="#i-arrow"/></svg></button>`;
    pageList(page, totalPages).forEach(p => {
      if (p === '…') { h += `<span class="news-pager__gap" aria-hidden="true">…</span>`; return; }
      h += `<button type="button" class="news-pager__btn" data-page="${p}"${p === page ? ' aria-current="page"' : ''}>${p}</button>`;
    });
    h += `<button type="button" class="news-pager__btn news-pager__btn--nav" data-step="1" aria-label="${TT.next}"${page === totalPages ? ' disabled' : ''}><svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>`;
    return h;
  }
  function render(scroll) {
    page = Math.min(Math.max(1, page), totalPages);
    const from = (page - 1) * PER, to = Math.min(ITEMS.length, from + PER);
    wrap.className = 'nws-grid' + (view === 'list' ? ' is-list' : '');
    wrap.innerHTML = ITEMS.slice(from, to).map(card).join('');
    const c = toolbar && $('#listCount', toolbar);
    if (c) c.innerHTML = `ทั้งหมด <strong>${ITEMS.length}</strong> ${noun}` + (totalPages > 1 ? ` · กำลังแสดง ${from + 1}–${to}` : '');
    if (pagerEl) pagerEl.innerHTML = pagerHTML();
    document.querySelectorAll('#listView button').forEach(b => b.setAttribute('aria-pressed', b.getAttribute('data-view') === view ? 'true' : 'false'));
    if (scroll) { const top = wrap.getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top, behavior: 'smooth' }); }
  }

  const vg = $('#listView');
  if (vg) vg.addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (!b) return; view = b.getAttribute('data-view'); try { localStorage.setItem('dga-listview-' + cfg.type, view); } catch (e2) {} render(false); });
  if (pagerEl) pagerEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; if (b.dataset.page) page = +b.dataset.page; else if (b.dataset.step) page += +b.dataset.step; render(true); });

  wrap.innerHTML = `<p style="grid-column:1/-1;color:var(--c-text-muted);padding:24px 4px">${TT.loading}</p>`;
  const sort = cfg.sort ? '&sort=' + cfg.sort : '';
  fetch(STRAPI + '/api/' + cfg.collection + '?populate=*&pagination[pageSize]=100' + sort, { headers: { Accept: 'application/json' } })
    .then(r => r.json())
    .then(j => { ITEMS = (j && j.data) || []; totalPages = Math.max(1, Math.ceil(ITEMS.length / PER)); render(false); })
    .catch(() => { wrap.innerHTML = `<p style="grid-column:1/-1;color:var(--c-text-muted);padding:24px 4px">${TT.fail}</p>`; });
})();
