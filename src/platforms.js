import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { win32 } from 'node:path';
import { runCommand } from './command.js';

export function createBackend(platform = process.platform, { run = runCommand } = {}) {
  if (platform === 'darwin') {
    const script = (text, signal) => run('/usr/bin/osascript', ['-e', text], { signal });
    return {
      check: () => access('/usr/bin/afplay', constants.X_OK),
      async snapshot(signal) {
        const value = await script('set v to get volume settings\nreturn ((output volume of v) as text) & "," & ((output muted of v) as text)', signal);
        const match = /^(\d{1,3}),(true|false)$/.exec(value);
        if (!match || Number(match[1]) > 100) throw new Error('Invalid macOS volume settings');
        return { volume: Number(match[1]), muted: match[2] === 'true' };
      },
      maximize: (state, signal) => script('set volume output volume 100 output muted false', signal),
      play: (file, signal) => run('/usr/bin/afplay', ['-v', '1', file], { signal }),
      restore: (state) => script(`set volume output volume ${state.volume} output muted ${state.muted}`),
    };
  }

  if (platform === 'linux') {
    let device;
    const pactl = (args, signal) => run('pactl', args, { signal, env: { LC_ALL: 'C' } });
    return {
      check: (file, signal) => run('paplay', ['--version'], { signal }),
      async snapshot(signal) {
        device = await pactl(['get-default-sink'], signal);
        const sinks = JSON.parse(await pactl(['--format=json', 'list', 'sinks'], signal));
        const sink = sinks.find((entry) => entry.name === device);
        const volumes = Object.values(sink?.volume ?? {}).map((channel) => channel.value);
        if (!sink || typeof sink.mute !== 'boolean' || !volumes.length ||
          !volumes.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff)) {
          throw new Error('Could not read the default audio sink; requires PulseAudio 15+ or pipewire-pulse');
        }
        return { device, volumes, muted: sink.mute };
      },
      async maximize(state, signal) {
        await pactl(['set-sink-volume', state.device, '100%'], signal);
        await pactl(['set-sink-mute', state.device, '0'], signal);
      },
      play: (file, signal) => run('paplay', [...(device ? [`--device=${device}`] : []), '--volume=65536', file], { signal }),
      async restore(state) {
        const errors = [];
        for (const args of [
          ['set-sink-volume', state.device, ...state.volumes.map(String)],
          ['set-sink-mute', state.device, state.muted ? '1' : '0'],
        ]) {
          try { await pactl(args); }
          catch (error) { errors.push(error.message); }
        }
        if (errors.length) throw new Error(errors.join('; '));
      },
    };
  }

  if (platform === 'win32') {
    const powershell = win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const helper = async (action, { state, file, signal } = {}) => {
      const script = await readFile(new URL('./windows.ps1', import.meta.url), 'utf8');
      return run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
        signal,
        env: {
          HORRIFYING_NOTIFS_ACTION: action,
          HORRIFYING_NOTIFS_WAV: file ?? '',
          HORRIFYING_NOTIFS_STATE: state === undefined ? '' : JSON.stringify(state),
        },
      });
    };
    return {
      check: (file, signal) => helper('check', { file, signal }),
      async snapshot(signal) {
        const state = JSON.parse(await helper('snapshot', { signal }));
        if (typeof state.Device !== 'string' || !state.Device || typeof state.Muted !== 'boolean' ||
          !Number.isFinite(state.Volume) || state.Volume < 0 || state.Volume > 1) {
          throw new Error('Invalid Windows volume settings');
        }
        return state;
      },
      maximize: (state, signal) => helper('maximize', { state, signal }),
      play: (file, signal) => helper('play', { file, signal }),
      restore: (state) => helper('restore', { state }),
    };
  }
  throw new Error(`Unsupported operating system: ${platform}. Use macOS, Linux, or Windows.`);
}
