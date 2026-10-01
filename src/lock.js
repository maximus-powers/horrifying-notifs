import { createHash } from 'node:crypto';
import { createConnection, createServer } from 'node:net';
import { userInfo } from 'node:os';

// An OS-owned, short-lived loopback listener avoids stale PID files after a
// crash. Its identity distinguishes an alarm from an unrelated port occupant.
export async function acquireLock(key = userInfo().username) {
  const identity = createHash('sha256').update(key).digest('hex');
  const port = 49152 + parseInt(identity.slice(0, 4), 16) % 16384;
  const token = `horrifying-notifs:${identity}\n`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const server = createServer((socket) => {
      socket.on('error', () => {});
      socket.end(token);
      socket.destroySoon();
    });
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
      });
      return () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
    try {
      const owner = await new Promise((resolve, reject) => {
        const socket = createConnection({ host: '127.0.0.1', port });
        let data = '';
        socket.setTimeout(1000, () => socket.destroy(new Error('Alarm lock check timed out')));
        socket.on('data', (chunk) => {
          data += chunk;
          if (data.length > 256) socket.destroy(new Error('Unexpected alarm lock response'));
        });
        socket.once('end', () => { socket.destroy(); resolve(data); });
        socket.once('error', reject);
      });
      if (owner === token) return null;
      throw new Error(`Alarm coordination port ${port} is occupied by another application`);
    } catch (error) {
      // The owner can finish between our failed bind and the identity check.
      if (!['ECONNREFUSED', 'ECONNRESET'].includes(error.code)) throw error;
    }
  }
  throw new Error('Could not acquire the alarm lock; another invocation is starting');
}
