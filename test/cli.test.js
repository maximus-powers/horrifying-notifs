import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { main } from '../src/cli.js';

function harness(alarm = async () => { throw new Error('unexpected alarm'); }) {
  const output = [];
  const errors = [];
  const signals = new EventEmitter();
  return { output, errors, signals, options: { alarm, signals, stdout: (text) => output.push(text), stderr: (text) => errors.push(text) } };
}

test('help and version never invoke audio, and describe the actual behavior', async () => {
  const h = harness();
  assert.equal(await main(['--help'], h.options), 0);
  assert.match(h.output[0], /3 seconds/);
  assert.match(h.output[0], /100%/);
  assert.equal(await main(['--version'], h.options), 0);
  assert.equal(h.output[1], '0.1.0');
  assert.equal(h.signals.listenerCount('SIGINT'), 0);
});

test('unexpected arguments fail without audio', async () => {
  for (const args of [['oops'], ['--duration', '10'], ['--help', 'oops']]) {
    const h = harness();
    assert.equal(await main(args, h.options), 2);
    assert.match(h.errors.join('\n'), /usage/i);
  }
});

test('success, existing alarms, and degraded playback have distinct results', async () => {
  for (const [result, code, message] of [
    [{ alreadyActive: false, errors: [] }, 0, /played/i],
    [{ alreadyActive: true, errors: [] }, 0, /already active/i],
    [{ alreadyActive: false, errors: ['volume unavailable'] }, 1, /volume unavailable/],
  ]) {
    const h = harness(async () => result);
    assert.equal(await main([], h.options), code);
    assert.match([...h.output, ...h.errors].join('\n'), message);
    assert.equal(h.signals.listenerCount('SIGTERM'), 0);
  }
});

test('catchable signals cancel the alarm and return conventional exit codes after cleanup', async () => {
  const cases = [['SIGHUP', 129], ['SIGINT', 130], ['SIGTERM', 143]];
  if (process.platform === 'win32') cases.push(['SIGBREAK', 149]);
  for (const [name, code] of cases) {
    let cleanup = false;
    const h = harness(async ({ signal }) => {
      h.signals.emit(name);
      assert.equal(signal.aborted, true);
      cleanup = true;
      return { alreadyActive: false, errors: ['Interrupted'] };
    });
    assert.equal(await main([], h.options), code);
    assert.equal(cleanup, true);
    assert.equal(h.signals.listenerCount(name), 0);
  }
});

test('unexpected failures produce a short nonzero result instead of a stack trace', async () => {
  const h = harness(async () => { throw new Error('permission denied'); });
  assert.equal(await main([], h.options), 1);
  assert.match(h.errors[0], /permission denied/);
  assert.equal(h.signals.listenerCount('SIGINT'), 0);
});
