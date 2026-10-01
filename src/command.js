import { spawn } from 'node:child_process';

// Resolve only after exit: restoration must not race a still-playing child.
export async function runCommand(file, args, { signal, timeoutMs = 10000, env } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env ? { ...process.env, ...env } : process.env,
    });
    let stdout = '';
    let stderr = '';
    let failure;
    let forceKill;
    const stop = (reason) => {
      if (failure) return;
      failure = reason;
      child.kill();
      forceKill = setTimeout(() => child.kill('SIGKILL'), 500);
    };
    const abort = () => stop(signal.reason ?? new Error('Interrupted'));
    const timer = setTimeout(() => stop(new Error(`${file} timed out`)), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    // An abort may have arrived between the initial check and spawn.
    if (signal?.aborted) abort();
    child.stdout.on('data', (data) => {
      stdout += data;
      if (stdout.length > 1024 * 1024) stop(new Error(`${file} produced too much output`));
    });
    child.stderr.on('data', (data) => {
      stderr += data;
      if (stderr.length > 65536) stop(new Error(`${file} produced too much output`));
    });
    child.on('error', (error) => {
      failure ??= error.code === 'ENOENT' ? new Error(`${file} not found; install the required audio utilities`) : error;
    });
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer);
      clearTimeout(forceKill);
      signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`${file}: ${stderr.trim() || `exited ${code ?? exitSignal}`}`));
      else resolve(stdout.trim());
    });
  });
}
