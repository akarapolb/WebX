// CSV / JSON export of datasets (lib/site/openData.ts, DatasetDownloadBlock's toCsv).
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "@/components/blocks/DatasetDownloadBlock";
import { defineSite } from "@/lib/site/config";
import { datasetMeta, datasetJson } from "@/lib/site/openData";
import { egdi } from "./fixtures";

const site = defineSite({ tenant: "dgahub", homeSlug: "home-blocks" });

test("CSV starts with a BOM, has the field keys as header and CRLF rows", () => {
  const csv = toCsv(egdi);
  assert.equal(csv.charCodeAt(0), 0xfeff, "UTF-8 BOM so Excel reads Thai correctly");
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], "year,country,score,note");
  assert.equal(lines.length, 1 + egdi.rows.length);
  assert.equal(lines[1], "2022,THA,0.766,");
});

test("CSV quotes commas, quotes and line breaks", () => {
  const csv = toCsv(egdi);
  assert.ok(csv.includes('"rank 52, ""highest"""'), "comma + doubled quotes");
  assert.ok(csv.includes('"line\nbreak"'), "embedded newline stays inside quotes");
});

test("dataset JSON carries metadata, a data dictionary in the locale and all rows", () => {
  const j = datasetJson(site, egdi, "en");
  assert.equal(j.key, "egdi");
  assert.equal(j.records, 5);
  assert.equal(j.verified, true);
  assert.equal(j.license, "CC BY 4.0");
  assert.deepEqual(j.fields.map((f) => f.label), ["Year", "Country", "Score", "Note"]);
  assert.equal(j.fields[2].unit, "score");
  assert.equal(j.rows.length, 5);
  assert.ok(JSON.parse(JSON.stringify(j)), "serialisable");
});

test("catalogue entries link to the static JSON and CSV files of the right language", () => {
  const th = datasetMeta(site, egdi, "th");
  const en = datasetMeta(site, egdi, "en");
  assert.match(th.distribution[0].downloadURL, /\/dgahub\/data\/egdi\.json$/);
  assert.match(th.distribution[1].downloadURL, /\/dgahub\/data\/egdi\.csv$/);
  assert.match(en.distribution[0].downloadURL, /\/en\/dgahub\/data\/egdi\.json$/);
});
