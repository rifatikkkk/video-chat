import { describe, expect, it } from 'vitest';
import { RoomSession, SESSION_STATES } from '../../client/src/session/RoomSession.js';

function createFakeClient() {
  const listeners = new Map();
  const client = {
    socket: { connected: true },
    connect: async () => { client.connectCalls += 1; },
    request: async (event, payload) => {
      client.requests.push({ event, payload });
      if (event === 'room:create') return { ok: true, data: { roomId: 'room', roomEpoch: 'epoch', selfParticipantId: 'self', participants: [{ participantId: 'self' }], snapshotSeq: 0 } };
      return { ok: true, data: { left: true } };
    },
    disconnect: () => { client.disconnectCalls += 1; },
    on: (event, listener) => { listeners.set(event, listener); return () => listeners.delete(event); },
    trigger: (event) => listeners.get(event)?.(),
    listeners,
    connectCalls: 0,
    disconnectCalls: 0,
    requests: [],
  };
  return client;
}

function createPage() {
  const listeners = new Map();
  return {
    addEventListener: (event, listener) => listeners.set(event, listener),
    removeEventListener: (event, listener) => { if (listeners.get(event) === listener) listeners.delete(event); },
    trigger: (event, payload = {}) => listeners.get(event)?.(payload),
    listeners,
  };
}

describe('RoomSession', () => {
  it('owns one socket and follows the explicit join state machine', async () => {
    const client = createFakeClient();
    const page = createPage();
    const session = new RoomSession({ signalingClient: client, page });
    const states = [];
    session.onStateChange((state) => states.push(state));

    const snapshot = await session.join({ displayName: 'Анна' });

    expect(snapshot).toEqual({ roomId: 'room', roomEpoch: 'epoch', selfParticipantId: 'self', participants: [{ participantId: 'self' }], snapshotSeq: 0 });
    expect(states).toEqual([SESSION_STATES.CONNECTING, SESSION_STATES.JOINING, SESSION_STATES.ACTIVE]);
    expect(client.connectCalls).toBe(1);
    expect(client.requests).toEqual([{ event: 'room:create', payload: { displayName: 'Анна' } }]);
    await expect(session.join({ displayName: 'Анна' })).rejects.toThrow(/only once/);
  });

  it('cleans media, peers, subscriptions, and socket once even when dispose is called twice', async () => {
    const client = createFakeClient();
    const page = createPage();
    const media = { disposeCalls: 0, dispose() { this.disposeCalls += 1; } };
    const peers = { disposeCalls: 0, dispose() { this.disposeCalls += 1; } };
    const session = new RoomSession({ signalingClient: client, mediaController: media, peerManager: peers, page });
    await session.join({ displayName: 'Анна' });

    await Promise.all([session.dispose(), session.dispose()]);

    expect(media.disposeCalls).toBe(1);
    expect(peers.disposeCalls).toBe(1);
    expect(client.requests.at(-1)).toEqual({ event: 'room:leave', payload: { roomEpoch: 'epoch' } });
    expect(client.disconnectCalls).toBe(1);
    expect(page.listeners.size).toBe(0);
    expect(client.listeners.size).toBe(0);
    expect(session.state).toBe(SESSION_STATES.ENDED);
  });

  it('does not recover a disconnected or bfcache-restored session automatically', async () => {
    const client = createFakeClient();
    const page = createPage();
    const session = new RoomSession({ signalingClient: client, page });
    await session.join({ displayName: 'Анна' });
    client.trigger('disconnect');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(client.connectCalls).toBe(1);
    expect(session.state).toBe(SESSION_STATES.ENDED);
    expect(client.requests.filter(({ event }) => event === 'room:leave')).toHaveLength(0);
    page.trigger('pageshow', { persisted: true });
    expect(client.connectCalls).toBe(1);
  });

  it('cleans media and peers on socket disconnect without sending leave', async () => {
    const client = createFakeClient();
    const page = createPage();
    const media = { disposeCalls: 0, dispose() { this.disposeCalls += 1; } };
    const peers = { disposeCalls: 0, dispose() { this.disposeCalls += 1; } };
    const session = new RoomSession({ signalingClient: client, mediaController: media, peerManager: peers, page });
    await session.join({ displayName: 'Анна' });

    client.trigger('disconnect');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await session.dispose();

    expect(media.disposeCalls).toBe(1);
    expect(peers.disposeCalls).toBe(1);
    expect(client.requests.filter(({ event }) => event === 'room:leave')).toHaveLength(0);
    expect(client.disconnectCalls).toBe(1);
  });

  it('handles server maintenance closing as a terminal manual-retry session', async () => {
    const client = createFakeClient();
    const page = createPage();
    const media = { disposeCalls: 0, dispose() { this.disposeCalls += 1; } };
    const peers = { disposeCalls: 0, dispose() { this.disposeCalls += 1; } };
    const closingEvents = [];
    const session = new RoomSession({
      signalingClient: client,
      mediaController: media,
      peerManager: peers,
      page,
      onServerClosing: (event) => closingEvents.push(event),
    });
    await session.join({ displayName: 'Анна' });

    client.listeners.get('server:closing')?.({ v: 1, reason: 'maintenance' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(closingEvents).toEqual([{ v: 1, reason: 'maintenance' }]);
    expect(media.disposeCalls).toBe(1);
    expect(peers.disposeCalls).toBe(1);
    expect(client.requests.filter(({ event }) => event === 'room:leave')).toHaveLength(0);
    expect(session.state).toBe(SESSION_STATES.ENDED);
  });

  it('cleans media and peers on pagehide and does not reuse them after cleanup', async () => {
    const client = createFakeClient();
    const page = createPage();
    const media = { disposeCalls: 0, dispose() { this.disposeCalls += 1; } };
    const peers = { disposeCalls: 0, dispose() { this.disposeCalls += 1; } };
    const session = new RoomSession({ signalingClient: client, mediaController: media, peerManager: peers, page });
    await session.join({ displayName: 'Анна' });

    page.trigger('pagehide');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await session.dispose();

    expect(media.disposeCalls).toBe(1);
    expect(peers.disposeCalls).toBe(1);
    expect(client.requests.at(-1)).toEqual({ event: 'room:leave', payload: { roomEpoch: 'epoch' } });
    expect(session.snapshot).toBeNull();
    await expect(session.join({ displayName: 'Анна' })).rejects.toThrow(/only once/);
  });

  it('syncs peer lifecycle from snapshot, room events, and signals', async () => {
    const client = createFakeClient();
    const page = createPage();
    const calls = [];
    const peerManager = {
      applySnapshot: (snapshot) => calls.push(['snapshot', snapshot.roomEpoch]),
      handleRoomEvent: (event) => calls.push(['room', event.kind]),
      handleSignal: (event) => calls.push(['signal', event.fromParticipantId]),
      dispose: () => calls.push(['dispose']),
    };
    const session = new RoomSession({ signalingClient: client, peerManager, page });

    await session.join({ displayName: 'Анна' });
    client.listeners.get('room:event')?.({ roomEpoch: 'epoch', seq: 1, kind: 'participant-joined', payload: { participant: { participantId: 'remote' } } });
    client.listeners.get('signal:description')?.({ roomEpoch: 'epoch', fromParticipantId: 'remote', description: { type: 'offer', sdp: 'sdp' } });
    await session.dispose();

    expect(calls).toEqual([
      ['snapshot', 'epoch'],
      ['room', 'participant-joined'],
      ['signal', 'remote'],
      ['dispose'],
    ]);
  });
});
