/**
 * เส้นทางรายชื่อ tenant ที่ active (สาธารณะ) — key + engine เท่านั้น
 * ใช้โดย public-site's listTenantKeys() (Phase 6)
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/tenants/keys',
      handler: 'tenant.keys',
      config: { auth: false },
    },
  ],
};
