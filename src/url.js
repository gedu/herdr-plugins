// Links come from outside: a failed check's details URL is set by whoever posts the status
// (an external CI, a fork's workflow), so it can be any scheme or host. Only https links on
// github.com are ever handed to the system opener.
export function safeGithubUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('https://')) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port) return null;
  return url.href;
}
