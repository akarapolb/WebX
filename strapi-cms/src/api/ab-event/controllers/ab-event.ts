/**
 * ab-event controller — public create is rate-limited + field-sanitized
 */
import { factories } from "@strapi/strapi";

const hits = new Map<string, { n: number; t: number }>();
const LIMIT = 120, WINDOW = 60_000; // 120 events / minute / IP

export default factories.createCoreController("api::ab-event.ab-event", ({ strapi }) => ({
  async create(ctx: any) {
    const ip = String(ctx.request.ip || ctx.request.header?.["x-forwarded-for"] || "?");
    const now = Date.now();
    const rec = hits.get(ip);
    if (rec && now - rec.t < WINDOW) {
      if (rec.n >= LIMIT) { ctx.status = 429; ctx.body = { error: "Too many requests" }; return; }
      rec.n++;
    } else { hits.set(ip, { n: 1, t: now }); }

    const d = (ctx.request.body && ctx.request.body.data) || {};
    const data = {
      documentRef: String(d.documentRef || "").slice(0, 200),
      variant: d.variant === "B" ? "B" : "A",
      kind: d.kind === "conversion" ? "conversion" : "view",
    };
    if (!data.documentRef) { ctx.status = 400; ctx.body = { error: "documentRef required" }; return; }
    const created = await strapi.documents("api::ab-event.ab-event").create({ data });
    ctx.body = { data: created };
  },
}));
