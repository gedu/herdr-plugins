// Drops references GitHub says do not exist (HTTP 404), such as an issue number an agent made up.
// Any other failure (offline, no login, rate limit) keeps the reference: the card then shows
// the real error instead of the plugin pretending the issue is not there.
const isNotFound = ({ stderr = '', stdout = '' }) => /HTTP 404|Not Found/i.test(`${stderr}\n${stdout}`);

export async function keepExisting(refs, run) {
  const checks = await Promise.all(refs.map((r) => run('gh', ['api', `repos/${r.repo}/issues/${r.number}`, '--silent'])));
  return refs.filter((_, i) => !(checks[i].code !== 0 && isNotFound(checks[i])));
}
