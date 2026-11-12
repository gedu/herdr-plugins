import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dots, LOGO, screen, plain } from '../src/ui.js';

test('dots animate one step per frame and loop', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(dots), ['●○○', '●●○', '●●●', '○●●', '○○●', '○○○', '●○○']);
});

test('the logo is the three-cell braille mark', () => {
  assert.equal(plain(LOGO), '⢴⣤⠞');
});

const base = {
  phase: 'ready', frame: 1, today: '2026-11-12', dates: ['2026-11-11', '2026-11-12'], index: 1,
  serviceName: 'Senior React Native Engineer',
  drafts: { '2026-11-12': { status: 'ready', bullets: ['SF Figma run', 'Figma factory'] } },
};
const text = (state, width = 60) => screen(state, width).map(plain);

test('the ready screen shows the day, the hours, the service, the bullets and the keys', () => {
  const lines = text(base);
  assert.ok(lines.some((l) => l.includes('Thu 11-12 · today')));
  assert.ok(lines.some((l) => l.includes('8 h · Senior React Native Engineer')));
  assert.ok(lines.includes(' - SF Figma run') && lines.includes(' - Figma factory'));
  assert.ok(lines.at(-1).includes('↵ publish') && lines.at(-1).includes('e edit'));
  assert.ok(lines.some((l) => l.includes('2 days without an entry')));
});

test('publishing shows the logo, the word and the animated dots', () => {
  const lines = text({ ...base, phase: 'publishing', frame: 1 });
  assert.equal(lines.at(-1).trim(), '⢴⣤⠞ Publishing ●●○');
});

test('drafting shows the dots where the bullets go', () => {
  const lines = text({ ...base, frame: 2, drafts: { '2026-11-12': { status: 'drafting' } } });
  assert.ok(lines.some((l) => l.trim() === '⢴⣤⠞ Drafting ●●●'));
});

test('a day with no evidence asks for the note by hand', () => {
  const lines = text({ ...base, drafts: { '2026-11-12': { status: 'ready', bullets: [] } } });
  assert.ok(lines.some((l) => l.includes('No commits or PRs found') && l.includes('e')));
});

test('done and error states replace the key line', () => {
  assert.equal(text({ ...base, phase: 'done', message: 'Published 2026-11-12' }).at(-1).trim(), '✓ Published 2026-11-12');
  assert.equal(text({ ...base, phase: 'error', message: 'Productive 401: bad token' }).at(-1).trim(), '✗ Productive 401: bad token');
});

test('setup and all-logged screens explain themselves', () => {
  assert.ok(text({ phase: 'setup', message: 'Add "token" to config.json' }).some((l) => l.includes('Add "token" to config.json')));
  assert.ok(text({ ...base, dates: [], phase: 'ready' }).some((l) => l.includes('Every weekday is logged')));
});

test('no line is wider than the popup', () => {
  const long = { ...base, drafts: { '2026-11-12': { status: 'ready', bullets: ['x'.repeat(200)] } } };
  for (const line of text(long, 30)) assert.ok([...line].length <= 30, line);
});

test('a day already logged shows its note and cannot be published', () => {
  const lines = text({ ...base, index: 0, logged: { '2026-11-11': ['SF Figma run'] }, drafts: {} });
  assert.ok(lines.includes(' - SF Figma run'));
  assert.ok(lines.at(-1).includes('✓ Already logged'));
  assert.ok(!lines.at(-1).includes('publish'));
});

test('the header counts only the days without an entry', () => {
  const lines = text({ ...base, dates: ['2026-11-10', '2026-11-11', '2026-11-12'], logged: { '2026-11-10': ['x'] } });
  assert.ok(lines.some((l) => l.includes('2 days without an entry')));
  assert.ok(text({ ...base, logged: { '2026-11-11': ['x'], '2026-11-12': ['y'] } }).some((l) => l.includes('every day logged')));
});

test('when today is already logged the popup says so and offers nothing to publish', () => {
  const lines = text({ ...base, index: 1, logged: { '2026-11-12': ['SF Figma run'] }, drafts: {} });
  assert.ok(lines.at(-1).includes('✓ Today is already logged · nothing to do'));
  assert.ok(!lines.some((l) => l.includes('publish') || l.includes('Drafting')));
});

test('the already-logged message is green, check mark and text', () => {
  const raw = screen({ ...base, index: 1, logged: { '2026-11-12': ['x'] }, drafts: {} }, 70).at(-1);
  assert.ok(raw.includes('\x1b[38;2;183;204;133m✓ Today is already logged · nothing to do\x1b[0m'), JSON.stringify(raw));
});
