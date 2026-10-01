import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackend } from '../src/platforms.js';

test('macOS snapshots, maximizes, and restores volume/mute without shell interpolation', async () => {
  const calls = [];
  const backend = createBackend('darwin', { run: async (...args) => { calls.push(args); return '23,true'; } });
  const state = await backend.snapshot();
  await backend.maximize(state);
  const file = "/tmp/a space/'quote;$(echo bad).wav";
  await backend.play(file);
  await backend.restore(state);
  assert.deepEqual(state, { volume: 23, muted: true });
  assert.match(calls[1][1].join(' '), /output volume 100 output muted false/);
  assert.deepEqual(calls[2].slice(0, 2), ['/usr/bin/afplay', ['-v', '1', file]]);
  assert.match(calls[3][1].join(' '), /output volume 23 output muted true/);
});

test('Linux targets the captured sink and restores each channel without losing balance', async () => {
  const calls = [];
  const backend = createBackend('linux', { run: async (file, args) => {
    calls.push([file, args]);
    if (args[0] === 'get-default-sink') return 'speakers';
    if (args.includes('list')) return JSON.stringify([{ name: 'speakers', mute: true, volume: { left: { value: 12000 }, right: { value: 24000 } } }]);
    return '';
  } });
  const state = await backend.snapshot();
  await backend.maximize(state);
  await backend.play('/tmp/alarm.wav');
  await backend.restore(state);
  assert.deepEqual(calls.slice(2), [
    ['pactl', ['set-sink-volume', 'speakers', '100%']],
    ['pactl', ['set-sink-mute', 'speakers', '0']],
    ['paplay', ['--device=speakers', '--volume=65536', '/tmp/alarm.wav']],
    ['pactl', ['set-sink-volume', 'speakers', '12000', '24000']],
    ['pactl', ['set-sink-mute', 'speakers', '1']],
  ]);
});

test('Linux attempts mute restoration even when volume restoration fails', async () => {
  const calls = [];
  const backend = createBackend('linux', { run: async (file, args) => {
    calls.push(args);
    if (args[0] === 'set-sink-volume') throw new Error('volume refused');
  } });
  await assert.rejects(backend.restore({ device: 'speakers', volumes: [12000], muted: true }), /volume refused/);
  assert.deepEqual(calls[1], ['set-sink-mute', 'speakers', '1']);
});

test('rejects invalid mixer snapshots instead of modifying unknown settings', async () => {
  const mac = createBackend('darwin', { run: async () => 'not volume data' });
  await assert.rejects(mac.snapshot(), /volume/i);
  const linux = createBackend('linux', { run: async (file, args) => args[0] === 'get-default-sink' ? 'gone' : '[]' });
  await assert.rejects(linux.snapshot(), /sink/i);
});

test('Windows sends paths and state as data to a fixed PowerShell script', async () => {
  const calls = [];
  const backend = createBackend('win32', { run: async (...args) => {
    calls.push(args);
    return JSON.stringify({ Device: 'id', Volume: 0.23, Muted: true });
  } });
  const state = await backend.snapshot();
  const file = "C:\\Users\\a 'quote\\alarm.wav";
  await backend.maximize(state);
  await backend.play(file);
  await backend.restore(state);
  assert.equal(calls[2][2].env.HORRIFYING_NOTIFS_WAV, file);
  assert.ok(!calls[2][1].join(' ').includes(file));
  assert.equal(calls[3][2].env.HORRIFYING_NOTIFS_STATE, JSON.stringify(state));
  assert.equal(calls[3][2].signal, undefined);
});

test('unsupported operating systems fail clearly', () => {
  assert.throws(() => createBackend('freebsd'), /unsupported/i);
});
