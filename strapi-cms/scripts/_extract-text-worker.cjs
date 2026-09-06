/* Extraction worker for index-wp-documents.mjs, spawned as a child process
 * (see that file's own comment for why): `pdf-parse` gives wrong/garbled
 * results ("bad XRef entry" on a perfectly valid PDF) when loaded via
 * createRequire() from an ESM (.mjs) file — confirmed live, reproducibly,
 * isolated down to exactly that ESM-vs-CJS module-loading difference (not
 * the file content, not fetch(), not process pooling — every one of those
 * was ruled out first). Loading it from a genuine plain CommonJS file, as
 * this one is, works correctly every time. Takes a file path + a lowercase
 * extension hint as argv, prints the extracted text to stdout.
 *
 * Same dispatch logic as strapi-cms/src/utils/extract-text.ts — kept here
 * as its own small copy since the parent script needs this specific
 * CJS-file isolation trick, which extract-text.ts (itself already a CJS
 * module once compiled, but not usable as a standalone child-process
 * entrypoint) doesn't need for its normal in-process Strapi usage. */
const fs = require('fs');

async function extractText(absPath, hint) {
  const buf = fs.readFileSync(absPath);
  const e = String(hint || '').toLowerCase();
  if (e.includes('.pdf')) {
    const pdf = require('pdf-parse');
    const d = await pdf(buf);
    return d.text || '';
  }
  if (e.includes('.doc')) {
    const mammoth = require('mammoth');
    const r = await mammoth.extractRawText({ buffer: buf });
    return r.value || '';
  }
  if (e.includes('.xls')) {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buf, { type: 'buffer' });
    let t = '';
    wb.SheetNames.forEach((n) => { t += XLSX.utils.sheet_to_csv(wb.Sheets[n]) + '\n'; });
    return t;
  }
  return '';
}

const [, , absPath, hint] = process.argv;
extractText(absPath, hint)
  .then((text) => { process.stdout.write(text); })
  .catch((e) => { console.error(e.message); process.exit(1); });
