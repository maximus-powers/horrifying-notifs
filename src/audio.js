// Small, reproducible PCM asset. No downloads, codecs, or binary dependencies.
export function makeAlarmWav() {
  const rate = 44100;
  const samples = new Float64Array(rate * 3);
  const tau = 2 * Math.PI;
  let phase = 0;
  let random = 0xdeadbeef;
  let peak = 0;

  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const sweep = 1 - Math.abs(2 * ((t * 2.5) % 1) - 1);
    phase += tau * (650 + 1050 * sweep) / rate;
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const noise = (random / 0x80000000 - 1) * ((t * 14) % 1 < 0.3 ? 1 : 0);
    const siren = Math.sin(phase) + 0.3 * Math.sin(phase * 3);
    const buzzer = Math.sign(Math.sin(tau * (t < 1.5 ? 217 : 293) * t));
    const fade = Math.min(1, i / 176, (samples.length - 1 - i) / 176);
    samples[i] = (0.65 * siren + 0.25 * buzzer + 0.2 * noise) * fade;
    peak = Math.max(peak, Math.abs(samples[i]));
  }

  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    wav.writeInt16LE(Math.round(samples[i] / peak * 32112), 44 + i * 2);
  }
  return wav;
}
