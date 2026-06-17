/**
 * เส้นทาง resolve tenant (สาธารณะ) — ใช้ host/key/header ระบุ tenant
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/tenants/resolve',
      handler: 'tenant.resolve',
      config: { auth: false },
    },
  ],
};
