// Test-only module hook, loaded via `node --import ./tests/setup/register.mjs`
// BEFORE `--import tsx` on the command line (see package.json's "test"
// script — order matters: whichever --import runs first patches first, so
// tsx's own resolver ends up wrapping ours and falling through to it).
//
// Several production files this test suite imports for real (lib/agent/
// tools.ts, lib/agent/runtime.ts, lib/cms/governance.ts, lib/cms/strapi.ts,
// and their own transitive imports) start with `import "server-only"` — a
// real guard against client-bundle inclusion in production, resolved by
// Next's webpack build via a `react-server` export condition to
// next/dist/compiled/server-only. Outside a Next build (a plain `node`/`tsx`
// process, which is what `node --test` is) there is no top-level
// "server-only" package anywhere in node_modules for Node's normal resolver
// to find, and the bare `require("server-only")` these files emit (this
// project has no package.json "type":"module", so tsx compiles their
// `import` statements to CJS `require`) throws "Cannot find module" before
// any test code runs.
//
// This patches Node's CJS resolver to redirect exactly that one specifier to
// a real, empty stand-in file — nothing else is touched, and the production
// files under test are otherwise unmodified and imported for real.
import Module from "node:module";
import { fileURLToPath } from "node:url";

const stubPath = fileURLToPath(new URL("./server-only-empty.cjs", import.meta.url));
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return stubPath;
  return originalResolveFilename.call(this, request, ...rest);
};
