// ORST/RoyalSociety pages store layout in their OWN dialect (a `type`
// discriminator + a hand-authored string `id`) because that is what
// public-site's templates/orst/Blocks.tsx actually renders, and what that
// route's existing withItems()/withFields() merges key on. The Visual
// Builder's internals key on Strapi's `__component` discriminator instead.
// Translate at the ONE seam where the Builder loads and saves a page —
// nowhere else in either app needs to know two dialects exist.
//
// The mapping is purely mechanical (`<template>.<type>`), so adding a 15th
// ORST block type never needs a change here, and because every Strapi block
// type is namespaced "block.*", an "orst.*"/"royalsociety.*" prefix can
// never collide with it.
export type Dialect = "gov-portal" | "orst" | "royalsociety";

export const isTemplateDialect = (d: Dialect): boolean => d !== "gov-portal";

// Block type NAMES (the bare `type` string already stored on disk — see
// toBuilder below) that every WP-dialect tenant's own Blocks.tsx renders
// identically enough for ONE editor-side definition to serve all of them,
// instead of a "<tenant>.<type>" copy per tenant (VisualBuilder.tsx's
// GENERIC_TYPES). Verified field-for-field identical (table/faq/notice) or
// safely unioned (cta-band — RoyalSociety's own extra `eyebrow` field,
// harmless as an always-present optional field for ORST too) by reading
// both templates/*/Blocks.tsx against both VisualBuilder catalogs during
// the ORST/RoyalSociety production-launch audit. This is also the fix for a
// real bug that audit found: a WordPress session with no single home tenant
// (the shared wpadmin/scheduler account) can't resolve which tenant's
// prefix to guess, and defaulted to "orst" — silently misresolving every
// RoyalSociety-only block as unrecognized. A block whose fields genuinely
// diverge per tenant (card-grid, contact-info, contact-form, logo-marquee,
// page-hero, home-hero — different field names or shapes, not just
// cosmetic) stays tenant-prefixed; forcing those into one shape would drop
// a field a tenant needs or risk a stored-field-name mismatch.
export const GENERIC_WP_TYPES = new Set(["table", "faq", "notice", "cta-band"]);

// `template` defaults to "gov-portal" everywhere it's read in VisualBuilder,
// so both functions below are the identity for every existing Strapi tenant
// even if called unconditionally — that's the safety property this whole
// change leans on: nothing about the gov-portal path can regress.
export function toBuilder(blocks: any[], template: Dialect): any[] {
  if (!isTemplateDialect(template) || !Array.isArray(blocks)) return blocks || [];
  return blocks.map(({ type, ...rest }) => ({
    __component: GENERIC_WP_TYPES.has(type) ? type : template + "." + type,
    ...rest,
  }));
}

export function toWire(blocks: any[], template: Dialect): any[] {
  if (!isTemplateDialect(template) || !Array.isArray(blocks)) return blocks || [];
  const prefix = template + ".";
  return blocks.map(({ __component, ...rest }) => {
    const c = String(__component || "");
    // `type` first in the object so the stored JSON stays diffable against
    // the original templates/orst/content/*.json shape this was migrated
    // from (see wordpress/seed-orst-layout.mjs).
    return { type: c.startsWith(prefix) ? c.slice(prefix.length) : c, ...rest };
  });
}
