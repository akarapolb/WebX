// File import (lib/importData.ts): reading a CSV / JSON table, guessing the column → field mapping, and
// turning each row's text into the values a content type needs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseDelimited, parseTable, guessMapping, recordFromRow, coerceValue, coerceRecord, normalizeDate, titleKeyOf,
  ImportParseError, type ImportField,
} from "../lib/importData";

const EVENT_FIELDS: ImportField[] = [
  { key: "title", type: "string", required: true },
  { key: "excerpt", type: "text" },
  { key: "event_date", type: "date" },
  { key: "event_time", type: "string" },
  { key: "location", type: "string" },
  { key: "order", type: "integer" },
  { key: "active", type: "boolean" },
  { key: "tier", type: "enumeration", options: ["Fellow", "Associate"] },
];

describe("parseDelimited", () => {
  test("reads quoted cells, doubled quotes, line breaks inside quotes and CRLF", () => {
    const rows = parseDelimited('a,b,c\r\n1,"he said ""hi""",3\r\n"two\nlines",x,y\r\n');
    assert.deepEqual(rows, [["a", "b", "c"], ["1", 'he said "hi"', "3"], ["two\nlines", "x", "y"]]);
  });
  test("detects semicolon and tab delimiters, drops a BOM and empty rows", () => {
    assert.deepEqual(parseDelimited("﻿a;b\n1;2\n;\n3;4"), [["a", "b"], ["1", "2"], ["3", "4"]]);
    assert.deepEqual(parseDelimited("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
  });
  test("keeps Thai text and a last row with no final newline", () => {
    assert.deepEqual(parseDelimited("หัวข้อ,วันที่\nประชุม,5/9/2569"), [["หัวข้อ", "วันที่"], ["ประชุม", "5/9/2569"]]);
  });
});

describe("parseTable", () => {
  test("CSV: the first line is the header, short rows are padded", () => {
    const t = parseTable("title,date\nA,2026-01-01\nB", "x.csv");
    assert.deepEqual(t.headers, ["title", "date"]);
    assert.deepEqual(t.rows, [["A", "2026-01-01"], ["B", ""]]);
  });
  test("JSON: a list of objects, or an object holding one; columns are the union of keys", () => {
    const a = parseTable('[{"title":"A","n":1},{"title":"B","ok":true}]', "x.json");
    assert.deepEqual(a.headers, ["title", "n", "ok"]);
    assert.deepEqual(a.rows, [["A", "1", ""], ["B", "", "true"]]);
    const b = parseTable('{"items":[{"title":"A"}]}', "x.json");
    assert.deepEqual(b.rows, [["A"]]);
  });
  test("refuses an empty file and JSON that is not a list of objects", () => {
    assert.throws(() => parseTable("  \n ", "x.csv"), (e: any) => e instanceof ImportParseError && e.code === "empty");
    assert.throws(() => parseTable("[1,2]", "x.json"), (e: any) => e.code === "badjson");
    assert.throws(() => parseTable("{oops", "x.json"), (e: any) => e.code === "badjson");
  });
});

describe("guessMapping", () => {
  test("matches field names and the Thai or English words people use, one column per field", () => {
    const m = guessMapping(["ชื่อกิจกรรม", "วันที่", "เวลา", "สถานที่", "Excerpt", "อะไรก็ได้"], EVENT_FIELDS);
    assert.deepEqual(m, ["title", "event_date", "event_time", "location", "excerpt", ""]);
  });
  test("an exact field name wins and a field is never taken twice", () => {
    const m = guessMapping(["title", "ชื่อ", "event_date"], EVENT_FIELDS);
    assert.deepEqual(m, ["title", "", "event_date"]);
  });
});

describe("recordFromRow / coerce", () => {
  test("takes only mapped columns; the first non-empty column wins for one field", () => {
    assert.deepEqual(recordFromRow(["A", "", "B", "x"], ["title", "title", "title", ""]), { title: "A" });
    assert.deepEqual(recordFromRow(["", "B"], ["title", "title"]), { title: "B" });
  });
  test("dates: ISO, day/month/year, and Buddhist years; impossible dates fail", () => {
    assert.equal(normalizeDate("2026-09-05"), "2026-09-05");
    assert.equal(normalizeDate("5/9/2026"), "2026-09-05");
    assert.equal(normalizeDate("5/9/2569"), "2026-09-05");
    assert.equal(normalizeDate("2569-09-05"), "2026-09-05");
    assert.equal(normalizeDate("31/2/2026"), null);
    assert.equal(normalizeDate("hello"), null);
  });
  test("numbers, yes/no (Thai too), options (case-insensitive) and email", () => {
    assert.deepEqual(coerceValue("1,200", { key: "order", type: "integer" }), { ok: true, value: 1200 });
    assert.equal(coerceValue("1.5", { key: "order", type: "integer" }).ok, false);
    assert.deepEqual(coerceValue("ใช่", { key: "active", type: "boolean" }), { ok: true, value: true });
    assert.deepEqual(coerceValue("no", { key: "active", type: "boolean" }), { ok: true, value: false });
    assert.equal(coerceValue("maybe", { key: "active", type: "boolean" }).ok, false);
    assert.deepEqual(coerceValue("fellow", EVENT_FIELDS[7]), { ok: true, value: "Fellow" });
    const o = coerceValue("King", EVENT_FIELDS[7]);
    assert.equal(o.ok, false);
    assert.equal(o.ok === false && o.error.detail, "Fellow, Associate");
    assert.equal(coerceValue("a@b.co", { key: "e", type: "email" }).ok, true);
    assert.equal(coerceValue("nope", { key: "e", type: "email" }).ok, false);
    assert.equal(coerceValue("x".repeat(6), { key: "s", type: "string", maxLength: 5 }).ok, false);
  });
  test("coerceRecord lists every problem, omits empty optional fields and ignores keys that are not fields", () => {
    const good = coerceRecord({ title: "ประชุม", event_date: "5/9/2569", order: "2", location: "", hacker: "x" }, EVENT_FIELDS);
    assert.deepEqual(good.errors, []);
    assert.deepEqual(good.data, { title: "ประชุม", event_date: "2026-09-05", order: 2 });
    const bad = coerceRecord({ event_date: "soon", order: "two" }, EVENT_FIELDS);
    assert.deepEqual(bad.errors.map((e) => e.field + ":" + e.code).sort(), ["event_date:date", "order:number", "title:required"]);
  });
  test("links: http(s), mailto, tel and site paths pass; script URLs, spaces and bare domains fail", () => {
    const f: ImportField = { key: "link_url", type: "url" };
    for (const ok of ["https://www.orst.go.th/iwfm_list.asp?n=g&b=e&i=0020000402001002%2F69F%2DN3044019", "/orst/about", "mailto:a@b.co", "#x"]) assert.equal(coerceValue(ok, f).ok, true, ok);
    for (const bad of ["javascript:alert(1)", "orst.go.th/x", "https://a.com/x y", "//evil.com", "data:text/html,x"]) assert.equal(coerceValue(bad, f).ok, false, bad);
    assert.deepEqual(guessMapping(["ลิงก์ข่าว", "ชื่อ"], [{ key: "title", type: "string" }, f]), ["link_url", "title"]);
  });
  test("titleKeyOf finds the field to compare when skipping titles that already exist", () => {
    assert.equal(titleKeyOf(EVENT_FIELDS), "title");
    assert.equal(titleKeyOf([{ key: "question", type: "string" }]), "question");
    assert.equal(titleKeyOf([{ key: "x", type: "string" }]), null);
  });
});
