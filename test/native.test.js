import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { makeAlarmWav } from '../src/audio.js';
import { createBackend } from '../src/platforms.js';
import { runCommand } from '../src/command.js';
import { runAlarm } from '../src/alarm.js';

test('native macOS can parse the WAV and read the volume without playing or changing it', { skip: process.platform !== 'darwin' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'horrifying-native-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'alarm.wav');
  await writeFile(file, makeAlarmWav());
  await createBackend().check(file);
  const info = await runCommand('/usr/bin/afinfo', [file]);
  assert.match(info, /3\.000000 sec/);
  const state = await createBackend().snapshot();
  assert.equal(typeof state.muted, 'boolean');
  assert.ok(state.volume >= 0 && state.volume <= 100);
});

test('native Windows compiles the Core Audio helper and loads PCM without playback', { skip: process.platform !== 'win32' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "horrifying native 'quote'-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'alarm.wav');
  await writeFile(file, makeAlarmWav());
  await createBackend().check(file);
});

test('native Linux plays to a null sink and restores both channel levels and mute', {
  skip: process.platform !== 'linux' || process.env.HORRIFYING_NOTIFS_TEST_PULSE !== '1', timeout: 30000,
}, async () => {
  const initial = await createBackend().snapshot();
  assert.equal(initial.device, 'horrifying_test', 'This test may only use its dedicated silent sink');
  try {
    for (const muted of [true, false]) {
      await runCommand('pactl', ['set-sink-volume', 'horrifying_test', '12000', '24000']);
      await runCommand('pactl', ['set-sink-mute', 'horrifying_test', muted ? '1' : '0']);
      const before = await createBackend().snapshot();
      const result = await runAlarm();
      assert.deepEqual(result.errors, []);
      assert.deepEqual(await createBackend().snapshot(), before);
    }
  } finally {
    await createBackend().restore(initial);
  }
});
