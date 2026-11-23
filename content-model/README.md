# content-model

The source of truth for WebX's content types (decision D5 in
`../docs/target-architecture.md`). The format is Strapi's own `schema.json`, so
nothing is translated: Strapi's copies are generated from here by copying, the
Rust engine's snapshot exporter reads this folder, and WordPress keeps its fixed
post-type registry.

```
api/<api>/<type>/schema.json          -> strapi-cms/src/api/<api>/content-types/<type>/schema.json
components/<category>/<name>.json     -> strapi-cms/src/components/<category>/<name>.json
```

## Change a content type

1. Edit the file here.
2. `node content-model/sync.mjs write` copies it into `strapi-cms`.
3. Commit both. CI (`content-model` job in `.github/workflows/ci.yml`) runs
   `node content-model/sync.mjs check` and fails when the two differ, when a
   Strapi schema has no source here, or when a file is not valid JSON.

`node content-model/sync.mjs adopt` goes the other way (Strapi to here); it was
used once to start the folder, and is the way to add a type that was first made
in Strapi's admin. Line endings are not compared.

## Not yet

The model describes fields, relations, components and i18n. Rules the engines
share but the format cannot say yet (unique slug per tenant and locale) are not
in it; the Rust engine's write API enforces only `required` today.
