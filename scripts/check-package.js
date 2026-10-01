import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "horrifying package 'spaces'-"));
// npm supplies the actual JS entrypoint on every platform, avoiding .cmd quoting.
assert.ok(process.env.npm_execpath, 'Run this check through npm run check:package');
const npm = (args) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
  cwd: root, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'],
});
try {
  const [pack] = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', temporary]));
  const files = pack.files.map((entry) => entry.path);
  for (const required of ['bin/horrifying-notifs.js', 'src/windows.ps1', 'skills/horrifying-notifs/SKILL.md', 'README.md', 'LICENSE']) {
    assert.ok(files.includes(required), `Tarball missing ${required}`);
  }
  assert.ok(files.every((file) => /^(bin\/|src\/|skills\/|package\.json$|README\.md$|LICENSE$)/.test(file)), 'Tarball contains development files');
  const prefix = join(temporary, 'install');
  npm(['install', '--global', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', join(temporary, pack.filename)]);
  const packageRoot = join(prefix, process.platform === 'win32' ? 'node_modules' : 'lib/node_modules', 'horrifying-notifs');
  const executable = process.platform === 'win32' ? join(packageRoot, 'bin/horrifying-notifs.js') : join(prefix, 'bin/horrifying-notifs');
  await access(join(prefix, process.platform === 'win32' ? 'horrifying-notifs.cmd' : 'bin/horrifying-notifs'));
  const run = (...args) => execFileSync(process.execPath, [executable, ...args], { encoding: 'utf8', timeout: 10000 });
  assert.match(run('--help'), /100%/);
  assert.equal(run('--version').trim(), '0.1.0');
  const skill = await readFile(join(packageRoot, 'skills/horrifying-notifs/SKILL.md'), 'utf8');
  assert.ok(skill.length > 0);
  console.log(`Package verified: ${pack.files.length} files, ${pack.size} bytes packed; installed CLI and skill present.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
