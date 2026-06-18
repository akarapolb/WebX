/**
 * global::admin-only — อนุญาตเฉพาะผู้ที่ล็อกอินเป็น Strapi Admin เท่านั้น
 * Strapi 5.48 ใช้ session token แบบ opaque (ไม่ใช่ JWT) → ตรวจด้วยการเรียก
 * /admin/users/me ของ Strapi เองพร้อม Bearer เดิม ถ้าคืน 200 = เป็น admin จริง
 * (ทนทุกเวอร์ชัน ไม่ผูกกับวิธี sign token) — ใช้กับ analytics ที่นับข้อมูลฟอร์ม (PDPA)
 */
export default async (policyCtx: any, _config: any, { strapi }: { strapi: any }) => {
  const authz = policyCtx.request?.header?.authorization || '';
  if (!authz.startsWith('Bearer ')) return false;
  try {
    const port = strapi.config.get('server.port', 1337);
    const res = await fetch(`http://127.0.0.1:${port}/admin/users/me`, {
      headers: { Authorization: authz, Accept: 'application/json' },
    });
    if (!res.ok) return false;
    const body: any = await res.json();
    const u = body?.data;
    if (!u || u.isActive === false || u.blocked === true) return false;
    policyCtx.state.adminUser = u;
    return true;
  } catch {
    return false;
  }
};
