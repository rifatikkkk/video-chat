import { describe, expect, it } from 'vitest';
import { SignalingClient, SignalingClientError } from '../../client/src/socket/SignalingClient.js';

class FakeSocket {
  constructor() {
    this.connected = false;
    this.listeners = new Map();
    this.options = null;
  }

  on(event, listener) { this.listeners.set(event, listener); }
  once(event, listener) { this.listeners.set(event, listener); }
  off(event, listener) { if (this.listeners.get(event) === listener) this.listeners.delete(event); }
  connect() { this.connectCalls = (this.connectCalls ?? 0) + 1; }
  disconnect() { this.connected = false; this.disconnectCalls = (this.disconnectCalls ?? 0) + 1; }
  emit(event, payload, acknowledge) { this.emitted = { event, payload, acknowledge }; }
  trigger(event, value) { this.listeners.get(event)?.(value); }
}

function createClient() {
  const socket = new FakeSocket();
  const client = new SignalingClient({
    url: 'http://example.test',
    socketFactory: (_url, options) => { socket.options = options; return socket; },
    requestIdGenerator: () => '00000000-0000-4000-8000-000000000001',
  });
  return { client, socket };
}

describe('SignalingClient', () => {
  it('disables automatic connection and reconnect attempts while allowing listeners before connect', async () => {
    const { client, socket } = createClient();
    const listener = () => {};
    const unsubscribe = client.on('room:event', listener);
    const connecting = client.connect();
    socket.connected = true;
    socket.trigger('connect');
    await connecting;

    expect(socket.options).toEqual({ autoConnect: false, reconnection: false });
    expect(socket.connectCalls).toBe(1);
    expect(socket.listeners.get('room:event')).toBe(listener);
    unsubscribe();
    expect(socket.listeners.has('room:event')).toBe(false);
  });

  it('rejects requests before an explicit connection and sends a versioned request after it', async () => {
    const { client, socket } = createClient();
    await expect(client.request('room:create')).rejects.toMatchObject({ code: 'NOT_CONNECTED' });

    socket.connected = true;
    const pending = client.request('room:create', { displayName: 'Анна' });
    socket.emitted.acknowledge({ ok: true, requestId: socket.emitted.payload.requestId, data: {} });

    await expect(pending).resolves.toMatchObject({ ok: true });
    expect(socket.emitted).toMatchObject({
      event: 'room:create',
      payload: { v: 1, requestId: '00000000-0000-4000-8000-000000000001', displayName: 'Анна' },
    });
  });

  it('uses a controlled error type for an offline request', async () => {
    const { client } = createClient();
    await expect(client.request('chat:send')).rejects.toBeInstanceOf(SignalingClientError);
  });
});
