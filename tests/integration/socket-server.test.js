import { afterEach, describe, expect, it } from 'vitest';
import { io as createClient } from 'socket.io-client';
import { createAppServer } from '../../server/src/app.js';

const runningServers = [];

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map(({ io, server }) => new Promise((resolve) => {
    io.close();
    server.close(resolve);
  })));
});

function startIsolatedServer() {
  const instance = createAppServer();
  runningServers.push(instance);

  return new Promise((resolve) => {
    instance.server.listen(0, '127.0.0.1', () => {
      const { port } = instance.server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

describe('Socket.IO integration harness', () => {
  it('connects an isolated client and closes its resources', async () => {
    const url = await startIsolatedServer();
    const client = createClient(url, { transports: ['websocket'], forceNew: true });

    try {
      const ready = await new Promise((resolve, reject) => {
        client.once('server:ready', resolve);
        client.once('connect_error', reject);
      });
      expect(client.connected).toBe(true);
      expect(ready).toEqual({ v: 1 });
    } finally {
      client.close();
    }
  });
});
