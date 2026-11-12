import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekdaysBetween, missingDays, noteFromBullets, bulletsFromNote, jiraKeys, cleanBullets, draftPrompt, localDate } from '../src/day.js';

test('weekdaysBetween lists Monday to Friday, both ends included', () => {
  assert.deepEqual(weekdaysBetween('2026-11-06', '2026-11-10'), ['2026-11-06', '2026-11-09', '2026-11-10']);
  assert.deepEqual(weekdaysBetween('2026-11-07', '2026-11-08'), []);
});

test('missingDays returns the weekdays with no entry, oldest first', () => {
  const entries = [{ date: '2026-11-09' }, { date: '2026-11-12' }, { date: '2026-11-12' }];
  assert.deepEqual(missingDays(entries, { from: '2026-11-09', to: '2026-11-12' }), ['2026-11-10', '2026-11-11']);
});

test('noteFromBullets writes Markdown bullets like the existing entries', () => {
  assert.equal(noteFromBullets(['SF Figma run', 'Figma factory improvements']), '- SF Figma run\n- Figma factory improvements');
});

test('bulletsFromNote reads Markdown and HTML notes', () => {
  assert.deepEqual(bulletsFromNote('-   SF Figma run\n-   Looking into Purchase'), ['SF Figma run', 'Looking into Purchase']);
  assert.deepEqual(bulletsFromNote('<ul><li><p>SF run</p></li><li>Metrics &amp; API</li></ul>'), ['SF run', 'Metrics & API']);
  assert.deepEqual(bulletsFromNote('Testing basic Software Factory'), ['Testing basic Software Factory']);
  assert.deepEqual(bulletsFromNote(null), []);
});

test('jiraKeys finds unique ticket keys and ignores encodings like UTF-8', () => {
  assert.deepEqual(jiraKeys(['feat(FRN-125): deliver layers', 'fix FRN-125 again', 'docs: UTF-8 and SHA-256', 'PAY-7 link']), ['FRN-125', 'PAY-7']);
});

test('cleanBullets trims, strips list marks, drops empties and keeps at most four', () => {
  assert.deepEqual(cleanBullets([' - SF run ', '', '* Metrics', 'a', 'b', 'c']), ['SF run', 'Metrics', 'a', 'b']);
  assert.deepEqual(cleanBullets('not a list'), []);
});

test('draftPrompt carries the date, the style examples and the evidence', () => {
  const prompt = draftPrompt({
    date: '2026-11-12',
    examples: [['SF Figma run', 'Figma factory improvements']],
    commits: [{ repo: 'food-revolution-network', subject: 'feat(FRN-125): deliver layers' }],
    prs: [{ repo: 'callstack/frn', title: 'Deliver layers', number: 12 }],
    jira: ['FRN-125'],
  });
  for (const part of ['2026-11-12', '- SF Figma run', 'food-revolution-network: feat(FRN-125): deliver layers', 'callstack/frn#12 Deliver layers', 'FRN-125']) {
    assert.ok(prompt.includes(part), `missing ${part}`);
  }
});

test('draftPrompt says so when there is no evidence', () => {
  assert.match(draftPrompt({ date: '2026-11-11', examples: [], commits: [], prs: [], jira: [] }), /no commits or PRs/i);
});

test('localDate formats a Date in local time as YYYY-MM-DD', () => {
  assert.equal(localDate(new Date(2026, 10, 3, 23, 30)), '2026-11-03');
});

test('shouldRemind fires once per weekday, only from the reminder hour on', async () => {
  const { shouldRemind } = await import('../src/day.js');
  const at = (d, h) => new Date(2026, 10, d, h, 5);
  assert.equal(shouldRemind(at(12, 17), null, 17), true);
  assert.equal(shouldRemind(at(12, 16), null, 17), false, 'too early');
  assert.equal(shouldRemind(at(12, 18), '2026-11-12', 17), false, 'already reminded today');
  assert.equal(shouldRemind(at(13, 18), '2026-11-12', 17), true, 'a new day');
  assert.equal(shouldRemind(at(14, 18), null, 17), false, 'Saturday');
});

test('noteHtml writes the bullet list Productive stores, escaping HTML', async () => {
  const { noteHtml, bulletsFromNote } = await import('../src/day.js');
  assert.equal(noteHtml(['SF run', 'A & <b>']), '<ul><li><p>SF run</p></li><li><p>A &amp; &lt;b&gt;</p></li></ul>');
  assert.deepEqual(bulletsFromNote(noteHtml(['SF run', 'A & <b>'])), ['SF run', 'A & <b>']);
});

test('missingDays leaves out holidays', () => {
  assert.deepEqual(missingDays([{ date: '2026-11-12' }], { from: '2026-11-10', to: '2026-11-12', holidays: ['2026-11-11'] }), ['2026-11-10']);
});

test('startIndex opens on today when today is a working day, else on the newest missing day', async () => {
  const { startIndex } = await import('../src/day.js');
  const dates = ['2026-11-09', '2026-11-10', '2026-11-12'];
  assert.equal(startIndex(dates, ['2026-11-09'], '2026-11-12'), 2, 'today, even when logged and older days are missing');
  assert.equal(startIndex(dates, ['2026-11-10'], '2026-11-14'), 1, 'a Saturday: newest missing day');
  assert.equal(startIndex(dates, [], '2026-11-14'), 2, 'a Saturday with nothing missing: newest day');
  assert.equal(startIndex([], [], '2026-11-14'), 0);
});
