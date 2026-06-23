/* pwa.js — make the citizen site installable + offline, per tenant.
   Builds a per-tenant web manifest from the resolved tenant brand (name, theme
   color, logo) and registers the service worker. Disabled if the tenant sets
   features.pwa === false. (Push notifications need VAPID + a push backend —
   tracked as a follow-up; this ships install + offline.) */
(function () {
  "use strict";
  if (window.__webxPWA) return; window.__webxPWA = true;

  function buildManifest() {
    var cfg = window.DGA_TENANT_CFG || {};
    var org = cfg.brand && cfg.brand.orgName;
    var name = (org && (org.th || org.en)) || cfg.name || (document.title || "บริการภาครัฐ");
    var color = (cfg.brand && cfg.brand.primaryColor) || "#EE5020";
    var icon = (cfg.brand && cfg.brand.logoUrl) || "/assets/image/logo-dga.webp";
    var m = {
      name: name, short_name: String(name).slice(0, 14), start_url: "/", scope: "/",
      display: "standalone", background_color: "#0b0f17", theme_color: color,
      icons: [{ src: icon, sizes: "192x192", type: "image/png", purpose: "any" },
              { src: icon, sizes: "512x512", type: "image/png", purpose: "maskable" }],
    };
    try {
      var prev = document.querySelector("link[rel=manifest][data-wx]"); if (prev) { URL.revokeObjectURL(prev.href); prev.remove(); }
      var blob = new Blob([JSON.stringify(m)], { type: "application/manifest+json" });
      var link = document.createElement("link"); link.rel = "manifest"; link.href = URL.createObjectURL(blob); link.setAttribute("data-wx", "1");
      document.head.appendChild(link);
      var tc = document.querySelector("meta[name=theme-color]");
      if (!tc) { tc = document.createElement("meta"); tc.name = "theme-color"; document.head.appendChild(tc); }
      tc.content = color;
    } catch (e) {}
  }

  buildManifest();
  setTimeout(buildManifest, 1600); // refine once tenant branding resolves

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(function () { console.log("[webx] PWA: service worker registered — site is installable & offline-capable"); })
      .catch(function (e) { console.warn("[webx] PWA: SW registration failed", e); });
  }

  // per-tenant opt-out
  setTimeout(function () {
    var f = window.DGA_TENANT_CFG && window.DGA_TENANT_CFG.features;
    if (f && f.pwa === false && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); });
      var lk = document.querySelector("link[rel=manifest][data-wx]"); if (lk) lk.remove();
    }
  }, 1800);
})();
