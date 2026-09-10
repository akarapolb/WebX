/**
 * เส้นทาง internal (ป้องกันด้วย shared secret ไม่ใช่ Strapi auth) — สำหรับ
 * webx-studio governance layer และ agent worker เท่านั้น mount ที่ /api/internal/*
 */
export default {
  routes: [
    { method: 'GET', path: '/internal/tenant-of', handler: 'internal.tenantOf', config: { auth: false } },
    { method: 'GET', path: '/internal/custom-role-permissions', handler: 'internal.customRolePermissions', config: { auth: false } },
    { method: 'POST', path: '/internal/agent-jobs/claim', handler: 'agent-jobs.claim', config: { auth: false } },
    { method: 'POST', path: '/internal/agent-jobs/heartbeat', handler: 'agent-jobs.heartbeat', config: { auth: false } },
    { method: 'POST', path: '/internal/agent-jobs/checkpoint', handler: 'agent-jobs.checkpoint', config: { auth: false } },
    { method: 'POST', path: '/internal/agent-jobs/finish', handler: 'agent-jobs.finish', config: { auth: false } },
    { method: 'POST', path: '/internal/agent-jobs/control', handler: 'agent-jobs.control', config: { auth: false } },
  ],
};
