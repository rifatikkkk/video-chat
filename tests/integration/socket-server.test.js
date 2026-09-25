import { afterEach, describe, expect, it } from 'vitest';
import { io as createClient } from 'socket.io-client';
import { createAppServer } from '../../server/src/app.js';
import { SlowConsumerGuard } from '../../server/src/socket/SlowConsumerGuard.js';

const runningServers = [];

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map(({ io, server }) => new Promise((resolve) => {
    io.close();
    server.close(resolve);
  })));
});

function startIsolatedServer(options) {
  const instance = createAppServer(options);
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

  it('joins once per socket, replays an ack by requestId, and cleans up on disconnect', async () => {
    const url = await startIsolatedServer();
    const client = createClient(url, { autoConnect: false, reconnection: false, transports: ['websocket'] });
    const requestId = crypto.randomUUID();

    try {
      const ready = new Promise((resolve, reject) => {
        client.once('server:ready', resolve);
        client.once('connect_error', reject);
      });
      client.connect();
      await ready;

      const first = await client.emitWithAck('room:create', { v: 1, requestId, displayName: 'Анна' });
      const replay = await client.emitWithAck('room:create', { v: 1, requestId, displayName: 'Другое имя' });
      const duplicate = await client.emitWithAck('room:create', { v: 1, requestId: crypto.randomUUID(), displayName: 'Анна' });

      expect(first).toMatchObject({ ok: true, requestId, data: { participants: [{ displayName: 'Анна' }] } });
      expect(replay).toEqual(first);
      expect(duplicate).toMatchObject({ ok: false, error: { code: 'ALREADY_JOINED' } });
      const { roomId } = first.data;
      client.close();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(runningServers[0].registry.getRoom(roomId)).toBeUndefined();
    } finally {
      client.close();
    }
  });

  it('rejects an incompatible protocol version before joining', async () => {
    const url = await startIsolatedServer();
    const client = createClient(url, { transports: ['websocket'], forceNew: true });
    try {
      await new Promise((resolve, reject) => {
        client.once('server:ready', resolve);
        client.once('connect_error', reject);
      });
      const response = await client.emitWithAck('room:create', { v: 2, requestId: crypto.randomUUID(), displayName: 'Анна' });
      expect(response).toMatchObject({ ok: false, error: { code: 'PROTOCOL_MISMATCH' } });
    } finally {
      client.close();
    }
  });

  it('broadcasts ordered room events only to members of the changed room', async () => {
    const url = await startIsolatedServer();
    const anna = createClient(url, { transports: ['websocket'], forceNew: true });
    const boris = createClient(url, { transports: ['websocket'], forceNew: true });
    const outsider = createClient(url, { transports: ['websocket'], forceNew: true });
    const waitReady = (client) => new Promise((resolve, reject) => {
      client.once('server:ready', resolve);
      client.once('connect_error', reject);
    });

    try {
      await Promise.all([waitReady(anna), waitReady(boris), waitReady(outsider)]);
      const annaEvents = [];
      const borisEvents = [];
      const outsiderEvents = [];
      anna.on('room:event', (event) => annaEvents.push(event));
      boris.on('room:event', (event) => borisEvents.push(event));
      outsider.on('room:event', (event) => outsiderEvents.push(event));

      const created = await anna.emitWithAck('room:create', { v: 1, requestId: crypto.randomUUID(), displayName: 'Анна' });
      await boris.emitWithAck('room:join', { v: 1, requestId: crypto.randomUUID(), roomId: created.data.roomId, displayName: 'Борис' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await boris.emitWithAck('room:leave', { v: 1, requestId: crypto.randomUUID(), roomEpoch: created.data.roomEpoch });
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(annaEvents.map((event) => event.kind)).toEqual(['participant-joined', 'participant-joined', 'participant-left']);
      expect(borisEvents.map((event) => event.kind)).toEqual(['participant-joined']);
      expect(annaEvents[2]).toMatchObject({ seq: 3, payload: { participantId: expect.any(String), entry: { type: 'leave' } } });
      expect(outsiderEvents).toEqual([]);
    } finally {
      anna.close();
      boris.close();
      outsider.close();
    }
  });

  it('accepts and broadcasts one server-authored chat entry despite an ack retry', async () => {
    const url = await startIsolatedServer();
    const anna = createClient(url, { transports: ['websocket'], forceNew: true });
    const boris = createClient(url, { transports: ['websocket'], forceNew: true });
    const waitReady = (client) => new Promise((resolve, reject) => {
      client.once('server:ready', resolve);
      client.once('connect_error', reject);
    });

    try {
      await Promise.all([waitReady(anna), waitReady(boris)]);
      const created = await anna.emitWithAck('room:create', { v: 1, requestId: crypto.randomUUID(), displayName: 'Анна' });
      await boris.emitWithAck('room:join', { v: 1, requestId: crypto.randomUUID(), roomId: created.data.roomId, displayName: 'Борис' });
      const messages = [];
      boris.on('room:event', (event) => {
        if (event.kind === 'chat-message') messages.push(event.payload.entry);
      });
      const requestId = crypto.randomUUID();
      const clientMessageId = crypto.randomUUID();
      const first = await anna.emitWithAck('chat:send', { v: 1, requestId, roomEpoch: created.data.roomEpoch, clientMessageId, text: '  Привет  ' });
      const replay = await anna.emitWithAck('chat:send', { v: 1, requestId, roomEpoch: created.data.roomEpoch, clientMessageId, text: '  Привет  ' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const conflict = await anna.emitWithAck('chat:send', { v: 1, requestId: crypto.randomUUID(), roomEpoch: created.data.roomEpoch, clientMessageId, text: 'Пока' });

      expect(first).toMatchObject({ ok: true, data: { duplicate: false, entry: { displayName: 'Анна', text: 'Привет' } } });
      expect(replay).toEqual(first);
      expect(messages).toHaveLength(1);
      expect(conflict).toMatchObject({ ok: false, error: { code: 'MESSAGE_ID_CONFLICT' } });
    } finally {
      anna.close();
      boris.close();
    }
  });

  it('returns history pages only to the active room member', async () => {
    const url = await startIsolatedServer();
    const anna = createClient(url, { transports: ['websocket'], forceNew: true });
    try {
      await new Promise((resolve, reject) => { anna.once('server:ready', resolve); anna.once('connect_error', reject); });
      const created = await anna.emitWithAck('room:create', { v: 1, requestId: crypto.randomUUID(), displayName: 'Анна' });
      await anna.emitWithAck('chat:send', { v: 1, requestId: crypto.randomUUID(), roomEpoch: created.data.roomEpoch, clientMessageId: crypto.randomUUID(), text: 'Первое' });
      const page = await anna.emitWithAck('history:get', { v: 1, requestId: crypto.randomUUID(), roomEpoch: created.data.roomEpoch, throughSeq: 2, afterSeq: 0, limit: 50 });

      expect(page).toMatchObject({ ok: true, data: { throughSeq: 2, done: true, entries: [{ type: 'join' }, { type: 'user', text: 'Первое' }] } });
    } finally {
      anna.close();
    }
  });

  it('disconnects an overloaded recipient while other members continue receiving events', async () => {
    let slowSocketId;
    const guard = new SlowConsumerGuard({
      maxPendingPackets: 1,
      getPendingPackets: (socket) => socket.id === slowSocketId ? 2 : 0,
    });
    const url = await startIsolatedServer({ slowConsumerGuard: guard });
    const anna = createClient(url, { transports: ['websocket'], forceNew: true });
    const slow = createClient(url, { transports: ['websocket'], forceNew: true });

    try {
      const waitReady = (client) => new Promise((resolve, reject) => { client.once('server:ready', resolve); client.once('connect_error', reject); });
      await Promise.all([waitReady(anna), waitReady(slow)]);
      const created = await anna.emitWithAck('room:create', { v: 1, requestId: crypto.randomUUID(), displayName: 'Анна' });
      slowSocketId = slow.id;
      const left = new Promise((resolve) => anna.on('room:event', (event) => {
        if (event.kind === 'participant-left') resolve(event);
      }));
      slow.emit('room:join', { v: 1, requestId: crypto.randomUUID(), roomId: created.data.roomId, displayName: 'Медленный' });
      const leftEvent = await left;
      const message = await anna.emitWithAck('chat:send', {
        v: 1,
        requestId: crypto.randomUUID(),
        roomEpoch: created.data.roomEpoch,
        clientMessageId: crypto.randomUUID(),
        text: 'Связь продолжается',
      });

      expect(leftEvent).toMatchObject({ payload: { entry: { type: 'leave' } } });
      expect(slow.connected).toBe(false);
      expect(message).toMatchObject({ ok: true, data: { entry: { text: 'Связь продолжается' } } });
    } finally {
      anna.close();
      slow.close();
    }
  });

  it('keeps room history, media, chat, and signaling isolated between rooms', async () => {
    const url = await startIsolatedServer();
    const anna = createClient(url, { transports: ['websocket'], forceNew: true });
    const boris = createClient(url, { transports: ['websocket'], forceNew: true });
    const vera = createClient(url, { transports: ['websocket'], forceNew: true });
    const guest = createClient(url, { transports: ['websocket'], forceNew: true });

    try {
      const waitReady = (client) => new Promise((resolve, reject) => { client.once('server:ready', resolve); client.once('connect_error', reject); });
      await Promise.all([waitReady(anna), waitReady(boris), waitReady(vera), waitReady(guest)]);
      const roomA = await anna.emitWithAck('room:create', { v: 1, requestId: crypto.randomUUID(), displayName: 'Анна' });
      const borisRoomA = await boris.emitWithAck('room:join', { v: 1, requestId: crypto.randomUUID(), roomId: roomA.data.roomId, displayName: 'Борис' });
      const roomB = await vera.emitWithAck('room:create', { v: 1, requestId: crypto.randomUUID(), displayName: 'Вера' });
      const publicJoin = await guest.emitWithAck('room:join', { v: 1, requestId: crypto.randomUUID(), roomId: roomA.data.roomId, displayName: 'Гость' });
      const veraEvents = [];
      const borisSignals = [];
      vera.on('room:event', (event) => veraEvents.push(event));
      vera.on('signal:description', (event) => veraEvents.push(event));
      boris.on('signal:description', (event) => borisSignals.push(event));

      const chat = await anna.emitWithAck('chat:send', {
        v: 1, requestId: crypto.randomUUID(), roomEpoch: roomA.data.roomEpoch, clientMessageId: crypto.randomUUID(), text: 'Только комната A', senderParticipantId: roomB.data.selfParticipantId,
      });
      const foreignHistory = await vera.emitWithAck('history:get', {
        v: 1, requestId: crypto.randomUUID(), roomEpoch: roomA.data.roomEpoch, throughSeq: 99, afterSeq: 0, limit: 50,
      });
      const foreignMedia = await vera.emitWithAck('media:update', {
        v: 1, requestId: crypto.randomUUID(), roomEpoch: roomA.data.roomEpoch, revision: 1, micEnabled: true, cameraEnabled: true,
      });
      const crossRoomSignal = await anna.emitWithAck('signal:description', {
        v: 1, requestId: crypto.randomUUID(), roomEpoch: roomA.data.roomEpoch, toParticipantId: roomB.data.selfParticipantId, description: { type: 'offer', sdp: 'valid' }, fromParticipantId: roomB.data.selfParticipantId,
      });
      const validSignal = await anna.emitWithAck('signal:description', {
        v: 1, requestId: crypto.randomUUID(), roomEpoch: roomA.data.roomEpoch, toParticipantId: borisRoomA.data.selfParticipantId, description: { type: 'offer', sdp: 'valid' }, fromParticipantId: roomB.data.selfParticipantId,
      });
      const invalidSdp = await anna.emitWithAck('signal:description', {
        v: 1, requestId: crypto.randomUUID(), roomEpoch: roomA.data.roomEpoch, toParticipantId: borisRoomA.data.selfParticipantId, description: { type: 'offer', sdp: 'ы'.repeat(64 * 1024) },
      });
      const invalidCandidate = await anna.emitWithAck('signal:candidate', {
        v: 1, requestId: crypto.randomUUID(), roomEpoch: roomA.data.roomEpoch, toParticipantId: borisRoomA.data.selfParticipantId, iceUfrag: 'x', candidate: { candidate: 'x'.repeat(5 * 1024) },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(chat).toMatchObject({ ok: true, data: { entry: { participantId: roomA.data.selfParticipantId } } });
      expect(publicJoin).toMatchObject({ ok: true, data: { roomId: roomA.data.roomId } });
      expect(foreignHistory).toMatchObject({ ok: false, error: { code: 'STALE_ROOM' } });
      expect(foreignMedia).toMatchObject({ ok: false, error: { code: 'STALE_ROOM' } });
      expect(crossRoomSignal).toMatchObject({ ok: false, error: { code: 'PEER_NOT_FOUND' } });
      expect(validSignal).toMatchObject({ ok: true, data: { delivered: true } });
      expect(borisSignals).toEqual([expect.objectContaining({ fromParticipantId: roomA.data.selfParticipantId })]);
      expect(invalidSdp).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
      expect(invalidCandidate).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
      expect(veraEvents).toEqual([]);
    } finally {
      anna.close();
      boris.close();
      vera.close();
      guest.close();
    }
  });
});
