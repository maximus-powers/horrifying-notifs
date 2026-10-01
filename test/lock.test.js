import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { acquireLock } from '../src/lock.js';

test('concurrent callers have exactly one owner across repeated acquisitions', async () => {
  const key = randomUUID();
  for (let i = 0; i < 30; i++) {
    const owners = (await Promise.all(Array.from({ length: 12 }, () => acquireLock(key)))).filter(Boolean);
    assert.equal(owners.length, 1);
    await owners[0]();
  }
});

test('a hard-killed owner cannot leave a stale lock', async (t) => {
  const key = randomUUID();
  const url = new URL('../src/lock.js', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { acquireLock } from ${JSON.stringify(url)};
    await acquireLock(${JSON.stringify(key)});
    console.log('ready');
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  await once(child.stdout, 'data');
  assert.equal(await acquireLock(key), null);
  const exited = once(child, 'close');
  child.kill('SIGKILL');
  await exited;
  const release = await acquireLock(key);
  assert.equal(typeof release, 'function');
  await release();
});
