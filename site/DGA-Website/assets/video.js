/* =====================================================================
   video.js — หน้าคลังวิดีโอ (grid/list + pagination) ดึงสดจาก CMS /api/videos
   โครงเดียวกับ news.js เพื่อ UX สม่ำเสมอกับหน้าข่าวสาร
   ===================================================================== */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const LANG = document.documentElement.lang === 'en' ? 'en' : 'th';
  const STRAPI = window.DGA_CMS_URL || 'http://localhost:1337';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mediaUrl = m => { if (!m) return ''; const u = m.url || (m.data && m.data.attributes && m.data.attributes.url) || ''; return u && u.indexOf('http') !== 0 ? STRAPI + u : u; };

  const wrap = $('#videoItems');
  if (!wrap) return;
  const toolbar = $('#videoToolbar'), pagerEl = $('#videoPager');

  const T = {
    th: { count: n => `ทั้งหมด <strong>${n}</strong> วิดีโอ`, range: (a, b) => `กำลังแสดง ${a}–${b}`, prev: 'หน้าก่อนหน้า', next: 'หน้าถัดไป', pageOf: (i, n) => `ไปหน้า ${i} จาก ${n}`, views: 'ครั้ง', watch: 'ดูวิดีโอ', loading: 'กำลังโหลดวิดีโอ…', fail: 'โหลดวิดีโอไม่สำเร็จ' },
    en: { count: n => `<strong>${n}</strong> videos in total`, range: (a, b) => `showing ${a}–${b}`, prev: 'Previous page', next: 'Next page', pageOf: (i, n) => `Go to page ${i} of ${n}`, views: 'views', watch: 'Watch', loading: 'Loading videos…', fail: 'Could not load videos' }
  }[LANG];

  const PER = 6;
  let page = 1, view = 'grid', VIDEOS = [], totalPages = 1;
  try { const v = localStorage.getItem('dga-videoview'); if (v === 'list' || v === 'grid') view = v; } catch (e) {}

  /* ---- การ์ดวิดีโอ ---- */
  function card(v) {
    return `<article class="news-card video-card">
      <a class="news-thumb" href="${esc(v.url)}" target="_blank" rel="noopener" aria-label="${esc(v.title)}">
        ${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
        <span class="vid-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
        ${v.duration ? `<span class="vid-dur">${esc(v.duration)}</span>` : ''}
      </a>
      <div class="nc-body">
        <h3 class="nc-title"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a></h3>
        <p class="news-meta"><span><svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg>${(v.views | 0).toLocaleString('th-TH')} ${T.views}</span></p>
        <a class="nws-btn" href="${esc(v.url)}" target="_blank" rel="noopener">${T.watch} <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></a>
      </div>
    </article>`;
  }

  /* ---- pagination ---- */
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
    const from = (page - 1) * PER, to = Math.min(VIDEOS.length, from + PER);
    wrap.className = 'nws-grid' + (view === 'list' ? ' is-list' : '');
    wrap.innerHTML = VIDEOS.slice(from, to).map(card).join('');
    if (toolbar) {
      const c = $('#videoCount', toolbar);
      if (c) c.innerHTML = T.count(VIDEOS.length) + (totalPages > 1 ? ` · ${T.range(from + 1, to)}` : '');
    }
    if (pagerEl) pagerEl.innerHTML = pagerHTML();
    document.querySelectorAll('#videoView button').forEach(b => b.setAttribute('aria-pressed', b.getAttribute('data-view') === view ? 'true' : 'false'));
    if (scroll) { const top = wrap.getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top, behavior: 'smooth' }); }
  }

  /* ---- events ---- */
  const viewGroup = $('#videoView');
  if (viewGroup) viewGroup.addEventListener('click', e => {
    const b = e.target.closest('button[data-view]'); if (!b) return;
    view = b.getAttribute('data-view');
    try { localStorage.setItem('dga-videoview', view); } catch (e2) {}
    render(false);
  });
  if (pagerEl) pagerEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.page) page = +b.dataset.page;
    else if (b.dataset.step) page += +b.dataset.step;
    render(true);
  });

  /* ---- โหลดข้อมูลจาก CMS ---- */
  wrap.innerHTML = `<p style="grid-column:1/-1;color:var(--c-text-muted);padding:24px 4px">${T.loading}</p>`;
  fetch(STRAPI + '/api/videos?populate=*&sort=date:desc&pagination[pageSize]=100', { headers: { Accept: 'application/json' } })
    .then(r => r.json())
    .then(j => {
      VIDEOS = ((j && j.data) || []).map(v => ({ title: v.title, thumb: mediaUrl(v.thumbnail), duration: v.duration, views: v.views, date: v.date, url: v.videoUrl || '#' }));
      totalPages = Math.max(1, Math.ceil(VIDEOS.length / PER));
      render(false);
    })
    .catch(() => { wrap.innerHTML = `<p style="grid-column:1/-1;color:var(--c-text-muted);padding:24px 4px">${T.fail}</p>`; });
})();
