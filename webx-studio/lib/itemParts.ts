// The block types whose renderer (public-site/templates/orst/Blocks.tsx) tags each part of an item as a component of its
// own: itemIcon.N, itemTitle.N, itemBody.N, itemTag.N, itemMeta.N. The sidebar editor shows a style control beside each
// part's field, and the agent may style these parts by name.
export const PART_BLOCKS = new Set(["orst.card-grid", "orst.feature-list", "orst.link-list"]);
/** Which item field is which part. */
export const PART_OF: Record<string, string> = { icon: "itemIcon", title: "itemTitle", body: "itemBody", desc: "itemBody", tag: "itemTag", meta: "itemMeta" };
export const ITEM_PART_NAMES = ["itemIcon", "itemTitle", "itemBody", "itemTag", "itemMeta"] as const;
