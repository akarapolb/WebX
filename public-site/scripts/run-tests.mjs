#!/usr/bin/env node
// `npm test`: the unit tests in tests/ under Node's own test runner, with tsx
// compiling TypeScript/JSX (tests/tsconfig.json). No browser, CMS or build needed.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const files = readdirSync("tests").filter((f) => /\.test\.tsx?$/.test(f)).map((f) => "tests/" + f);
const r = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
  env: { ...process.env, TSX_TSCONFIG_PATH: "tests/tsconfig.json" },
});
process.exit(r.status ?? 1);
