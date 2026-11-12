// Pure rules: which days lack an entry, how a note looks, and what the drafting model is told.

const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

export function weekdaysBetween(from, to) {
  const days = [];
  for (let d = parse(from); localDate(d) <= to; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(localDate(d));
  }
  return days;
}

export function missingDays(entries, { from, to, holidays = [] }) {
  const skip = new Set([...entries.map((e) => e.date), ...holidays]);
  return weekdaysBetween(from, to).filter((d) => !skip.has(d));
}

export const noteFromBullets = (bullets) => bullets.map((b) => `- ${b}`).join('\n');

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// Productive stores notes as rich text: Markdown through some clients, HTML through others.
export function bulletsFromNote(note) {
  if (!note) return [];
  const items = /<li[\s>]/i.test(note)
    ? [...note.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1])
    : note.replace(/<\/(p|div)>|<br\s*\/?>/gi, '\n').split('\n');
  return items.map((s) => decode(s.replace(/<[^>]+>/g, '')).replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
}

const NOT_JIRA = new Set(['UTF', 'ISO', 'SHA', 'RFC', 'ES', 'HTTP', 'MD']);

export function jiraKeys(texts) {
  const keys = new Set();
  for (const text of texts) {
    for (const [key, project] of String(text).matchAll(/\b([A-Z][A-Z0-9]+)-\d+\b/g)) if (!NOT_JIRA.has(project)) keys.add(key);
  }
  return [...keys];
}

export function cleanBullets(bullets) {
  if (!Array.isArray(bullets)) return [];
  return bullets.map((b) => String(b).replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 4);
}

export function draftPrompt({ date, examples, commits, prs, jira }) {
  const lines = [
    `Write the time-entry note for ${date}: 2 to 4 very short bullets (2-6 words each) naming what was worked on.`,
    'Match the style of the previous entries: terse topic names, no verbs like "worked on" unless they use them, no ticket numbers unless they help.',
    'Group related commits into one bullet. Do not invent work that the evidence does not show.',
    '',
    'Previous entries:',
    ...(examples.length ? examples.map((bullets) => bullets.map((b) => `- ${b}`).join('\n')).join('\n\n').split('\n') : ['(none)']),
    '',
  ];
  if (!commits.length && !prs.length) {
    lines.push('Evidence: no commits or PRs were found for that day. Return an empty list.');
  } else {
    lines.push('Commits that day:', ...commits.map((c) => `${c.repo}: ${c.subject}`), '');
    lines.push('Pull requests touched that day:', ...(prs.length ? prs.map((p) => `${p.repo}#${p.number} ${p.title}`) : ['(none)']), '');
    if (jira.length) lines.push(`Jira tickets mentioned: ${jira.join(', ')}`);
  }
  return lines.join('\n');
}

// The end-of-day reminder: weekdays only, from `hour` on, at most once per day.
export function shouldRemind(now, lastReminded, hour) {
  const day = now.getDay();
  return day !== 0 && day !== 6 && now.getHours() >= hour && lastReminded !== localDate(now);
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The note as Productive stores it (its rich-text editor saves a <ul> of <p> items).
export const noteHtml = (bullets) => `<ul>${bullets.map((b) => `<li><p>${escapeHtml(b)}</p></li>`).join('')}</ul>`;

// The popup opens on today when today is a working day (logged or not); on a weekend or
// holiday it opens on the newest day without an entry, else the newest day.
export function startIndex(dates, missing, today) {
  if (dates.includes(today)) return dates.indexOf(today);
  const target = missing.at(-1) ?? dates.at(-1);
  return Math.max(0, dates.indexOf(target));
}
