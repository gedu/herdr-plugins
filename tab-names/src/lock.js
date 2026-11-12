// A lock dir that serializes runs. If another run holds it, this run skips the work:
// that run is already reconciling every tab, and the next event covers anything newer.
import { mkdir, rm, stat } from 'node:fs/promises';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withLock(lockDir, fn, { tries = 50, waitMs = 100, staleMs = 15_000 } = {}) {
  let held = false;
  for (let i = 0; i < tries && !held; i++) {
    try {
      await mkdir(lockDir);
      held = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const age = await stat(lockDir).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > staleMs) await rm(lockDir, { recursive: true, force: true });
      else await sleep(waitMs);
    }
  }
  if (!held) return { ran: false };
  try {
    return { ran: true, value: await fn() };
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}
