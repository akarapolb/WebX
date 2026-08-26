// Single swap point: every component imports `cms` from here. As of Phase 1
// this is the browser client hitting WebX's own governed /api/cms/* routes
// (see lib/cms/governance.ts) — never lib/cms/strapi.ts directly, which is
// server-only now and has exactly one caller, governance.ts.
import { browserAdapter } from "./browser-client";
import type { CmsAdapter } from "./types";

export const cms: CmsAdapter = browserAdapter;
export { CmsError } from "./types";
export type { CmsAdapter, EntryQuery, EntryList, ContentTypeInfo, MediaAsset, CurrentUser, AdminUser } from "./types";
