// The CmsAdapter contract — every UI component talks to this, never to a
// specific engine's REST conventions directly. See docs/TECHNICAL.md and the
// Engine Adapter Blueprint for the architecture this sets up (Phase 0: this
// interface has exactly one implementation, lib/cms/strapi.ts).

// gte/lte added for the agent's monthly run-count query (governance.ts's
// enforceAgentRunLimit filters audit-log rows by `at >= <month start>`) —
// lib/cms/strapi.ts's buildQuery already interpolates any op string as
// Strapi's own `$<op>` filter operator generically, so this is a pure type
// widening, no query-building change needed.
export type FilterOp = "eq" | "ne" | "contains" | "gte" | "lte";

export type EntryQuery = {
  /** field supports dotted relation paths, e.g. "tenant.key" */
  filter?: { field: string; op: FilterOp; value: any }[];
  sort?: string;
  page?: number;
  pageSize?: number;
  status?: "draft" | "published" | "";
  /** full-text search */
  q?: string;
};

export type EntryList<T = any> = {
  data: T[];
  total: number;
  pageCount: number;
};

export type ContentTypeInfo = {
  uid: string;
  name: string;
  api: string;
  /** REST plural path segment (e.g. "articles") — Strapi's own info.pluralName,
   * needed anywhere a caller builds a public REST URL from a uid (public-site
   * has no admin session to re-derive this any other way). */
  pluralName: string;
  attributes: Record<string, any>;
  /** Strapi's own pluginOptions.i18n.localized — true only for content types
   * with a real separate per-locale copy. false (WordPress: always false, no
   * such mechanism modeled here) means translate_fields must refuse: writing
   * a "translation" onto a non-localized entry would silently overwrite its
   * only copy instead of producing a second-language version. */
  localized: boolean;
};

export type MediaAsset = {
  id: number;
  documentId?: string;
  url: string;
  mime?: string;
  name?: string;
  /** Thumbnail URL when the backend generated one (Strapi's responsive
   * formats) — falls back to `url` itself when absent (e.g. WordPress,
   * or a non-image file), same as MediaLibrary.tsx's own display logic. */
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  caption?: string;
  alt?: string;
  tags?: string;
};

export type MediaAssetList = { data: MediaAsset[]; total: number; page: number; pageSize: number };

export type CurrentUser = {
  id: any;
  email?: string;
  roles: string[];
  /** Matches Strapi's own super-admin check (role code first, name as fallback). */
  isSuperAdmin: boolean;
};

export type AdminUser = {
  id: any;
  firstname?: string;
  lastname?: string;
  email: string;
  isActive?: boolean;
  roles: string[];
};

export type NewUserInput = {
  email: string;
  firstname: string;
  lastname: string;
  /** Opaque per engine — a Strapi role's numeric id, or a WordPress role
   * slug (e.g. "editor") — exactly what that adapter's own listRoles()
   * already returns as `{id, name}`. */
  roleId: string | number;
  /** Omit to generate one (the admin-creates-a-user flow — the temp
   * password is shown once, never chosen by the admin). Pass one when the
   * account holder is choosing their own password in the same request (the
   * self-serve signup flow) — there's nothing to "show once" if they just
   * typed it themselves. */
  password?: string;
};

/** removed: the caller's workspace membership was always revoked.
 * accountDeleted: whether the underlying Strapi/WordPress account was also
 * deleted — only true when that email is no longer a member of ANY
 * workspace, so removing someone from one tenant never breaks their access
 * to another they're also a member of. */
export type RemoveUserResult = { removed: boolean; accountDeleted: boolean };

/** Thrown by adapter calls on a non-2xx response; `status` lets callers
 * branch on it (e.g. 403 -> "no permission" vs. a generic error message). */
export class CmsError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "CmsError";
    this.status = status;
  }
}

/** Browser-facing auth is tenant-aware — the browser always acts on an
 * explicit WORKSPACE (whichever the UI's tenant switcher currently shows),
 * never an implicit "this session's own engine" the way the server-side
 * per-engine adapters (strapi.ts/wordpress.ts) do internally, or an
 * implicit "the caller's own membership" the way governance.ts's
 * resolveEffectiveTenant does for content. Only `auth` diverges from
 * CmsAdapter; every other member is identical. */
export interface BrowserCmsAdapter extends Omit<CmsAdapter, "auth"> {
  auth: {
    me(): Promise<CurrentUser | null>;
    /** Omit tenantKey for the pre-existing unscoped behavior (Field Access's
     * role picker, which is always about Strapi's own roles regardless of
     * workspace) — pass it to get the roles of a specific workspace's own
     * engine instead (the new-user modal's role dropdown). */
    listRoles(tenantKey?: string): Promise<{ id: any; name: string }[]>;
    listUsers(tenantKey: string): Promise<AdminUser[]>;
    create(tenantKey: string, input: NewUserInput): Promise<{ user: AdminUser; tempPassword: string }>;
    remove(tenantKey: string, input: { id: any; email: string }): Promise<RemoveUserResult>;
  };
}

export interface CmsAdapter {
  schema: {
    /** Throws CmsError on a non-2xx response. */
    listContentTypes(): Promise<ContentTypeInfo[]>;
  };
  entries: {
    /** Throws CmsError on a non-2xx response. */
    list<T = any>(uid: string, query?: EntryQuery): Promise<EntryList<T>>;
    /** Throws CmsError on a non-2xx response. */
    get<T = any>(uid: string, id: string, opts?: { locale?: string }): Promise<T | null>;
    create<T = any>(uid: string, data: Record<string, any>): Promise<T>;
    update<T = any>(uid: string, id: string, data: Record<string, any>, opts?: { locale?: string }): Promise<T>;
    remove(uid: string, id: string, opts?: { locale?: string }): Promise<void>;
  };
  publish: {
    publish(uid: string, id: string, opts?: { locale?: string }): Promise<void>;
    unpublish(uid: string, id: string, opts?: { locale?: string }): Promise<void>;
  };
  media: {
    /** `tenantKey` is a no-op for the Strapi adapter (that engine resolves
     * the caller's tenant itself, server-side, from the admin bearer token
     * — see strapi-cms/src/api/media-meta) but is REQUIRED for WordPress,
     * which has no session-to-tenant resolution of its own; governance.ts
     * resolves it once (resolveEffectiveTenant) and passes it to whichever
     * adapter is active uniformly. */
    upload(file: File, tenantKey?: string): Promise<MediaAsset>;
    /** Real centralized media library (TOR gap — search/tag/reuse/crop/
     * caption): list this tenant's own previously-uploaded assets, newest
     * first, optionally filtered by a search term against name/caption/
     * alt-text/tags. */
    list(opts?: { search?: string; page?: number; pageSize?: number; tenantKey?: string }): Promise<MediaAssetList>;
    /** Partial update — an omitted field is left untouched, an explicit
     * `null` clears it (matches strapi-cms/src/api/media-meta's own PATCH
     * semantics). */
    update(id: string, patch: { caption?: string | null; alt?: string | null; tags?: string | null }, tenantKey?: string): Promise<MediaAsset>;
    remove(id: string, tenantKey?: string): Promise<void>;
  };
  auth: {
    me(): Promise<CurrentUser | null>;
    listRoles(): Promise<{ id: any; name: string }[]>;
    /** Throws CmsError on a non-2xx response. */
    listUsers(): Promise<AdminUser[]>;
    /** The account with exactly this email, or null — how a background job
     * re-checks that its owner still exists and is active. Throws CmsError on
     * a non-2xx response. */
    findUserByEmail(email: string): Promise<AdminUser | null>;
    /** Creates a real, immediately-usable account with a generated
     * temp password — never emailed, returned once to the caller.
     * Throws CmsError on a non-2xx response from either backend call. */
    create(input: NewUserInput): Promise<{ user: AdminUser; tempPassword: string }>;
    /** Deletes the account outright — no soft-delete/trash on either engine.
     * Throws CmsError on a non-2xx response. */
    remove(id: string | number): Promise<void>;
  };
}
