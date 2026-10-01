import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeAlarmWav } from './audio.js';
import { acquireLock } from './lock.js';
import { createBackend } from './platforms.js';

export async function runAlarm({ backend = createBackend(), signal, lock = acquireLock, temporaryRoot = tmpdir() } = {}) {
  signal?.throwIfAborted();
  const release = await lock();
  if (!release) return { alreadyActive: true, errors: [] };
  const errors = [];
  let directory;
  let state;
  try {
    signal?.throwIfAborted();
    directory = await mkdtemp(join(temporaryRoot, 'horrifying-notifs-'));
    const file = join(directory, 'alarm.wav');
    await writeFile(file, makeAlarmWav(), { mode: 0o600 });
    await backend.check(file, signal);
    try { state = await backend.snapshot(signal); }
    catch (error) { errors.push(`Could not read volume; using existing settings: ${error.message}`); }
    signal?.throwIfAborted();
    if (state !== undefined) {
      try { await backend.maximize(state, signal); }
      catch (error) { errors.push(`Could not maximize volume: ${error.message}`); }
    }
    signal?.throwIfAborted();
    await backend.play(file, signal);
  } catch (error) {
    errors.push(error.message);
  } finally {
    // Cleanup deliberately does not receive the cancelled signal.
    if (state !== undefined) {
      try { await backend.restore(state); }
      catch (error) { errors.push(`Could not restore volume: ${error.message}`); }
    }
    if (directory) {
      try { await rm(directory, { recursive: true, force: true }); }
      catch (error) { errors.push(`Could not remove temporary audio: ${error.message}`); }
    }
    try { await release(); }
    catch (error) { errors.push(`Could not release alarm lock: ${error.message}`); }
  }
  return { alreadyActive: false, errors };
}
