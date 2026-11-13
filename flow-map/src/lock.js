// A lock dir that serializes writers of one flow (copied from tab-names, plugins stay self-contained).
// Unlike tab-names, callers wait for the lock: every update must land.
import { mkdir, rm, stat } from 'node:fs/promises';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ageOf = (dir) => stat(dir).then((s) => Date.now() - s.mtimeMs, () => -1);

async function reap(lockDir, staleMs) {
  const reaper = `${lockDir}.reap`;
  try {
    await mkdir(reaper);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // A reaper that died mid-way leaves its dir behind; it is only ever held for a moment.
    if ((await ageOf(reaper)) > staleMs) await rm(reaper, { recursive: true, force: true });
    else await sleep(5 + Math.random() * 10);
    return;
  }
  try {
    if ((await ageOf(lockDir)) > staleMs) await rm(lockDir, { recursive: true, force: true });
  } finally {
    await rm(reaper, { recursive: true, force: true });
  }
}

export async function withLock(lockDir, fn, { tries = 400, waitMs = 15, staleMs = 15_000 } = {}) {
  let held = false;
  for (let i = 0; i < tries && !held; i++) {
    try {
      await mkdir(lockDir);
      held = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const age = await ageOf(lockDir);
      // Only one waiter at a time may reap a stale lock, and it checks the age again
      // while holding the reap lock: a lock someone just made is never removed.
      if (age > staleMs) await reap(lockDir, staleMs);
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
