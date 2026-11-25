// The scheduler account is a Super Admin, so the password it is created with must never be the one written in the
// public repository outside development (src/utils/scheduler-credentials.ts, used by src/seed/seed.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_DEFAULT_SCHEDULER_PASSWORD, schedulerSeedPassword } from '../src/utils/scheduler-credentials';

test('a password that was set is used, in every environment', () => {
  for (const NODE_ENV of ['production', 'development', 'test', undefined]) {
    assert.equal(schedulerSeedPassword({ NODE_ENV, STRAPI_SCHEDULER_PASSWORD: 'a-private-one' }), 'a-private-one', String(NODE_ENV));
  }
});

test('with none set, development gets the public default and production gets nothing', () => {
  assert.equal(schedulerSeedPassword({ NODE_ENV: 'development' }), PUBLIC_DEFAULT_SCHEDULER_PASSWORD);
  assert.equal(schedulerSeedPassword({}), PUBLIC_DEFAULT_SCHEDULER_PASSWORD, 'no NODE_ENV is not production');
  assert.equal(schedulerSeedPassword({ NODE_ENV: 'test', STRAPI_SCHEDULER_PASSWORD: '' }), PUBLIC_DEFAULT_SCHEDULER_PASSWORD);
  assert.equal(schedulerSeedPassword({ NODE_ENV: 'production' }), null, 'a production instance that missed the variable has no scheduler account');
  assert.equal(schedulerSeedPassword({ NODE_ENV: 'production', STRAPI_SCHEDULER_PASSWORD: '' }), null);
});

test('the public default is refused in production even when someone set it on purpose', () => {
  assert.equal(schedulerSeedPassword({ NODE_ENV: 'production', STRAPI_SCHEDULER_PASSWORD: PUBLIC_DEFAULT_SCHEDULER_PASSWORD }), null);
  assert.equal(schedulerSeedPassword({ NODE_ENV: 'development', STRAPI_SCHEDULER_PASSWORD: PUBLIC_DEFAULT_SCHEDULER_PASSWORD }), PUBLIC_DEFAULT_SCHEDULER_PASSWORD, 'development may keep it');
});
