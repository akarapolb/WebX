/**
 * เส้นทาง WebX Console (หลังบ้าน) — ทุกเส้นทางต้องล็อกอิน admin (policy global::admin-only)
 * mount ที่ /api/console/*
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/console/context',
      handler: 'console.context',
      config: { auth: false, policies: ['global::admin-only'] },
    },
    {
      method: 'PUT',
      path: '/console/branding',
      handler: 'console.updateBranding',
      config: { auth: false, policies: ['global::admin-only'] },
    },
    {
      // SSO bridge — public (token อยู่ใน fragment, ไม่ผ่าน server); เขียน storage ฝั่ง client
      method: 'GET',
      path: '/sso/bridge',
      handler: 'console.ssoBridge',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/sso/bridge.js',
      handler: 'console.ssoBridgeJs',
      config: { auth: false },
    },
  ],
};
