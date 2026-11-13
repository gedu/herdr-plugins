// Short, easy ids an agent can be told: "purchases", "checkout-ui", "purchases-2".
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'with', 'el', 'la', 'los', 'las', 'de', 'del', 'y', 'un', 'una']);
const MAX = 20;

export function slug(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function idFor(feature, taken = []) {
  const words = slug(feature).filter((w) => !STOP.has(w));
  // "Purchases · free trial" → "purchases": a separator ends the name.
  const head = String(feature).split(/\s[·:|—–-]\s|[·:|]/)[0];
  const headWords = slug(head).filter((w) => !STOP.has(w));
  // One word when it says enough ("purchases"), two when the first is short ("auth-flow").
  const all = headWords.length ? headWords : words;
  const pick = all[0]?.length >= 6 ? all.slice(0, 1) : all.slice(0, 2);
  const base = pick.join('-').slice(0, MAX).replace(/-+$/, '') || 'flow';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base.slice(0, MAX - String(n).length - 1)}-${n}`;
    if (!used.has(id)) return id;
  }
}

export const validId = (id) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id);
