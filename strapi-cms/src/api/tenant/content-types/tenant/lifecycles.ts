/**
 * Keeps the HTTP-level tenant-resolution cache (src/middlewares/tenant.ts)
 * in sync with the actual table. Without this, a tenant created/renamed/
 * deactivated outside that middleware's own 30s refresh window stays
 * invisible (or stale) to every ?tenant=/X-Tenant/Host lookup until the
 * window expires — see WebX-handoff-2026-09-11.md #1.
 */
import { invalidateTenantCache } from '../../../../middlewares/tenant';

export default {
  async afterCreate() {
    invalidateTenantCache();
  },
  async afterUpdate() {
    invalidateTenantCache();
  },
  async afterDelete() {
    invalidateTenantCache();
  },
};
