// The CmsAdapter contract — every UI component talks to this, never to a
// specific engine's REST conventions directly. See docs/TECHNICAL.md and the
// Engine Adapter Blueprint for the architecture this sets up (Phase 0: this
// interface has exactly one implementation, lib/cms/strapi.ts).

export type FilterOp = "eq" | "ne" | "contains";

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
  attributes: Record<string, any>;
};

export type MediaAsset = {
  id: number;
  url: string;
  mime?: string;
  name?: string;
};

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
    upload(file: File): Promise<MediaAsset>;
  };
  auth: {
    me(): Promise<CurrentUser | null>;
    listRoles(): Promise<{ id: any; name: string }[]>;
    /** Throws CmsError on a non-2xx response. */
    listUsers(): Promise<AdminUser[]>;
  };
}
