import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeConfig } from '../src/setup.js';

test('mergeConfig sets the token and organization and keeps every other setting', () => {
  const existing = { token: 'old', organization_id: '52239', roots: ['~/Documents/CK'], remind_hour: 18 };
  assert.deepEqual(mergeConfig(existing, { token: ' new-token \n', organizationId: '' }),
    { token: 'new-token', organization_id: '52239', roots: ['~/Documents/CK'], remind_hour: 18 });
});

test('mergeConfig fills defaults on a first setup', () => {
  assert.deepEqual(mergeConfig({}, { token: 't', organizationId: '123' }),
    { token: 't', organization_id: '123', roots: ['~/Documents'], remind_hour: 17 });
});

test('mergeConfig refuses an empty token or a missing organization', () => {
  assert.throws(() => mergeConfig({}, { token: '  ', organizationId: '1' }), /token is empty/);
  assert.throws(() => mergeConfig({}, { token: 't', organizationId: 'abc' }), /organization id must be a number/);
});
