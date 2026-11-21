// Search analytics stores only normalised, non-personal queries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseQuery } from '../src/utils/search-query';

test('queries are trimmed, lower-cased, single-spaced and capped', () => {
  assert.equal(normaliseQuery('  Open   DATA  '), 'open data');
  assert.equal(normaliseQuery('ข้อมูลเปิด'), 'ข้อมูลเปิด');
  assert.equal(normaliseQuery('x'.repeat(300)).length, 100);
  assert.equal(normaliseQuery(''), '');
  assert.equal(normaliseQuery(undefined), '');
});

test('queries that look like personal data are not stored', () => {
  assert.equal(normaliseQuery('somchai@example.com'), '');
  assert.equal(normaliseQuery('081-234-5678'), '');
  assert.equal(normaliseQuery('1 2345 67890 12 3'), '');
  assert.equal(normaliseQuery('EGDI 2026'), 'egdi 2026', 'a year is fine');
  assert.equal(normaliseQuery('แผน 2566-2570'), 'แผน 2566-2570', 'a Thai year range is fine (8 digits but split)');
});
