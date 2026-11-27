// Which tenant a public request is for (src/middlewares/tenant.ts), and decision D9: a request that names a
// tenant gets that tenant or nothing; only one that names none falls back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTenant } from '../src/middlewares/tenant';

const list = [
  { id: 1, key: 'dga', domains: ['www.dga.or.th'] },
  { id: 2, key: 'pea', domains: ['www.pea.co.th'] },
];

test('a named tenant that exists is that tenant, whatever the Host says', () => {
  assert.equal(pickTenant(list, 'pea', 'www.dga.or.th').tenant?.key, 'pea');
});

test('a named tenant that does not exist is unknown: no tenant, not the default and not the Host one (D9)', () => {
  assert.deepEqual(pickTenant(list, 'peaa', ''), { tenant: null, unknown: 'peaa' });
  assert.deepEqual(pickTenant(list, 'peaa', 'www.dga.or.th'), { tenant: null, unknown: 'peaa' });
  assert.deepEqual(pickTenant([], 'dga', ''), { tenant: null, unknown: 'dga' }, 'with no tenants at all, a named one is unknown too');
});

test('a request that names no tenant falls back: the Host that matches a domain, then dga, then the first', () => {
  assert.equal(pickTenant(list, '', 'www.pea.co.th').tenant?.key, 'pea');
  assert.equal(pickTenant(list, '', 'unknown.example').tenant?.key, 'dga');
  assert.equal(pickTenant(list, '', '').tenant?.key, 'dga');
  assert.equal(pickTenant([list[1]], '', '').tenant?.key, 'pea', 'no dga: the first active tenant');
  assert.deepEqual(pickTenant([], '', ''), { tenant: null }, 'no tenants and none named: nothing, and nothing unknown');
});
