// Test fixtures: a small dataset in the shape lib/cms.ts returns.
import type { Dataset } from "@/lib/cms";

export const egdi: Dataset = {
  documentId: "d1",
  key: "egdi",
  title: "UN EGDI",
  description: "Score and rank",
  sourceName: "UN DESA",
  sourceUrl: "https://publicadministration.un.org/egovkb",
  license: "CC BY 4.0",
  verified: true,
  updatedOn: "2026-11-20",
  updateCycle: "biennial",
  fields: [
    { key: "year", type: "integer", label: { th: "ปี", en: "Year" } },
    { key: "country", type: "string", label: { th: "ประเทศ", en: "Country" }, valueLabels: { THA: { th: "ไทย", en: "Thailand", focus: true }, SGP: { th: "สิงคโปร์", en: "Singapore" } } },
    { key: "score", type: "number", unit: "score", label: { th: "คะแนน", en: "Score" } },
    { key: "note", type: "string", label: { th: "หมายเหตุ", en: "Note" } },
  ] as any,
  rows: [
    { year: 2022, country: "THA", score: 0.766, note: "" },
    { year: 2024, country: "THA", score: 0.8351, note: 'rank 52, "highest"' },
    { year: 2026, country: "THA", score: 0.7732, note: "line\nbreak" },
    { year: 2024, country: "SGP", score: 0.9691, note: "" },
    { year: 2026, country: "SGP", score: 0.9722, note: "" },
  ],
};
