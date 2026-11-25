// The Excel export of a form (TOR 17.9) lists the engine's rows and the control plane's together. The control plane is a
// small local server standing in for webx-control's /internal/records, so nothing real is involved.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { controlRecords, type ControlConfig } from '../src/utils/control-plane';
import { CONTROL_COLLECTION, controlRow, engineRow, mergeExportRows } from '../src/utils/form-export';

const seen: { url: string; auth: string | undefined }[] = [];
let total = 0;
let status = 200;
const server = createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://x');
  seen.push({ url: req.url || '', auth: req.headers.authorization });
  if (status !== 200) { res.writeHead(status, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'no' } })); }
  const page = Number(u.searchParams.get('page') || 1), size = Number(u.searchParams.get('pageSize') || 25);
  const all = Array.from({ length: total }, (_, i) => ({ documentId: 'd' + i, tenantKey: 'dga', n: i, createdAt: new Date(2026, 10, 1, 0, 0, total - i).toISOString() }));
  const data = all.slice((page - 1) * size, page * size);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data, meta: { pagination: { page, pageSize: size, pageCount: Math.max(1, Math.ceil(all.length / size)), total: all.length } } }));
});
let cfg: ControlConfig;
before(async () => {
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  cfg = { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token: 'svc' };
});
after(() => { server.close(); });

test('each export type has a collection in the control plane', () => {
  assert.deepEqual(CONTROL_COLLECTION, { application: 'application', complaint: 'complaint', registration: 'registration', contact: 'contact-message' });
});

test('an engine row is shown without ids, relation, editing bookkeeping or steps', () => {
  const r = engineRow({ id: 1, documentId: 'x', tenant: 3, createdById: 1, updatedById: 1, locale: 'th', steps: [{ a: 1 }], name: 'สมชาย', stage: 2, createdAt: '2026-11-01T00:00:00.000Z' });
  assert.deepEqual(Object.keys(r).sort(), ['createdAt', 'name', 'stage', 'steps']);
  assert.equal(r.steps, undefined);
  assert.equal(r.name, 'สมชาย');
});

test('a control-plane row is shown with the same columns, and a file by its name', () => {
  const r = controlRow({ id: 9, documentId: 'x', tenantKey: 'pea', steps: [{ a: 1 }], ref: 'DGA-CMP-1', name: 'นก', stage: 0, attachment: { documentId: 'f', name: 'หลักฐาน.pdf', size: 10 }, resume: null, createdAt: '2026-11-02T00:00:00.000Z' });
  assert.equal(r.ref, 'DGA-CMP-1');
  assert.equal(r.attachment, 'หลักฐาน.pdf');
  assert.equal(r.id, undefined); assert.equal(r.documentId, undefined); assert.equal(r.tenantKey, undefined); assert.equal(r.steps, undefined);
  assert.equal(r.resume, null);
});

test('both sources make one list, newest first, and a row with no time goes last', () => {
  const merged = mergeExportRows(
    [{ id: 1, name: 'e-old', createdAt: new Date('2026-01-01T00:00:00Z') }, { id: 2, name: 'e-new', createdAt: '2026-11-03T00:00:00.000Z' }],
    [{ documentId: 'c1', name: 'c-mid', createdAt: '2026-06-01T00:00:00.000Z' }, { documentId: 'c2', name: 'c-none' }],
  );
  assert.deepEqual(merged.map((r) => r.name), ['e-new', 'c-mid', 'e-old', 'c-none']);
  assert.deepEqual(mergeExportRows([], []), []);
});

test('the control plane is read a page at a time, for one workspace, newest first, with the service token', async () => {
  total = 1200; seen.length = 0; status = 200;
  const rows = await controlRecords(cfg, 'complaint', { tenantKey: 'dga', limit: 10000 });
  assert.equal(rows.length, 1200);
  assert.equal(new Set(rows.map((r) => r.documentId)).size, 1200, 'no row twice, none missing');
  assert.equal(seen.length, 3, '500 + 500 + 200');
  const u = new URL(seen[0].url, 'http://x');
  assert.equal(u.pathname, '/internal/records/complaint');
  assert.equal(u.searchParams.get('filter'), 'tenantKey:eq:dga');
  assert.equal(u.searchParams.get('sort'), 'createdAt:desc');
  assert.ok(seen.every((s) => s.auth === 'Bearer svc'));
});

test('all workspaces are read when none is named, and the limit cuts the list', async () => {
  total = 700; seen.length = 0;
  const rows = await controlRecords(cfg, 'contact-message', { limit: 600 });
  assert.equal(rows.length, 600);
  assert.equal(new URL(seen[0].url, 'http://x').searchParams.get('filter'), null);
  assert.equal(new URL(seen[0].url, 'http://x').pathname, '/internal/records/contact-message');
});

test('a collection with nothing in it is an empty list', async () => {
  total = 0; seen.length = 0;
  assert.deepEqual(await controlRecords(cfg, 'registration', { tenantKey: 'pea', limit: 10 }), []);
  assert.equal(seen.length, 1);
});

test('a control plane that cannot be read is an error, never a shorter list', async () => {
  total = 5; status = 503;
  await assert.rejects(controlRecords(cfg, 'application', { tenantKey: 'dga', limit: 10 }), /answered 503/);
  status = 200;
});
