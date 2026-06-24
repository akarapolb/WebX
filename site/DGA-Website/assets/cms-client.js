/* =====================================================================
   cms-client.js — เชื่อมหน้าบ้าน ↔ Strapi CMS (พร้อม fallback)
   เปิด window.DGACMS.hydrate(type, globalName) :
     • ดึงเนื้อหาสดจาก Strapi ตามภาษาปัจจุบัน แล้ว map เป็นรูปแบบเดิม
       ที่ news.js / careers.js ใช้ (window.DGA_NEWS / window.DGA_JOBS)
     • ถ้า CMS ปิด/ล่ม/ว่าง → คงข้อมูลสำรองเดิม (ไม่ทำให้เดโมพัง)
   ===================================================================== */
(function () {
  'use strict';
  var LANG = document.documentElement.lang === 'en' ? 'en' : 'th';
  var BASE = (window.DGA_CMS_URL || '').replace(/\/+$/, '');

  var TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var EN_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtDate(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    if (p.length < 3) return iso;
    var y = +p[0], m = +p[1] - 1, d = +p[2];
    if (LANG === 'en') return d + ' ' + EN_MONTH[m] + ' ' + y;
    return d + ' ' + TH_MONTH[m] + ' ' + String((y + 543) % 100); // พ.ศ. 2 หลัก
  }
  function kv(v) { var o = {}; o[LANG] = v; return o; }
  function f(item) { return (item && item.attributes) ? item.attributes : item; } // รองรับ v5(flat) + v4

  function mediaUrl(cover) {
    if (!cover) return '';
    var u = cover.url || (cover.data && cover.data.attributes && cover.data.attributes.url) || '';
    if (!u) return '';
    return /^https?:/.test(u) ? u : BASE + u;
  }

  function mapArticle(item) {
    var a = f(item);
    return {
      id: a.slug || item.documentId || item.id,
      ph: a.swatch || 'n1',
      icon: a.icon || 'i-grid',
      views: a.views || 0,
      img: mediaUrl(a.coverImage || a.cover),
      date: kv(fmtDate(a.publishDate || a.publishedDate)),
      cat: kv(a.categoryLabel || a.category || ''),
      title: kv(a.title || ''),
      excerpt: kv(a.excerpt || '')
    };
  }

  function mapJob(item) {
    var j = f(item);
    return {
      id: j.jobId || j.slug || item.documentId || item.id,
      deptKey: j.deptKey || '',
      typeKey: j.typeKey || 'fulltime',
      openings: j.openings || 1,
      title: kv(j.title || ''),
      dept: kv(j.dept || j.department || ''),
      type: kv(j.type || j.employmentType || ''),
      location: kv(j.location || ''),
      salary: kv(j.salary || ''),
      deadline: kv(j.deadline || ''),
      summary: kv(j.summary || ''),
      responsibilities: kv(j.responsibilities || []),
      qualifications: kv(j.qualifications || []),
      benefits: kv(j.benefits || [])
    };
  }

  async function fetchList(path, mapper, sort) {
    if (!BASE) return null; // CMS ปิด → fallback ทันที (ไม่มี request)
    try {
      var qs = 'locale=' + LANG + '&pagination[pageSize]=100&populate=*' + (sort ? '&sort=' + sort : '');
      var res = await fetch(BASE + '/api/' + path + '?' + qs, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      var json = await res.json();
      var data = (json && json.data) || [];
      if (!data.length) return null;
      return data.map(mapper);
    } catch (e) {
      return null; // เครือข่าย/CORS error → fallback
    }
  }

  window.DGACMS = {
    lang: LANG,
    enabled: !!BASE,
    async hydrate(type, globalName) {
      var items = null;
      if (type === 'article') items = await fetchList('articles', mapArticle, 'publishDate:desc');
      else if (type === 'job') items = await fetchList('jobs', mapJob, 'createdAt:desc');
      else if (type === 'service') items = await fetchList('services', null, 'order:asc');
      if (items && items.length) { window[globalName] = items; }
      return window[globalName];
    }
  };
})();
