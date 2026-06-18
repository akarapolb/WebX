/* ============================================================
   share.js — ปุ่มแชร์โซเชียลรายเนื้อหา (TOR ภาคผนวก ก ข้อ 4.12)
   Facebook / X / LINE / คัดลอกลิงก์ — แชร์ URL ของหน้าปัจจุบัน
   ใช้: วาง <div data-share></div> ในหน้า แล้วโหลด share.js
   ============================================================ */
(function () {
  "use strict";
  var host = document.querySelector("[data-share]");
  if (!host) return;
  var url = encodeURIComponent(location.href.split("#")[0]);
  var title = encodeURIComponent(document.title || "");
  var links = [
    { k: "facebook", label: "Facebook", color: "#1877F2", href: "https://www.facebook.com/sharer/sharer.php?u=" + url,
      svg: '<path d="M14 9h2V6h-2c-1.7 0-3 1.3-3 3v2H9v3h2v6h3v-6h2.2l.8-3H14V9c0-.6.4-1 1-1z"/>' },
    { k: "x", label: "X", color: "#000", href: "https://twitter.com/intent/tweet?url=" + url + "&text=" + title,
      svg: '<path d="M17 4h2.5l-5.5 6.3L20 20h-5l-3.9-5.1L6.6 20H4l5.9-6.7L4 4h5.1l3.5 4.7L17 4zm-1 14h1.4L8.1 5.4H6.6L16 18z"/>' },
    { k: "line", label: "LINE", color: "#06C755", href: "https://social-plugins.line.me/lineit/share?url=" + url,
      svg: '<path d="M12 4C7 4 3 7.3 3 11.4c0 3.7 3.2 6.8 7.5 7.4.3.1.7.2.8.5.1.3.1.6 0 .9l-.1.8c0 .2-.2 1 .8.5s5.3-3.1 7.2-5.3c1.3-1.4 1.9-2.9 1.9-4.6C21 7.3 17 4 12 4z"/>' },
    { k: "copy", label: "คัดลอกลิงก์", color: "#5B5F66",
      svg: '<path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>' },
  ];
  function ico(d, fill) { return '<svg viewBox="0 0 24 24" width="18" height="18" ' + (fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"') + ">" + d + "</svg>"; }
  host.innerHTML = '<span style="color:var(--c-text-muted);font-size:var(--fs-small);margin-right:4px">แชร์:</span>' +
    links.map(function (l) {
      var filled = l.k !== "copy";
      return '<a class="share-btn" data-k="' + l.k + '" href="' + (l.href || "#") + '"' + (l.href ? ' target="_blank" rel="noopener"' : "") +
        ' aria-label="' + l.label + '" title="' + l.label + '" style="--sc:' + l.color + '">' + ico(l.svg, filled) + "</a>";
    }).join("");
  var copyBtn = host.querySelector('[data-k="copy"]');
  if (copyBtn) copyBtn.addEventListener("click", function (e) {
    e.preventDefault();
    (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(function () {
      var o = copyBtn.getAttribute("title"); copyBtn.setAttribute("title", "คัดลอกแล้ว ✓"); copyBtn.style.color = "var(--c-success)";
      setTimeout(function () { copyBtn.setAttribute("title", o); copyBtn.style.color = ""; }, 1500);
    }).catch(function () {});
  });
})();
