import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runAlarm } from '../src/alarm.js';
import { acquireLock } from '../src/lock.js';

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "horrifying test 'quotes'-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sound = { volume: 23, muted: true };
  const heard = [];
  const backend = {
    async check() {},
    async snapshot() { return { ...sound }; },
    async maximize() { sound.volume = 100; sound.muted = false; },
    async play(file) { heard.push({ ...sound, bytes: (await readFile(file)).length }); },
    async restore(state) { Object.assign(sound, state); },
    ...overrides,
  };
  return { root, sound, heard, backend, options: { backend, temporaryRoot: root, lock: () => acquireLock(join(root, 'alarm.lock')) } };
}

test('plays at maximum volume, then restores mute/volume and cleans up', async (t) => {
  const f = await fixture(t);
  const result = await runAlarm(f.options);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(f.heard, [{ volume: 100, muted: false, bytes: 264644 }]);
  assert.deepEqual(f.sound, { volume: 23, muted: true });
  assert.deepEqual(await readdir(f.root), []);
});

test('restores volume after playback fails', async (t) => {
  const f = await fixture(t, { async play() { throw new Error('device disconnected'); } });
  const result = await runAlarm(f.options);
  assert.match(result.errors.join('\n'), /device disconnected/);
  assert.deepEqual(f.sound, { volume: 23, muted: true });
  assert.deepEqual(await readdir(f.root), []);
});

test('still plays at existing volume when snapshot is unavailable', async (t) => {
  const f = await fixture(t, { async snapshot() { throw new Error('mixer unavailable'); } });
  const result = await runAlarm(f.options);
  assert.match(result.errors.join('\n'), /mixer unavailable/);
  assert.deepEqual(f.heard, [{ volume: 23, muted: true, bytes: 264644 }]);
});

test('restores partial volume changes when maximizing fails, after attempting playback', async (t) => {
  const f = await fixture(t);
  f.backend.maximize = async () => { f.sound.volume = 100; throw new Error('unmute failed'); };
  const result = await runAlarm(f.options);
  assert.match(result.errors.join('\n'), /unmute failed/);
  assert.equal(f.heard.length, 1);
  assert.deepEqual(f.sound, { volume: 23, muted: true });
});

test('cancellation restores settings with a fresh, uncancelled cleanup operation', async (t) => {
  const controller = new AbortController();
  const f = await fixture(t, {
    async play(file, signal) { controller.abort(new Error('Interrupted')); signal.throwIfAborted(); },
  });
  const result = await runAlarm({ ...f.options, signal: controller.signal });
  assert.match(result.errors.join('\n'), /Interrupted/);
  assert.deepEqual(f.sound, { volume: 23, muted: true });
  assert.deepEqual(await readdir(f.root), []);
});

test('preflight failure never changes volume', async (t) => {
  const f = await fixture(t, { async check() { throw new Error('player missing'); } });
  const result = await runAlarm(f.options);
  assert.match(result.errors.join('\n'), /player missing/);
  assert.equal(f.heard.length, 0);
  assert.deepEqual(f.sound, { volume: 23, muted: true });
});

test('restoration failure is visible and still releases files and lock', async (t) => {
  const f = await fixture(t, { async restore() { throw new Error('restore failed'); } });
  const result = await runAlarm(f.options);
  assert.match(result.errors.join('\n'), /restore failed/);
  assert.deepEqual(await readdir(f.root), []);
});

test('an overlapping invocation succeeds without starting a second alarm', async (t) => {
  const f = await fixture(t);
  const release = await f.options.lock();
  const result = await runAlarm(f.options);
  assert.equal(result.alreadyActive, true);
  assert.deepEqual(result.errors, []);
  assert.equal(f.heard.length, 0);
  await release();
});
