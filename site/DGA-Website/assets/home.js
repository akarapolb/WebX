/* ============================================================================
   DGA Home — พฤติกรรมหน้าแรก (ใช้ร่วมไทย/อังกฤษ)
   ครอบคลุม: โหมดมืด, ปรับขนาดอักษร, ความต่างสูง, mega menu, เมนูมือถือ, AI, คุกกี้
   ทุกอย่างเข้าถึงด้วยคีย์บอร์ด (WCAG 2.1.1, 2.4.x)
   ============================================================================ */
(function(){
  const root = document.documentElement;

  /* ---- โหลดวิดเจ็ตช่วยการเข้าถึง (Accessibility Widget) ทุกหน้า ---- */
  (function(){
    if (!document.getElementById('a11y-css')){
      const l = document.createElement('link'); l.id='a11y-css'; l.rel='stylesheet'; l.href='/assets/a11y.css';
      document.head.appendChild(l);
    }
    if (!document.getElementById('a11y-js')){
      const s = document.createElement('script'); s.id='a11y-js'; s.src='/assets/a11y.js'; s.defer=true;
      document.body.appendChild(s);
    }
  })();

  /* ---- โหลด Login Modal (popup เข้าสู่ระบบ) ทุกหน้า ---- */
  (function(){
    if (!document.getElementById('lgm-css')){
      const l = document.createElement('link'); l.id='lgm-css'; l.rel='stylesheet'; l.href='/assets/login-modal.css';
      document.head.appendChild(l);
    }
    if (!document.getElementById('lgm-js')){
      const s = document.createElement('script'); s.id='lgm-js'; s.src='/assets/login-modal.js'; s.defer=true;
      document.body.appendChild(s);
    }
  })();

  /* ---- โหมดมืด ---- */
  const themeBtn = document.getElementById('themeBtn');
  function syncTheme(){ const d = root.getAttribute('data-theme')==='dark';
    themeBtn.setAttribute('aria-pressed', String(d));
    themeBtn.querySelector('use').setAttribute('href', d ? '#i-sun' : '#i-moon'); }
  if (themeBtn){ syncTheme();
    themeBtn.addEventListener('click', ()=>{ const n = root.getAttribute('data-theme')==='dark'?'light':'dark';
      root.setAttribute('data-theme', n); try{localStorage.setItem('dga-theme', n)}catch(e){} syncTheme(); }); }

  /* ---- ปรับขนาดตัวอักษร (รองรับผู้พิการ) ---- */
  const sizes = ['100%','112.5%','125%','137.5%'];
  function curIdx(){ const i = sizes.indexOf(root.style.fontSize||'100%'); return i<0?0:i; }
  function setFont(i){ i = Math.max(0, Math.min(sizes.length-1, i)); root.style.fontSize = sizes[i];
    try{localStorage.setItem('dga-fontscale', sizes[i])}catch(e){} }
  document.getElementById('fontUp')?.addEventListener('click', ()=>setFont(curIdx()+1));
  document.getElementById('fontDown')?.addEventListener('click', ()=>setFont(curIdx()-1));
  document.getElementById('fontReset')?.addEventListener('click', ()=>setFont(0));

  /* ---- โหมดความต่างสูง ---- */
  const contrastBtn = document.getElementById('contrastBtn');
  function syncContrast(){ contrastBtn.setAttribute('aria-pressed', String(root.getAttribute('data-contrast')==='high')); }
  if (contrastBtn){ syncContrast();
    contrastBtn.addEventListener('click', ()=>{ const on = root.getAttribute('data-contrast')==='high';
      if(on){ root.removeAttribute('data-contrast'); try{localStorage.removeItem('dga-contrast')}catch(e){} }
      else { root.setAttribute('data-contrast','high'); try{localStorage.setItem('dga-contrast','high')}catch(e){} }
      syncContrast(); }); }

  /* ---- Mega menu (Esc ปิด, คลิกนอกปิด) ---- */
  const megaBtns = [...document.querySelectorAll('[data-mega]')];
  function closeAllMega(except){ megaBtns.forEach(b=>{ if(b!==except){ b.setAttribute('aria-expanded','false');
    document.getElementById(b.getAttribute('aria-controls')).hidden = true; } }); }
  megaBtns.forEach(btn=>{ const panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', ()=>{ const open = btn.getAttribute('aria-expanded')==='true';
      closeAllMega(btn); btn.setAttribute('aria-expanded', String(!open)); panel.hidden = open; }); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ const o = megaBtns.find(b=>b.getAttribute('aria-expanded')==='true');
    if(o){ closeAllMega(); o.focus(); } } });
  document.addEventListener('click', e=>{ if(!e.target.closest('.main-nav') && !e.target.closest('.mega')) closeAllMega(); });

  /* ---- Header: เงาเมื่อเลื่อนหน้า ---- */
  const header = document.querySelector('.site-header');
  if (header){ const onScroll = ()=> header.classList.toggle('scrolled', window.scrollY > 8);
    onScroll(); window.addEventListener('scroll', onScroll, { passive:true }); }

  /* ---- Mobile drawer (สร้างเมนูจาก mega menu อัตโนมัติ = ไม่ซ้ำซ้อน) ---- */
  const navToggle = document.getElementById('navToggle');
  const drawer = document.getElementById('mobileDrawer');
  const backdrop = document.getElementById('navBackdrop');
  const drawerNav = document.getElementById('drawerNav');
  const drawerClose = document.getElementById('drawerClose');
  if (navToggle && drawer && drawerNav){
    // สร้างเมนูมือถือจากเมนูหลักตามลำดับ: ลิงก์ตรง = ลิงก์เดี่ยว, ปุ่ม mega = accordion
    document.querySelectorAll('.main-nav > a, .main-nav > [data-mega]').forEach(el=>{
      if (el.hasAttribute('data-mega')){
        const panel = document.getElementById(el.getAttribute('aria-controls'));
        const det = document.createElement('details');
        const sum = document.createElement('summary'); sum.textContent = el.textContent.trim();
        det.appendChild(sum);
        const links = document.createElement('div'); links.className = 'links';
        panel.querySelectorAll('.mega-col a, .mega-feature').forEach(a=>{
          const link = document.createElement('a');
          link.href = a.getAttribute('href') || '#';
          const tgt = a.getAttribute('target'); if (tgt) link.target = tgt;
          const rel = a.getAttribute('rel'); if (rel) link.rel = rel;
          const b = a.querySelector('b');
          link.textContent = (b ? b.textContent : a.textContent).trim();
          links.appendChild(link);
        });
        det.appendChild(links); drawerNav.appendChild(det);
      } else {
        // ลิงก์ตรง เช่น หน้าแรก
        const link = document.createElement('a');
        link.href = el.getAttribute('href') || '#';
        link.textContent = el.textContent.trim();
        link.className = 'drawer-link';
        drawerNav.appendChild(link);
      }
    });

    let lastFocus = null;
    function swapBurger(open){ const u = navToggle.querySelector('use'); if (u) u.setAttribute('href', open ? '#i-x' : '#i-menu'); }
    function openDrawer(){ lastFocus = document.activeElement;
      drawer.classList.add('open'); backdrop.classList.add('open'); document.body.classList.add('nav-open');
      navToggle.setAttribute('aria-expanded','true'); swapBurger(true); drawerClose.focus(); }
    function closeDrawer(){ drawer.classList.remove('open'); backdrop.classList.remove('open'); document.body.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded','false'); swapBurger(false); lastFocus && lastFocus.focus(); }

    navToggle.addEventListener('click', ()=> drawer.classList.contains('open') ? closeDrawer() : openDrawer());
    drawerClose.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);
    drawerNav.addEventListener('click', e=>{ if (e.target.closest('a')) closeDrawer(); });   // ปิดเมื่อเลือกลิงก์
    document.addEventListener('keydown', e=>{ if (e.key==='Escape' && drawer.classList.contains('open')) closeDrawer(); });
    // focus trap ภายใน drawer (WCAG 2.4.3)
    drawer.addEventListener('keydown', e=>{ if (e.key!=='Tab') return;
      const f = drawer.querySelectorAll('a[href],button,input,summary,[tabindex]:not([tabindex="-1"])');
      if (!f.length) return; const first = f[0], last = f[f.length-1];
      if (e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    });
  }

  /* ---- DGA Guide chatbot ถูกสร้างในส่วนท้าย (ดูบล็อก "DGA Guide") ---- */

  /* ---- Cookie consent (PDPA) ---- */
  const cookie = document.getElementById('cookie');
  if (cookie && !localStorage.getItem('dga-cookie')) cookie.hidden = false;
  function setCookie(v){ try{localStorage.setItem('dga-cookie', v)}catch(e){} cookie.hidden = true; }
  cookie?.querySelectorAll('[data-cookie]').forEach(b=>b.addEventListener('click', ()=>setCookie(b.dataset.cookie)));
  document.getElementById('cookieSettings')?.addEventListener('click', ()=>{ cookie.hidden = false; cookie.querySelector('button').focus(); });

  /* ---- Scroll reveal / action animation (ปิดถ้าผู้ใช้ขอลดการเคลื่อนไหว) ---- */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && 'IntersectionObserver' in window){
    root.classList.add('js-reveal');
    // เลือกองค์ประกอบที่จะค่อย ๆ ปรากฏ + หน่วงเวลาเหลื่อม (stagger) ในแต่ละกลุ่ม
    const selectors = ['.home-hero .wrap > div:first-child > *','.block__head','.svc',
      '.stat-item','.group','.news-card','.ch-card','.award','.platform','.featured .panel','.cta-band','.faq-item'];
    selectors.forEach(sel=>{ document.querySelectorAll(sel).forEach((el,i)=>{
      el.setAttribute('data-reveal',''); el.style.transitionDelay = (i % 6) * 70 + 'ms'; }); });
    const io = new IntersectionObserver(entries=>{ entries.forEach(e=>{
      if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold:.12, rootMargin:'0px 0px -40px 0px' });
    document.querySelectorAll('[data-reveal]').forEach(el=>io.observe(el));
  }

  /* ---- FAQ accordion (เปิดได้หลายข้อ + aria-expanded ตามสถานะ) ---- */
  document.querySelectorAll('.faq-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const item = btn.closest('.faq-item');
      const open = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  /* ปุ่ม "ถาม DGA Guide" ในการ์ดติดต่อ → เปิดแผงผู้ช่วย (คลิกปุ่มลอย) */
  document.getElementById('faqAskGuide')?.addEventListener('click', ()=>{
    document.getElementById('aiBtn')?.click();
  });

  /* ---- Count-up: ตัวเลขสถิติวิ่งนับขึ้นเมื่อเลื่อนถึง ---- */
  const statNums = document.querySelectorAll('.stat-num[data-count]');
  if (statNums.length){
    const reduceN = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // จัดรูปแบบตัวเลขไทย: คั่นหลักพันด้วย , และทศนิยมตามที่กำหนด
    const fmtNum = (val, dec)=> Number(val).toLocaleString('th-TH',
      { minimumFractionDigits:dec, maximumFractionDigits:dec });
    const runCount = el=>{
      const target = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.decimals || '0', 10);
      const pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
      if (reduceN){ el.textContent = pre + fmtNum(target, dec) + suf; return; }
      const dur = 1500, ease = t => 1 - Math.pow(1 - t, 3); // easeOutCubic
      let begin = null;
      const step = ts=>{
        if (begin === null) begin = ts;
        const p = Math.min((ts - begin) / dur, 1);
        el.textContent = pre + fmtNum(target * ease(p), dec) + suf;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = pre + fmtNum(target, dec) + suf;
      };
      requestAnimationFrame(step);
    };
    if ('IntersectionObserver' in window){
      const ioN = new IntersectionObserver((ents)=>{ ents.forEach(e=>{
        if (e.isIntersecting){ runCount(e.target); ioN.unobserve(e.target); } });
      }, { threshold:.5 });
      statNums.forEach(n=>ioN.observe(n));
    } else statNums.forEach(runCount);
  }

  /* ---- Hero background slideshow (5 รูป crossfade + Ken Burns) ---- */
  const heroBg = document.getElementById('heroBg'), heroDots = document.getElementById('heroDots');
  if (heroBg && heroDots){
    const slides = [...heroBg.querySelectorAll('.hero-slide')];
    const label = heroDots.getAttribute('data-label') || 'Slide';
    let idx = 0, timer = null;
    slides.forEach((s,i)=>{ const b = document.createElement('button'); b.type='button';
      b.setAttribute('aria-label', label + ' ' + (i+1));
      if (i===0) b.setAttribute('aria-current','true');
      b.addEventListener('click', ()=>{ go(i); restart(); }); heroDots.appendChild(b); });
    const dots = [...heroDots.children];
    function go(n){ slides[idx].classList.remove('is-active'); dots[idx]?.removeAttribute('aria-current');
      idx = (n + slides.length) % slides.length;
      slides[idx].classList.add('is-active'); dots[idx]?.setAttribute('aria-current','true'); }
    const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function start(){ if (!slow && slides.length>1) timer = setInterval(()=>go(idx+1), 5500); }
    function stop(){ clearInterval(timer); }
    function restart(){ stop(); start(); }
    start();
    const heroEl = heroBg.closest('.home-hero');
    heroEl.addEventListener('mouseenter', stop);     // หยุดเมื่อชี้เมาส์ (UX)
    heroEl.addEventListener('mouseleave', start);
    heroEl.addEventListener('focusin', stop);        // หยุดเมื่อโฟกัสในส่วนนี้
    heroEl.addEventListener('focusout', start);
  }

  /* ---- แสงออโรราไหลในพื้นหลัง hero (CSS จัดการการเคลื่อนไหว/ปิดเมื่อ reduced-motion) ---- */
  const heroSec = document.querySelector('.home-hero');
  if (heroSec){
    const layer = document.createElement('div'); layer.className = 'hero-aurora'; layer.setAttribute('aria-hidden','true');
    layer.innerHTML = '<span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>';
    heroSec.insertBefore(layer, heroSec.querySelector('.wrap'));   // เหนือ overlay ใต้ตัวอักษร
  }

  /* ---- News tabs (DGA News / บทความ) — สลับ panel แบบ fade + คีย์บอร์ด ---- */
  document.querySelectorAll('.news-tabs').forEach(tabsEl=>{
    const tabs = [...tabsEl.querySelectorAll('.news-tab')]; const sec = tabsEl.closest('section');
    function select(tab){ tabs.forEach(t=>{ const on = t===tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on?0:-1; });
      sec.querySelectorAll('.news-panel').forEach(p=> p.hidden = p.dataset.tab !== tab.dataset.tab); }
    tabs.forEach((tab,i)=>{ tab.addEventListener('click', ()=> select(tab));
      tab.addEventListener('keydown', e=>{ if (e.key==='ArrowRight' || e.key==='ArrowLeft'){ e.preventDefault();
        const n = tabs[(i + (e.key==='ArrowRight'?1:-1) + tabs.length) % tabs.length]; n.focus(); select(n); } }); });
  });

  /* ---- Highlight banner carousel (ใต้ Hero) ---- */
  document.querySelectorAll('.hl-wrap').forEach(wrap=>{
    const track = wrap.querySelector('.hl-track'); const slides = [...track.children];
    const dotsBox = wrap.querySelector('.hl-dots'); const playBtn = wrap.querySelector('.hl-play');
    if (slides.length < 2){ if (playBtn) playBtn.style.display='none'; return; }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
    const PLAY  = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    let idx = 0, timer = null, paused = reduce;
    const label = dotsBox.getAttribute('data-label') || 'Slide';
    const countEl = wrap.querySelector('.hl-count');
    const many = slides.length > 7;                 // มากเกินไป → ใช้ตัวนับแทน dots
    if (many){ dotsBox.style.display = 'none'; }
    else { slides.forEach((s,i)=>{ const b = document.createElement('button'); b.type='button'; b.setAttribute('aria-label', label + ' ' + (i+1));
      if (i===0) b.setAttribute('aria-current','true'); b.addEventListener('click', ()=>{ go(i); restart(); }); dotsBox.appendChild(b); }); }
    const dots = [...dotsBox.children];
    function setH(){ const h = slides[idx].offsetHeight; if (h) wrap.style.height = h + 'px'; }   // กรอบสูงตามสไลด์ปัจจุบัน
    function go(n){ idx = (n + slides.length) % slides.length; track.style.transform = 'translateX(' + (-idx*100) + '%)';
      dots.forEach((d,i)=>{ if (i===idx) d.setAttribute('aria-current','true'); else d.removeAttribute('aria-current'); });
      if (countEl) countEl.textContent = (idx+1) + ' / ' + slides.length; setH(); }
    if (countEl) countEl.textContent = '1 / ' + slides.length;
    slides.forEach(s=>{ const im = s.querySelector('img'); if (im) im.addEventListener('load', ()=>{ if (slides[idx]===s) setH(); }); });
    window.addEventListener('resize', setH);
    requestAnimationFrame(setH);
    function start(){ if (!paused && !timer) timer = setInterval(()=> go(idx+1), 5500); }
    function stop(){ if (timer){ clearInterval(timer); timer = null; } }
    function restart(){ stop(); start(); }
    if (playBtn){
      if (reduce){ playBtn.innerHTML = PLAY; playBtn.setAttribute('aria-label', playBtn.dataset.play); }
      playBtn.addEventListener('click', ()=>{ paused = !paused;
        if (paused){ stop(); playBtn.innerHTML = PLAY; playBtn.setAttribute('aria-label', playBtn.dataset.play); }
        else { playBtn.innerHTML = PAUSE; playBtn.setAttribute('aria-label', playBtn.dataset.pause); start(); } });
    }
    wrap.querySelector('.hl-prev').addEventListener('click', ()=>{ go(idx-1); restart(); });
    wrap.querySelector('.hl-next').addEventListener('click', ()=>{ go(idx+1); restart(); });
    wrap.addEventListener('mouseenter', stop); wrap.addEventListener('mouseleave', ()=>{ if (!paused) start(); });
    wrap.addEventListener('focusin', stop); wrap.addEventListener('focusout', ()=>{ if (!paused) start(); });
    wrap.addEventListener('keydown', e=>{ if (e.key==='ArrowLeft'){ go(idx-1); restart(); } else if (e.key==='ArrowRight'){ go(idx+1); restart(); } });
    let sx = null;                                   // ปัดนิ้ว (swipe)
    track.addEventListener('pointerdown', e=>{ sx = e.clientX; });
    track.addEventListener('pointerup', e=>{ if (sx===null) return; const dx = e.clientX - sx;
      if (Math.abs(dx) > 40){ go(idx + (dx<0?1:-1)); restart(); } sx = null; });
    start();
  });

  /* ---- News view toggle (Card / Grid) ---- */
  document.querySelectorAll('.news-view').forEach(group=>{
    const sec = group.closest('section'); const btns = [...group.querySelectorAll('button')];
    btns.forEach(b=> b.addEventListener('click', ()=>{
      btns.forEach(x=> x.setAttribute('aria-pressed', String(x===b)));
      const grid = b.dataset.view === 'grid';
      sec.querySelectorAll('.news-items').forEach(it=> it.classList.toggle('is-grid', grid));
    }));
  });

  /* ---- DGA Channel: กำหนดหมวดให้การ์ด + กรองตามแท็บ + สลับ Grid/List ---- */
  const CH_CATS = ['event','std','std','std','std','talk'];   // ลำดับตรงกับการ์ด 6 ใบ
  const chLang = document.documentElement.lang === 'en' ? 'en' : 'th';   // ใช้ภายในบล็อก (เลี่ยง TDZ ของ LANG)
  const CH_LABEL = chLang === 'en' ? { event:'Event', std:'Standard', talk:'Interview' }
                                   : { event:'กิจกรรม', std:'มาตรฐาน', talk:'สัมภาษณ์' };
  document.querySelectorAll('.channel .ch-card').forEach((c,i)=>{
    const cat = CH_CATS[i % CH_CATS.length]; c.dataset.cat = cat;
    const thumb = c.querySelector('.ch-thumb');
    if (thumb && !thumb.querySelector('.cat')){
      const chip = document.createElement('span'); chip.className = 'cat'; chip.textContent = CH_LABEL[cat] || '';
      thumb.appendChild(chip);
    }
  });
  // กรองหมวด
  document.querySelectorAll('.ch-tabs').forEach(tabsEl=>{
    const tabs = [...tabsEl.querySelectorAll('.ch-tab')]; const sec = tabsEl.closest('section');
    function select(tab){ tabs.forEach(t=>{ const on=t===tab; t.setAttribute('aria-selected',String(on)); t.tabIndex=on?0:-1; });
      const cat = tab.dataset.cat;
      sec.querySelectorAll('.ch-card').forEach(c=>{ c.style.display = (cat==='all' || c.dataset.cat===cat) ? '' : 'none'; }); }
    tabs.forEach((tab,i)=>{ tab.addEventListener('click', ()=> select(tab));
      tab.addEventListener('keydown', e=>{ if (e.key==='ArrowRight' || e.key==='ArrowLeft'){ e.preventDefault();
        const n = tabs[(i + (e.key==='ArrowRight'?1:-1) + tabs.length) % tabs.length]; n.focus(); select(n); } }); });
  });
  // สลับมุมมอง Grid / List
  document.querySelectorAll('.ch-view').forEach(group=>{
    const sec = group.closest('section'); const btns = [...group.querySelectorAll('button')];
    btns.forEach(b=> b.addEventListener('click', ()=>{
      btns.forEach(x=> x.setAttribute('aria-pressed', String(x===b)));
      sec.querySelectorAll('.ch-grid').forEach(g=> g.classList.toggle('is-list', b.dataset.view==='list'));
    }));
  });

  /* ---- Smart search: typewriter placeholder (ปิดเมื่อ reduced-motion/โฟกัส) ---- */
  const tw = document.querySelector('[data-typewriter]');
  if (tw && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    let phrases = []; try { phrases = JSON.parse(tw.getAttribute('data-phrases') || '[]'); } catch(e){}
    if (phrases.length){
      let pi = 0, ci = 0, deleting = false;
      const base = tw.getAttribute('placeholder');
      function tick(){
        if (document.activeElement === tw || tw.value){ tw.setAttribute('placeholder', base); return setTimeout(tick, 800); }
        const word = phrases[pi];
        tw.setAttribute('placeholder', word.slice(0, ci) + '▌');
        if (!deleting){ ci++; if (ci > word.length){ deleting = true; return setTimeout(tick, 1500); } }
        else { ci--; if (ci < 0){ deleting = false; pi = (pi+1) % phrases.length; ci = 0; } }
        setTimeout(tick, deleting ? 38 : 78);
      }
      setTimeout(tick, 1000);
    }
  }

  /* ====================================================================
     ค้นหาอัจฉริยะ + AI (ทำงานจริงจาก mock data ใน search-data.js)
     ==================================================================== */
  const DATA = (window.DGA_DATA && window.DGA_DATA.items) || [];
  const LANG = document.documentElement.lang === 'en' ? 'en' : 'th';
  const TXT = LANG === 'en'
    ? { sources:'Sources', none:'Sorry, I couldn’t find an exact match. Try other keywords, or call the DGA Contact Center at 0-2612-6000.', think:'Searching…' }
    : { sources:'แหล่งข้อมูล', none:'ขออภัย ไม่พบข้อมูลที่ตรงคำถาม ลองพิมพ์คำค้นใหม่ หรือติดต่อศูนย์บริการ สพร. โทร 0-2612-6000', think:'กำลังค้นหาคำตอบ…' };

  function searchItems(q, n){
    const toks = (q||'').toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    return DATA.map(it=>{
      const title = (it.title[LANG]||'').toLowerCase();
      const hay = (title + ' ' + (it.title.en||'') + ' ' + (it.desc[LANG]||'') + ' ' + (it.kw||'')).toLowerCase();
      let s = 0; toks.forEach(t=>{ if (title.includes(t)) s += 3; else if (hay.includes(t)) s += 1; });
      return { it, s };
    }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0, n||6).map(x=>x.it);
  }
  function iconSvg(id){ return '<svg class="icon" aria-hidden="true"><use href="#'+(id||'i-search')+'"/></svg>'; }
  function esc(s){ return (s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function answerParts(q){
    const hits = searchItems(q, 3);
    if (!hits.length) return { html:'<p>'+TXT.none+'</p>', text:TXT.none };
    const top = hits[0];
    const ans = (top.answer && top.answer[LANG]) || top.desc[LANG];
    const src = hits.map(h=>'<a href="'+h.url+'">'+esc(h.title[LANG])+'</a>').join('');
    return { html:'<p>'+esc(ans)+'</p><div class="ai-src"><span>'+TXT.sources+':</span>'+src+'</div>', text:ans };
  }
  function answerHTML(q){ return answerParts(q).html; }

  /* ===== DGA Guide — สร้าง widget แชต (ไทย/อังกฤษชุดเดียว) ===== */
  const AV = '/assets/image/Avatar.png';
  const G = LANG === 'en' ? {
    name:'DGA Guide', role:'Digital Government Navigator', fab:'Ask DGA Guide', teaser:'Hi! How can DGA Guide help you today?',
    openA:'Open DGA Guide chat', closeA:'Close chat', minA:'Minimize', expandA:'Expand', send:'Send', micA:'Voice input', readA:'Read aloud', placeholder:'Type your question…',
    welcome:'Hi! How can DGA Guide help you today? 👋',
    quickTitle:'Get started', exTitle:'Example questions',
    quick:[ {ic:'i-search',label:'Find a digital service',q:'Tang Rath'},
      {ic:'i-doc',label:'Find a standard document',q:'standards'},
      {ic:'i-user',label:'I’m a citizen',q:'ThaID'},
      {ic:'i-build',label:'I’m a government agency',q:'GDX'},
      {ic:'i-chat',label:'Contact DGA',q:'contact'} ],
    examples:['How do I get a ThaID?','Open government data','How to contact DGA'],
    disclaimer:'Answers are a search aid — please verify with official DGA sources.'
  } : {
    name:'DGA Guide', role:'ผู้ช่วยนำทางบริการรัฐดิจิทัล', fab:'ถาม DGA Guide', teaser:'สวัสดีค่ะ ให้ DGA Guide ช่วยอะไรดีคะ?',
    openA:'เปิดแชต DGA Guide', closeA:'ปิดแชต', minA:'ย่อหน้าต่าง', expandA:'ขยายหน้าต่าง', send:'ส่งคำถาม', micA:'พิมพ์ด้วยเสียง', readA:'อ่านออกเสียง', placeholder:'พิมพ์คำถาม…',
    welcome:'สวัสดีค่ะ ให้ DGA Guide ช่วยอะไรดีคะ? 👋',
    quickTitle:'เริ่มต้นใช้งาน', exTitle:'ตัวอย่างคำถาม',
    quick:[ {ic:'i-search',label:'ค้นหาบริการดิจิทัล',q:'ทางรัฐ'},
      {ic:'i-doc',label:'หาเอกสารมาตรฐาน',q:'มาตรฐาน'},
      {ic:'i-user',label:'ฉันเป็นประชาชน',q:'ThaID'},
      {ic:'i-build',label:'ฉันเป็นหน่วยงานรัฐ',q:'GDX'},
      {ic:'i-chat',label:'ติดต่อ สพร.',q:'ติดต่อ'} ],
    examples:['ทำ ThaID อย่างไร','ขอข้อมูลเปิดภาครัฐ','ติดต่อ สพร. อย่างไร'],
    disclaimer:'คำตอบเป็นเพียงตัวช่วยค้นหา โปรดตรวจสอบกับข้อมูลทางการของ สพร.'
  };

  // ปุ่มลอย
  const fab = document.createElement('div'); fab.className = 'dga-fab';
  fab.innerHTML =
    '<button id="aiBtn" class="dga-fab-btn" type="button" aria-expanded="false" aria-controls="dgaPanel" aria-label="'+G.openA+'">'+
      '<img src="'+AV+'" alt=""><span class="dot" aria-hidden="true"></span></button>'+
    '<div class="dga-teaser" id="dgaTeaser" role="button" tabindex="0" aria-label="'+G.openA+'">'+
      '<button class="t-close" id="dgaTeaserX" type="button" aria-label="'+(LANG==='en'?'Dismiss':'ปิด')+'">'+iconSvg('i-x')+'</button>'+
      '<span>'+esc(G.teaser)+'</span></div>';
  document.body.appendChild(fab);
  const aiBtn = fab.querySelector('#aiBtn');

  // แผงแชต
  const panel = document.createElement('section'); panel.className = 'dga-panel'; panel.id = 'dgaPanel';
  panel.setAttribute('role','dialog'); panel.setAttribute('aria-label', G.name + ' — ' + G.role);
  var MINUS = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 13h14"/></svg>';
  var MIC = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3M9 21h6"/></svg>';
  var SPK = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9v6h3l5 4V5L7 9z"/><path d="M16 8.5a5 5 0 0 1 0 7"/></svg>';
  panel.innerHTML =
    '<div class="dga-head" id="dgaHead"><span class="av"><img src="'+AV+'" alt=""></span>'+
      '<span class="meta"><b><span class="dot" aria-hidden="true"></span>'+G.name+'</b><span>'+G.role+'</span></span>'+
      '<button class="hbtn" type="button" id="dgaMin" aria-label="'+G.minA+'">'+MINUS+'</button>'+
      '<button class="hbtn" type="button" id="dgaClose" aria-label="'+G.closeA+'">'+iconSvg('i-x')+'</button></div>'+
    '<div class="dga-body" id="dgaBody"></div>'+
    '<div class="dga-foot">'+
      '<div class="dga-quick" id="dgaQuick" role="group" aria-label="'+G.quickTitle+'"></div>'+
      '<div class="dga-inputrow">'+
        '<label class="visually-hidden" for="ai-q">'+G.placeholder+'</label>'+
        '<textarea id="ai-q" rows="1" placeholder="'+G.placeholder+'"></textarea>'+
        '<button class="dga-mic" id="dgaMic" type="button" aria-pressed="false" aria-label="'+G.micA+'">'+MIC+'</button>'+
        '<button class="dga-send" id="dgaSend" type="button" aria-label="'+G.send+'">'+iconSvg('i-arrow')+'</button></div>'+
      '<p class="dga-disclaimer">'+iconSvg('i-shield')+'<span>'+G.disclaimer+'</span></p></div>';
  document.body.appendChild(panel);

  const gBody = panel.querySelector('#dgaBody'), gInput = panel.querySelector('#ai-q');
  let gGreeted = false;

  const gQuick = panel.querySelector('#dgaQuick');
  function renderQuick(){       // แถบ quick reply แนวนอน เหนือช่องพิมพ์ (สไตล์ LINE)
    gQuick.innerHTML = G.quick.map(a=>'<button type="button"><span class="qic">'+iconSvg(a.ic)+'</span>'+esc(a.label)+'</button>').join('');
    gQuick.querySelectorAll('button').forEach((b,i)=> b.addEventListener('click', ()=> ask(G.quick[i].q, G.quick[i].label)));
  }
  renderQuick();

  function gAdd(role, html){
    if (role === 'bot'){ const row = document.createElement('div'); row.className = 'ai-row bot';
      row.innerHTML = '<img class="ai-av" src="'+AV+'" alt=""><div class="ai-msg bot">'+html+'</div>';
      gBody.appendChild(row); gBody.scrollTop = gBody.scrollHeight; return row; }
    const d = document.createElement('div'); d.className = 'ai-msg user'; d.innerHTML = html;
    gBody.appendChild(d); gBody.scrollTop = gBody.scrollHeight; return d;
  }
  function ask(q, display){ q = (q||'').trim(); if (!q) return; display = (display||q).trim();
    if (!panel.classList.contains('open')) openGuide();
    gAdd('user', esc(display));
    const typing = gAdd('bot', '<span class="dga-typing"><i></i><i></i><i></i></span>');
    setTimeout(()=>{ typing.remove(); const ap = answerParts(q); const row = gAdd('bot', ap.html); addSpeak(row, ap.text); }, 600);
  }
  /* ---- อ่านคำตอบออกเสียง (Text-to-Speech) ---- */
  function addSpeak(row, text){ if (!('speechSynthesis' in window) || !text) return;
    const bubble = row.querySelector('.ai-msg'); if (!bubble) return;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dga-speak';
    btn.setAttribute('aria-label', G.readA); btn.innerHTML = SPK + '<span>' + G.readA + '</span>';
    btn.addEventListener('click', ()=> speak(text, btn)); bubble.appendChild(btn);
  }
  function speak(text, btn){ const synth = window.speechSynthesis; const wasOn = btn.classList.contains('on');
    synth.cancel(); document.querySelectorAll('.dga-speak.on').forEach(b=>b.classList.remove('on'));
    if (wasOn) return;                                  // กดซ้ำ = หยุด
    const u = new SpeechSynthesisUtterance(text); u.lang = LANG === 'en' ? 'en-US' : 'th-TH';
    u.onend = ()=> btn.classList.remove('on'); u.onerror = ()=> btn.classList.remove('on');
    btn.classList.add('on'); synth.speak(u);
  }
  const askAI = ask;                          // ให้ hero search / แท็ก / ปุ่ม CTA เรียกใช้

  function gSend(){ const q = gInput.value.trim(); if (!q) return; gInput.value=''; grow(); ask(q); }
  function grow(){ gInput.style.height='auto'; gInput.style.height = Math.min(gInput.scrollHeight, 96) + 'px'; }
  panel.querySelector('#dgaSend').addEventListener('click', gSend);
  gInput.addEventListener('input', grow);
  gInput.addEventListener('keydown', e=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); gSend(); } });

  /* ---- พิมพ์ด้วยเสียง (Speech-to-Text) ---- */
  const micBtn = panel.querySelector('#dgaMic');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && micBtn){
    let rec = null, listening = false;
    micBtn.addEventListener('click', ()=>{
      if (listening){ rec && rec.stop(); return; }
      rec = new SR(); rec.lang = LANG === 'en' ? 'en-US' : 'th-TH'; rec.interimResults = true; rec.continuous = false;
      rec.onstart = ()=>{ listening = true; micBtn.classList.add('on'); micBtn.setAttribute('aria-pressed','true'); };
      rec.onresult = (e)=>{ let t = ''; for (let i=0;i<e.results.length;i++) t += e.results[i][0].transcript; gInput.value = t; grow(); };
      rec.onerror = ()=>{};
      rec.onend = ()=>{ listening = false; micBtn.classList.remove('on'); micBtn.setAttribute('aria-pressed','false');
        if (gInput.value.trim()) gSend(); };          // พูดจบ → ส่งอัตโนมัติ (แฮนด์ฟรี)
      rec.start();
    });
  } else if (micBtn){ micBtn.style.display = 'none'; }   // เบราว์เซอร์ไม่รองรับ → ซ่อนไมค์

  let gLastFocus = null;
  function greet(){ if (gGreeted) return; gGreeted = true;     // ทักทาย: ฟองข้อความซ้าย + avatar ใหญ่ขวา
    const g = document.createElement('div'); g.className = 'dga-greet';
    g.innerHTML = '<div class="ai-msg bot"><span class="dga-typing"><i></i><i></i><i></i></span></div>'+
      '<span class="dga-greet-av"><img src="'+AV+'" alt=""><span class="dot" aria-hidden="true"></span></span>';
    gBody.insertBefore(g, gBody.firstChild);
    setTimeout(()=>{ g.querySelector('.ai-msg').innerHTML = esc(G.welcome); gBody.scrollTop = 0; }, 750);
  }
  function openGuide(){ gLastFocus = document.activeElement; panel.classList.add('open');
    aiBtn.setAttribute('aria-expanded','true'); fab.style.display='none'; greet(); setTimeout(()=>gInput.focus(), 60); }
  function closeGuide(){ panel.classList.remove('open'); panel.classList.remove('min'); aiBtn.setAttribute('aria-expanded','false'); fab.style.display='';
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_){}
    document.querySelectorAll('.dga-speak.on').forEach(b=>b.classList.remove('on'));
    if (gLastFocus && gLastFocus.focus) gLastFocus.focus(); else aiBtn.focus(); }
  const dgaMin = panel.querySelector('#dgaMin');
  function toggleMin(){ const willMin = !panel.classList.contains('min'); panel.classList.toggle('min', willMin);
    dgaMin.setAttribute('aria-label', willMin ? G.expandA : G.minA);
    if (!willMin) setTimeout(()=>gInput.focus(), 60); }
  aiBtn.addEventListener('click', openGuide);
  dgaMin.addEventListener('click', e=>{ e.stopPropagation(); toggleMin(); });
  panel.querySelector('#dgaClose').addEventListener('click', e=>{ e.stopPropagation(); closeGuide(); });
  panel.querySelector('#dgaHead').addEventListener('click', ()=>{ if (panel.classList.contains('min')) toggleMin(); });
  document.addEventListener('keydown', e=>{ if (e.key==='Escape' && panel.classList.contains('open')) closeGuide(); });
  panel.addEventListener('keydown', e=>{ if (e.key!=='Tab') return;     // focus trap
    const f = panel.querySelectorAll('button, textarea, a[href], [tabindex]:not([tabindex="-1"])'); if (!f.length) return;
    const first = f[0], last = f[f.length-1];
    if (e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  });

  /* ---- ฟองทักทายข้างปุ่ม (แสดงครั้งแรก จนกว่าผู้ใช้จะปิด) ---- */
  const teaser = fab.querySelector('#dgaTeaser');
  function hideTeaser(){ teaser.classList.remove('show'); }
  let teaserDismissed = false; try { teaserDismissed = localStorage.getItem('dga-teaser-x') === '1'; } catch (_){}
  if (!teaserDismissed) setTimeout(()=>{ if (!panel.classList.contains('open')) teaser.classList.add('show'); }, 1500);
  teaser.addEventListener('click', ()=>{ hideTeaser(); openGuide(); });
  teaser.addEventListener('keydown', e=>{ if (e.key==='Enter' || e.key===' '){ e.preventDefault(); hideTeaser(); openGuide(); } });
  fab.querySelector('#dgaTeaserX').addEventListener('click', e=>{ e.stopPropagation(); hideTeaser();
    try { localStorage.setItem('dga-teaser-x','1'); } catch (_){}
  });

  /* ---- แท็ก "ยอดนิยม": กดแล้วให้ AI ค้นหา/ตอบทันที ---- */
  document.querySelectorAll('.hero-tags a').forEach(a=>a.addEventListener('click', e=>{ e.preventDefault(); askAI(a.textContent.trim()); }));

  /* ---- Hero search: autocomplete สด + ส่งให้ AI ตอบ ---- */
  const heroForm = document.getElementById('site-search'), heroInput = document.getElementById('q');
  if (heroForm && heroInput && DATA.length){
    const box = document.createElement('div'); box.className = 'hero-search-box';
    heroForm.parentNode.insertBefore(box, heroForm); box.appendChild(heroForm);
    const sug = document.createElement('div'); sug.className = 'search-suggest'; sug.hidden = true; box.appendChild(sug);
    let active = -1;
    function render(items){
      active = -1;
      if (!items.length){ sug.hidden = true; return; }
      sug.innerHTML = items.map(it=>
        '<a href="'+it.url+'" data-q="'+esc(it.title[LANG])+'"><span class="ic">'+iconSvg(it.icon)+'</span>'+
        '<span><span class="t">'+esc(it.title[LANG])+'</span><span class="c">'+esc(it.cat?it.cat[LANG]:'')+'</span></span></a>').join('');
      sug.hidden = false;
      sug.querySelectorAll('a').forEach(a=>a.addEventListener('click', e=>{ e.preventDefault();
        sug.hidden = true; heroInput.value=''; askAI(a.getAttribute('data-q')); }));
    }
    heroInput.addEventListener('input', ()=>{ const q = heroInput.value.trim(); render(q ? searchItems(q,6) : []); });
    heroInput.addEventListener('focus', ()=>{ const q = heroInput.value.trim(); if (q) render(searchItems(q,6)); });
    document.addEventListener('click', e=>{ if (!box.contains(e.target)) sug.hidden = true; });
    heroInput.addEventListener('keydown', e=>{ const links = [...sug.querySelectorAll('a')]; if (!links.length || sug.hidden) return;
      if (e.key==='ArrowDown'){ e.preventDefault(); active = Math.min(active+1, links.length-1); }
      else if (e.key==='ArrowUp'){ e.preventDefault(); active = Math.max(active-1, 0); }
      else return;
      links.forEach((l,i)=>l.classList.toggle('active', i===active)); links[active]?.scrollIntoView({block:'nearest'});
    });
    heroForm.addEventListener('submit', e=>{ e.preventDefault(); const links = [...sug.querySelectorAll('a')];
      if (active>=0 && links[active]){ links[active].click(); }
      else { const q = heroInput.value.trim(); sug.hidden = true; heroInput.value=''; askAI(q); } });
  }
})();
