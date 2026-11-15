import test from 'node:test';
import assert from 'node:assert/strict';
import { keepExisting } from '../src/exists.js';

const ref = (number, repo = 'acme/web') => ({ repo, number });
const notFound = { code: 1, stdout: '{"message":"Not Found","status":"404"}', stderr: 'gh: Not Found (HTTP 404)\n' };
const ok = { code: 0, stdout: '{"number":1}', stderr: '' };

test('references that GitHub answers with 404 are dropped, the rest keep their order', async () => {
  const asked = [];
  const run = async (cmd, args) => {
    asked.push([cmd, ...args]);
    return args[1].endsWith('/99') ? notFound : ok;
  };
  const kept = await keepExisting([ref(7), ref(99), ref(3, 'other/api')], run);
  assert.deepEqual(kept, [ref(7), ref(3, 'other/api')]);
  assert.deepEqual(asked.map((a) => a[2]).sort(), ['repos/acme/web/issues/7', 'repos/acme/web/issues/99', 'repos/other/api/issues/3']);
});

test('a reference is kept when the check fails for any reason other than 404', async () => {
  const offline = { code: 1, stdout: '', stderr: 'error connecting to api.github.com\n' };
  const kept = await keepExisting([ref(1), ref(2)], async () => offline);
  assert.deepEqual(kept, [ref(1), ref(2)]);
});

test('when every reference is a 404 nothing is left', async () => {
  assert.deepEqual(await keepExisting([ref(1), ref(2)], async () => notFound), []);
});
