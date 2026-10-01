import assert from 'node:assert/strict';
import test from 'node:test';
import { makeAlarmWav } from '../src/audio.js';

test('generates exactly three seconds of portable mono PCM with a strong, bounded signal', () => {
  const wav = makeAlarmWav();
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.toString('ascii', 12, 16), 'fmt ');
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.equal(wav.readUInt32LE(28), 88200);
  assert.equal(wav.readUInt16LE(32), 2);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), 264600);
  assert.equal(wav.length, 264644);
  let peak = 0;
  let energy = 0;
  for (let offset = 44; offset < wav.length; offset += 2) {
    const sample = wav.readInt16LE(offset) / 32768;
    peak = Math.max(peak, Math.abs(sample));
    energy += sample * sample;
  }
  assert.ok(peak > 0.95 && peak < 1);
  assert.ok(Math.sqrt(energy / 132300) > 0.25, 'alarm must not be mostly silence');
  assert.deepEqual(makeAlarmWav(), wav, 'alarm is reproducible without network assets');
});
