// Strapi's backstop audit row is skipped for a write WebX Studio already audited (src/index.ts). `X-WebX-Governed: 1` is
// how Studio says so, but anyone with a Strapi login can send that header, so it counts only together with the internal
// secret (src/utils/governed-audit.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditedByWebx, sameSecret } from '../src/utils/governed-audit';

const SECRET = 'a-long-internal-secret-value';

test('Studio\'s own write, with the secret, is already audited: no second row', () => {
  assert.equal(auditedByWebx('1', SECRET, SECRET), true);
});

test('the header alone is not believed: whoever has a login could send it to hide a write', () => {
  assert.equal(auditedByWebx('1', '', SECRET), false, 'no secret sent');
  assert.equal(auditedByWebx('1', 'a-guess', SECRET), false, 'wrong secret');
  assert.equal(auditedByWebx('1', SECRET + 'x', SECRET), false, 'the secret and more');
  assert.equal(auditedByWebx('1', SECRET.slice(0, -1), SECRET), false, 'a prefix of the secret');
  assert.equal(auditedByWebx('1', SECRET.toUpperCase(), SECRET), false, 'the secret in another case');
});

test('without the header it is not a governed write, secret or not', () => {
  assert.equal(auditedByWebx('', SECRET, SECRET), false, 'a server call that did not claim it');
  assert.equal(auditedByWebx('0', SECRET, SECRET), false);
  assert.equal(auditedByWebx('true', SECRET, SECRET), false, 'only the exact value Studio sends');
  assert.equal(auditedByWebx('1 ', SECRET, SECRET), false);
});

test('with no secret configured the claim cannot be checked, so it is never believed (an extra row beats a missing one)', () => {
  assert.equal(auditedByWebx('1', '', undefined), false);
  assert.equal(auditedByWebx('1', '', ''), false, 'an empty secret is no secret');
  assert.equal(auditedByWebx('1', 'anything', undefined), false);
  assert.equal(auditedByWebx('1', 'undefined', undefined), false);
});

test('sameSecret compares by value, whatever the lengths', () => {
  assert.equal(sameSecret('abc', 'abc'), true);
  assert.equal(sameSecret('abc', 'abd'), false);
  assert.equal(sameSecret('abc', 'abcd'), false);
  assert.equal(sameSecret('', ''), true);
  assert.equal(sameSecret('', 'x'), false);
  assert.equal(sameSecret('ไทย', 'ไทย'), true);
  assert.equal(sameSecret('ไทย', 'ไทศ'), false);
});
