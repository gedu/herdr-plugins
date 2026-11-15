// A folder as the sidebar shows it under a tab name: ~ for home, and when it does not fit,
// the tail (the part that tells folders apart) behind an ellipsis, e.g. …/herdr-plugins.
export const MAX_PATH = 22;

export function shortPath(dir, home, max = MAX_PATH) {
  if (!dir) return '';
  const inHome = home && (dir === home || dir.startsWith(`${home}/`));
  const full = inHome ? `~${dir.slice(home.length)}` : dir;
  if (full.length <= max) return full;
  const parts = full.split('/').filter(Boolean);
  let tail = '';
  for (let i = parts.length - 1; i >= 0; i--) {
    const next = tail ? `${parts[i]}/${tail}` : parts[i];
    if (`…/${next}`.length > max) break;
    tail = next;
  }
  return tail ? `…/${tail}` : `…${parts[parts.length - 1].slice(-(max - 1))}`;
}
