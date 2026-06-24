/* =====================================================================
   news.js — หน้า DGA News รวมข่าว (grid/list + pagination)
   อ่านข้อมูลจาก window.DGA_NEWS (news-data.js) · รองรับ 2 ภาษา (th/en)
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const LANG = document.documentElement.lang === 'en' ? 'en' : 'th';
  const NEWS = window.DGA_NEWS || [];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const wrap = $('#newsItems');
  if (!wrap) return;
  const toolbar = $('#newsToolbar');
  const pagerEl = $('#newsPager');

  const T = {
    th: {
      count: n => `ทั้งหมด <strong>${n}</strong> ข่าว`,
      range: (a, b) => `กำลังแสดง ${a}–${b}`,
      grid: 'มุมมองกริด', list: 'มุมมองรายการ',
      read: 'อ่านรายละเอียด', prev: 'หน้าก่อนหน้า', next: 'หน้าถัดไป',
      pageOf: (i, n) => `ไปหน้า ${i} จาก ${n}`, views: 'ครั้ง'
    },
    en: {
      count: n => `<strong>${n}</strong> news in total`,
      range: (a, b) => `showing ${a}–${b}`,
      grid: 'Grid view', list: 'List view',
      read: 'Read more', prev: 'Previous page', next: 'Next page',
      pageOf: (i, n) => `Go to page ${i} of ${n}`, views: 'views'
    }
  }[LANG];

  const PER = 6;
  let page = 1;
  const totalPages = Math.max(1, Math.ceil(NEWS.length / PER));
  let view = 'grid';
  try { const v = localStorage.getItem('dga-newsview'); if (v === 'list' || v === 'grid') view = v; } catch (e) {}

  /* ---- การ์ดข่าว ---- */
  function card(n) {
    const cat = (n.cat && n.cat[LANG]) || '';
    const title = (n.title && n.title[LANG]) || '';
    const date = (n.date && n.date[LANG]) || '';
    const ex = (n.excerpt && n.excerpt[LANG]) || '';
    const img = n.img || `/assets/image/news/${n.id}.jpeg`;
    return `<article class="news-card">
      <a class="news-thumb" href="#" tabindex="-1" aria-hidden="true"><img src="${img}" alt="" loading="lazy" onerror="this.remove()"><span class="ph ${n.ph || 'n1'}"><svg aria-hidden="true"><use href="#${n.icon || 'i-grid'}"/></svg></span><span class="cat">${esc(cat)}</span></a>
      <div class="nc-body">
        <h3 class="nc-title"><a href="#">${esc(title)}</a></h3>
        <p class="news-meta"><span><svg class="icon" aria-hidden="true"><use href="#i-cal"/></svg>${esc(date)}</span><span><svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg>${n.views|0}</span></p>
        <p class="nc-excerpt">${esc(ex)}</p>
        <a class="nws-btn" href="#">${T.read} <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></a>
      </div>
    </article>`;
  }

  /* ---- pagination แบบมีเลขหน้า + ... ---- */
  function pageList(cur, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out = [1];
    if (cur > 3) out.push('…');
    for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) out.push(i);
    if (cur < total - 2) out.push('…');
    out.push(total);
    return out;
  }
  function pagerHTML() {
    if (totalPages <= 1) return '';
    let html = `<button type="button" class="news-pager__btn news-pager__btn--nav" data-step="-1" aria-label="${T.prev}"${page === 1 ? ' disabled' : ''}><svg class="icon news-pager__prev" aria-hidden="true"><use href="#i-arrow"/></svg></button>`;
    pageList(page, totalPages).forEach(p => {
      if (p === '…') { html += `<span class="news-pager__gap" aria-hidden="true">…</span>`; return; }
      html += `<button type="button" class="news-pager__btn" data-page="${p}" aria-label="${T.pageOf(p, totalPages)}"${p === page ? ' aria-current="page"' : ''}>${p}</button>`;
    });
    html += `<button type="button" class="news-pager__btn news-pager__btn--nav" data-step="1" aria-label="${T.next}"${page === totalPages ? ' disabled' : ''}><svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>`;
    return html;
  }

  /* ---- render ---- */
  function render(scroll) {
    page = Math.min(Math.max(1, page), totalPages);
    const from = (page - 1) * PER, to = Math.min(NEWS.length, from + PER);
    wrap.className = 'nws-grid' + (view === 'list' ? ' is-list' : '');
    wrap.innerHTML = NEWS.slice(from, to).map(card).join('');
    if (toolbar) {
      const c = $('#newsCount', toolbar);
      if (c) c.innerHTML = T.count(NEWS.length) + (totalPages > 1 ? ` · ${T.range(from + 1, to)}` : '');
    }
    if (pagerEl) pagerEl.innerHTML = pagerHTML();
    document.querySelectorAll('#newsView button').forEach(b => {
      const on = b.getAttribute('data-view') === view;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (scroll) { const top = wrap.getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top, behavior: 'smooth' }); }
  }

  /* ---- events ---- */
  const viewGroup = $('#newsView');
  if (viewGroup) viewGroup.addEventListener('click', e => {
    const b = e.target.closest('button[data-view]'); if (!b) return;
    view = b.getAttribute('data-view');
    try { localStorage.setItem('dga-newsview', view); } catch (e2) {}
    render(false);
  });
  if (pagerEl) pagerEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.page) page = +b.dataset.page;
    else if (b.dataset.step) page += +b.dataset.step;
    render(true);
  });

  render(false);
})();
