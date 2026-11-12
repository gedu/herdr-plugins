import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { publishDay } from '../src/publish.js';
import { productive } from '../src/productive.js';

function fakeApi(existing = []) {
  const calls = [];
  return {
    calls,
    entries: async (personId, from, to) => { calls.push(['entries', personId, from, to]); return existing; },
    create: async (entry) => { calls.push(['create', entry]); return '991'; },
  };
}

test('publishDay re-checks the day, then creates 8 h with the bullets as the note', async () => {
  const api = fakeApi();
  const id = await publishDay({ api, personId: '7', serviceId: '42', date: '2026-11-11', bullets: ['SF run', 'Metrics'] });
  assert.equal(id, '991');
  assert.deepEqual(api.calls, [
    ['entries', '7', '2026-11-11', '2026-11-11'],
    ['create', { personId: '7', serviceId: '42', date: '2026-11-11', minutes: 480, note: '<ul><li><p>SF run</p></li><li><p>Metrics</p></li></ul>' }],
  ]);
});

test('publishDay never posts a day that already has an entry', async () => {
  const api = fakeApi([{ id: '5', date: '2026-11-11' }]);
  await assert.rejects(publishDay({ api, personId: '7', serviceId: '42', date: '2026-11-11', bullets: ['x'] }), /already has an entry; nothing sent/);
  assert.equal(api.calls.filter(([kind]) => kind === 'create').length, 0);
});

test('publishDay refuses an empty note without calling Productive', async () => {
  const api = fakeApi();
  await assert.rejects(publishDay({ api, personId: '7', serviceId: '42', date: '2026-11-11', bullets: [] }), /empty/);
  assert.deepEqual(api.calls, []);
});

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stubFetch(responses) {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    const { status = 200, body } = responses.shift();
    return { ok: status < 400, status, statusText: '', text: async () => JSON.stringify(body) };
  };
  return requests;
}

test('create sends the JSON:API body Productive documents, with the token headers', async () => {
  const requests = stubFetch([{ status: 201, body: { data: { id: '991' } } }]);
  const id = await productive({ token: 'tok', organizationId: 52239 }).create({ personId: '7', serviceId: '42', date: '2026-11-11', minutes: 480, note: '- a' });
  assert.equal(id, '991');
  assert.equal(requests[0].url, 'https://api.productive.io/api/v2/time_entries');
  assert.equal(requests[0].init.method, 'POST');
  assert.deepEqual(requests[0].init.headers, { 'X-Auth-Token': 'tok', 'X-Organization-Id': '52239', 'Content-Type': 'application/vnd.api+json' });
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    data: { type: 'time_entries', attributes: { date: '2026-11-11', time: 480, note: '- a' },
      relationships: { person: { data: { type: 'people', id: '7' } }, service: { data: { type: 'services', id: '42' } } } },
  });
});

test('entries keeps only the asked dates and names the service', async () => {
  const entry = (id, date) => ({ id, attributes: { date, time: 480, note: 'n' }, relationships: { service: { data: { id: '42' } } } });
  const requests = stubFetch([{ body: { data: [entry('1', '2026-11-08'), entry('2', '2026-11-10'), entry('3', '2026-11-13')], included: [{ type: 'services', id: '42', attributes: { name: 'Senior RN' } }] } }]);
  const out = await productive({ token: 't', organizationId: '1' }).entries('7', '2026-11-09', '2026-11-12');
  assert.deepEqual(out.map((e) => [e.id, e.date, e.serviceName]), [['2', '2026-11-10', 'Senior RN']]);
  assert.match(requests[0].url, /filter\[person_id\]=7&filter\[after\]=2026-11-08&filter\[before\]=2026-11-13/);
});

test('an API error surfaces Productive\'s own message', async () => {
  stubFetch([{ status: 401, body: { errors: [{ title: 'Unauthorized', detail: 'Invalid token' }] } }]);
  await assert.rejects(productive({ token: 'bad', organizationId: '1' }).personId('a@b.c'), /Productive 401: Invalid token/);
});
