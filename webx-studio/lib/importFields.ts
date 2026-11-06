// The fields of a content type that a file import can fill, for either engine, from the same schema the
// agent reads (getContentTypeSchema: tenant scoping, role field policies and read-only fields already
// applied). Only plain values qualify: no relations, media files, components, page blocks or JSON.
import "server-only";
import { getContentTypeSchema } from "@/lib/cms/governance";
import type { ImportField, ImportFieldType } from "./importData";

const TYPE_OF: Record<string, ImportFieldType> = {
  string: "string", text: "text", html: "html", richtext: "richtext", email: "email",
  integer: "integer", biginteger: "integer", float: "float", decimal: "float",
  boolean: "boolean", date: "date", datetime: "datetime", enumeration: "enumeration",
};
// WordPress's ACF fields all arrive typed as plain strings; these are the ones that really hold a number,
// a yes/no or a date (acf-fields.php, public-forms-acf.php).
const WP_INTEGER = new Set(["order", "openings", "total_votes"]);
const WP_BOOLEAN = new Set(["active", "anonymous", "handled"]);
const WP_DATE = new Set(["event_date", "date", "deadline"]);
const WP_URL = new Set(["link_url", "file_url"]);

/** null when the type is unknown or not available to this user. */
export async function importFieldsFor(uid: string): Promise<ImportField[] | null> {
  const schema = await getContentTypeSchema(uid);
  if (!schema) return null;
  const wp = uid.startsWith("wp:");
  const out: ImportField[] = [];
  for (const f of schema.fields) {
    if (!f.writable) continue;
    let type = TYPE_OF[f.type];
    if (!type) continue;
    if (wp && type === "string") type = WP_INTEGER.has(f.name) ? "integer" : WP_BOOLEAN.has(f.name) ? "boolean" : WP_DATE.has(f.name) ? "date" : WP_URL.has(f.name) ? "url" : "string";
    out.push({
      key: f.name, type,
      ...(f.required ? { required: true } : {}),
      ...(type === "enumeration" && Array.isArray(f.enum) ? { options: f.enum.map(String) } : {}),
      ...(typeof f.maxLength === "number" ? { maxLength: f.maxLength } : {}),
    });
  }
  return out;
}
