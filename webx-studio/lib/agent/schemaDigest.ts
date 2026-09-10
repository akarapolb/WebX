// A content type's fields as the agent needs them to write a valid draft on
// the first try: type, required, allowed values and limits, and whether the
// caller may set the field at all. Built from the attributes the CMS schema
// endpoint already returns, so the agent never has to read existing entries
// to guess field shapes (the reconnaissance that sank the 18-type run).

export type FieldInfo = {
  name: string;
  type: string;
  required?: true;
  enum?: unknown[];
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  relation?: string;
  target?: string;
  component?: string;
  components?: string[];
  repeatable?: true;
  multiple?: true;
  writable: boolean;
  note?: string;
};

export type ContentTypeSchema = { uid: string; name: string; fields: FieldInfo[] };

const SYSTEM_FIELDS = new Set(["id", "documentId", "createdAt", "updatedAt", "publishedAt", "createdBy", "updatedBy", "locale", "localizations"]);

export function digestContentType(
  ct: { uid: string; name: string; attributes: Record<string, any> },
  o: { hidden?: string[]; readonly?: string[] } = {},
): ContentTypeSchema {
  const hidden = new Set(o.hidden || []);
  const readonly = new Set(o.readonly || []);
  const fields: FieldInfo[] = [];

  for (const [name, a] of Object.entries(ct.attributes || {})) {
    if (SYSTEM_FIELDS.has(name) || hidden.has(name) || !a || typeof a !== "object" || a.private) continue;
    const f: FieldInfo = { name, type: String(a.type || "unknown"), writable: true };
    if (a.required) f.required = true;
    if (Array.isArray(a.enum)) f.enum = a.enum;
    if (a.default !== undefined) f.default = a.default;
    if (typeof a.minLength === "number") f.minLength = a.minLength;
    if (typeof a.maxLength === "number") f.maxLength = a.maxLength;
    if (typeof a.min === "number") f.min = a.min;
    if (typeof a.max === "number") f.max = a.max;

    switch (a.type) {
      case "relation":
        f.relation = a.relation;
        f.target = a.target;
        if (name === "tenant" || a.target === "api::tenant.tenant") {
          f.writable = false;
          f.note = "Set automatically for this workspace.";
        } else {
          f.note = `Relation to ${a.target}: pass documentId(s) of existing entries.`;
        }
        break;
      case "media":
        if (a.multiple) f.multiple = true;
        f.writable = false;
        f.note = "Media file: the agent cannot upload files, leave it empty.";
        break;
      case "component":
        f.component = a.component;
        if (a.repeatable) f.repeatable = true;
        f.note = a.repeatable ? `A list of ${a.component} objects.` : `One ${a.component} object.`;
        break;
      case "dynamiczone":
        f.components = a.components;
        break;
      case "uid":
        f.note = a.targetField ? `URL slug; generated from ${a.targetField} when left empty.` : "URL slug: lowercase letters, digits and hyphens.";
        break;
      case "blocks":
        f.note = 'Rich text blocks, e.g. [{"type":"paragraph","children":[{"type":"text","text":"…"}]}].';
        break;
      case "richtext":
        f.note = "Markdown text.";
        break;
      case "html":
        f.note = "HTML text.";
        break;
      case "json":
        f.note = "Any JSON value.";
        break;
      case "datetime":
        f.note = "ISO 8601 date-time, e.g. 2026-09-11T09:00:00.000Z.";
        break;
      case "date":
        f.note = "Date as YYYY-MM-DD.";
        break;
    }
    if (name === "blocks" && (a.type === "dynamiczone" || a.type === "json")) {
      f.note = "Page sections: create the entry first, then add sections with insert_blocks.";
    }
    if (readonly.has(name)) {
      f.writable = false;
      f.note = "Read-only for your role.";
    }
    fields.push(f);
  }

  // Required fields first; otherwise the schema's own order.
  fields.sort((x, y) => Number(Boolean(y.required)) - Number(Boolean(x.required)));
  return { uid: ct.uid, name: ct.name, fields };
}

/** Strapi-shaped attributes for a WordPress post type, from its ACF field names. */
export function wordpressAttributes(acfFields: string[], jsonFields: string[]): Record<string, any> {
  const attrs: Record<string, any> = {
    title: { type: "string", required: true },
    excerpt: { type: "text" },
    content: { type: "html" },
  };
  for (const f of acfFields) attrs[f] = jsonFields.includes(f) ? { type: "json" } : { type: "string" };
  return attrs;
}
