// A lock dir that serializes writers of one flow (copied from tab-names, plugins stay self-contained).
// Unlike tab-names, callers wait for the lock: every update must land.
import { mkdir, rm, stat } from 'node:fs/promises';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withLock(lockDir, fn, { tries = 400, waitMs = 15, staleMs = 15_000 } = {}) {
  let held = false;
  for (let i = 0; i < tries && !held; i++) {
    try {
      await mkdir(lockDir);
      held = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const age = await stat(lockDir).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > staleMs) await rm(lockDir, { recursive: true, force: true });
      else await sleep(waitMs + Math.random() * waitMs);
    }
  }
  if (!held) return { ran: false };
  try {
    return { ran: true, value: await fn() };
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}
