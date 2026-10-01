import { readFileSync } from 'node:fs';
import { runAlarm } from './alarm.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const help = `Usage: horrifying-notifs [--help | --version]

Play a harsh alarm for 3 seconds on the selected audio output.
Temporarily unmute and set system volume to 100%, then restore it.

Run before requesting an answer or approval from an AFK user.
Linux requires paplay and pactl (PulseAudio 15+ or pipewire-pulse).

Exit codes: 0 success/already active, 1 operational failure, 2 invalid usage.
`;

export async function main(args, { alarm = runAlarm, stdout = console.log, stderr = console.error, signals = process } = {}) {
  if (args.length === 1 && args[0] === '--help') { stdout(help); return 0; }
  if (args.length === 1 && args[0] === '--version') { stdout(version); return 0; }
  if (args.length) { stderr('Usage: horrifying-notifs [--help | --version]'); return 2; }

  const controller = new AbortController();
  let interrupted;
  const interrupt = (code) => {
    interrupted ??= code;
    controller.abort(new Error('Interrupted'));
  };
  const exitCodes = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };
  if (process.platform === 'win32') exitCodes.SIGBREAK = 149;
  const handlers = Object.entries(exitCodes).map(([name, code]) => [name, () => interrupt(code)]);
  for (const [name, handler] of handlers) signals.on(name, handler);
  try {
    const result = await alarm({ signal: controller.signal });
    if (result.errors.length) {
      stderr(`horrifying-notifs: ${result.errors.join('; ')}`);
      return interrupted ?? 1;
    }
    if (interrupted) return interrupted;
    stdout(result.alreadyActive ? 'Alarm already active.' : 'Alarm played; volume restored.');
    return 0;
  } catch (error) {
    stderr(`horrifying-notifs: ${error.message}`);
    return interrupted ?? 1;
  } finally {
    for (const [name, handler] of handlers) signals.off(name, handler);
  }
}
