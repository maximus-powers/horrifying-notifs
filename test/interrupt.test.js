import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

for (const [signal, expectedCode] of [['SIGTERM', 143], ['SIGHUP', 129]]) {
test(`a real ${signal} stops playback, restores state, and exits after cleanup`, { skip: process.platform === 'win32', timeout: 5000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'horrifying-interrupt-'));
  const moduleUrl = (name) => JSON.stringify(new URL(`../src/${name}.js`, import.meta.url).href);
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { main } from ${moduleUrl('cli')};
    import { runAlarm } from ${moduleUrl('alarm')};
    import { acquireLock } from ${moduleUrl('lock')};
    import { runCommand } from ${moduleUrl('command')};
    import { writeFile } from 'node:fs/promises';
    const root = ${JSON.stringify(root)};
    const state = { volume: 19, muted: true };
    process.exitCode = await main([], { alarm: ({ signal }) => runAlarm({
      signal, temporaryRoot: root, lock: () => acquireLock(root),
      backend: {
        async check() {},
        async snapshot() { return { ...state }; },
        async maximize() { state.volume = 100; state.muted = false; },
        async play(file, signal) {
          console.log('ready');
          await runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { signal });
        },
        async restore(saved) { await writeFile(root + '/restored.json', JSON.stringify(saved)); },
      },
    }) });
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill('SIGKILL'); await rm(root, { recursive: true, force: true }); });
  await once(child.stdout, 'data');
  const ended = once(child, 'close');
  child.kill(signal);
  const [code] = await ended;
  assert.equal(code, expectedCode);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'restored.json'), 'utf8')), { volume: 19, muted: true });
  assert.deepEqual(await readdir(root), ['restored.json']);
});
}
