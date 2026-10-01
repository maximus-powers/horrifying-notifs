import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommand } from '../src/command.js';

test('passes paths and shell metacharacters literally', async () => {
  const path = "a space/'quote';$(echo surprise).wav";
  assert.equal(await runCommand(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', path]), path);
});

test('reports missing programs and nonzero exits', async () => {
  await assert.rejects(runCommand('horrifying-notifs-nonexistent-program', []), /not found|ENOENT/i);
  await assert.rejects(runCommand(process.execPath, ['-e', 'console.error("device gone");process.exit(4)']), /device gone/);
});

test('terminates a hanging child on timeout', async () => {
  await assert.rejects(runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100 }), /timed out/i);
});

test('cancellation waits for the child to exit', async () => {
  const controller = new AbortController();
  const child = runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal });
  controller.abort(new Error('Cancelled by test'));
  await assert.rejects(child, /Cancelled by test/);
});

test('rejects an already cancelled command without spawning', async () => {
  const signal = AbortSignal.abort(new Error('Already cancelled'));
  await assert.rejects(runCommand('does-not-exist', [], { signal }), /Already cancelled/);
});
