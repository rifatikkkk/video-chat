import { describe, expect, it } from 'vitest';
import { RegistryError, RoomRegistry } from '../../server/src/rooms/RoomRegistry.js';

describe('RoomRegistry model', () => {
  it('creates RAM-only rooms with independent epochs and sequences', () => {
    const registry = new RoomRegistry();
    const first = registry.createRoom('room_A');
    const second = registry.createRoom('room_B');

    expect(first.epoch).not.toBe(second.epoch);
    expect(first.participants).toBeInstanceOf(Map);
    expect(first.history).toEqual([]);
    const entry = registry.createChatEntry({ room: first, type: 'join', participantId: 'p1', displayName: 'Анна' });
    expect(entry).toMatchObject({ id: `${first.epoch}:1`, seq: 1, type: 'join' });
  });

  it('generates a fresh 128-bit base64url room ID after a collision', () => {
    const ids = ['existing_room', 'new_room'];
    const registry = new RoomRegistry({ roomIdGenerator: () => ids.shift() });
    registry.createRoom('existing_room');

    expect(registry.generateUniqueRoomId()).toBe('new_room');
  });

  it('assigns distinct internal IDs to participants with the same name', () => {
    const registry = new RoomRegistry();
    const first = registry.createParticipant({ socketId: 'socket-1', displayName: 'Алекс' });
    const second = registry.createParticipant({ socketId: 'socket-2', displayName: 'Алекс' });

    expect(first.displayName).toBe(second.displayName);
    expect(first.participantId).not.toBe(second.participantId);
    expect(first).toMatchObject({ micEnabled: false, cameraEnabled: false, mediaRevision: 0 });
  });

  it('creates a room and returns an atomic join snapshot', () => {
    const registry = new RoomRegistry();
    const result = registry.createAndJoin({ socketId: 'socket-1', displayName: ' Анна ' });

    expect(result.snapshot).toMatchObject({ roomId: result.room.roomId, roomEpoch: result.room.epoch, snapshotSeq: 1, historyThroughSeq: 1 });
    expect(result.snapshot.participants).toHaveLength(1);
    expect(registry.getMembership('socket-1')).toMatchObject({ roomId: result.room.roomId, participantId: result.participant.participantId });
    expect(result.room.history).toEqual([result.entry]);
  });

  it('creates an unknown valid room ID and atomically limits it to four people', async () => {
    const registry = new RoomRegistry();
    const roomId = 'known_room';
    await Promise.all([...Array(3)].map((_, index) => Promise.resolve(registry.join({ roomId, socketId: `seed-${index}`, displayName: `User ${index}` }))));
    const attempts = await Promise.allSettled([...Array(20)].map((_, index) => Promise.resolve().then(() => registry.join({ roomId, socketId: `race-${index}`, displayName: `Race ${index}` }))));

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(registry.getRoom(roomId).participants.size).toBe(4);
    expect(attempts.filter((attempt) => attempt.status === 'rejected').every((attempt) => attempt.reason instanceof RegistryError && attempt.reason.code === 'ROOM_FULL')).toBe(true);
  });

  it('rejects a second room membership for one socket', () => {
    const registry = new RoomRegistry();
    registry.join({ roomId: 'room_one', socketId: 'same-socket', displayName: 'Анна' });

    expect(() => registry.join({ roomId: 'room_two', socketId: 'same-socket', displayName: 'Анна' })).toThrow(/already belongs/);
  });

  it('makes leave idempotent and produces exactly one leave entry', () => {
    const registry = new RoomRegistry();
    const joined = registry.join({ roomId: 'room_leave', socketId: 'socket-1', displayName: 'Анна' });

    const first = registry.leave({ socketId: 'socket-1', roomEpoch: joined.room.epoch });
    const second = registry.leave({ socketId: 'socket-1', roomEpoch: joined.room.epoch });

    expect(first).toMatchObject({ left: true, entry: { type: 'leave', participantId: joined.participant.participantId } });
    expect(second).toEqual({ left: false, entry: null });
    expect(joined.room.history.filter((entry) => entry.type === 'leave')).toHaveLength(1);
  });

  it('cleans every index after the last participant leaves and recreates a new epoch', () => {
    const registry = new RoomRegistry();
    const first = registry.join({ roomId: 'same_room', socketId: 'socket-1', displayName: 'Анна' });
    registry.leave({ socketId: 'socket-1', roomEpoch: first.room.epoch });

    expect(registry.getRoom('same_room')).toBeUndefined();
    expect(registry.getMembership('socket-1')).toBeUndefined();
    const second = registry.join({ roomId: 'same_room', socketId: 'socket-2', displayName: 'Борис' });
    expect(second.room.epoch).not.toBe(first.room.epoch);
    expect(second.room.history).toHaveLength(1);
  });

  it('does not remove an active session when a stale epoch is supplied', () => {
    const registry = new RoomRegistry();
    const joined = registry.join({ roomId: 'stale_room', socketId: 'socket-1', displayName: 'Анна' });

    expect(() => registry.leave({ socketId: 'socket-1', roomEpoch: crypto.randomUUID() })).toThrow(/epoch/);
    expect(registry.getMembership('socket-1')).toMatchObject({ epoch: joined.room.epoch });
  });

  it('deduplicates accepted chat messages by participant and client message ID', () => {
    const registry = new RoomRegistry();
    const joined = registry.join({ roomId: 'chat_room', socketId: 'socket-1', displayName: 'Анна' });
    const clientMessageId = crypto.randomUUID();

    const first = registry.appendMessage({ socketId: 'socket-1', roomEpoch: joined.room.epoch, clientMessageId, text: '  <b>Привет</b>  ' });
    const replay = registry.appendMessage({ socketId: 'socket-1', roomEpoch: joined.room.epoch, clientMessageId, text: '<b>Привет</b>' });

    expect(first).toMatchObject({ duplicate: false, entry: { type: 'user', displayName: 'Анна', text: '<b>Привет</b>' } });
    expect(replay).toMatchObject({ duplicate: true, entry: first.entry });
    expect(joined.room.history.filter((entry) => entry.type === 'user')).toHaveLength(1);
    expect(() => registry.appendMessage({ socketId: 'socket-1', roomEpoch: joined.room.epoch, clientMessageId, text: 'Другой текст' })).toThrow(/different text/);
  });

  it('pages only the history fixed by throughSeq across sequence gaps', () => {
    const registry = new RoomRegistry();
    const joined = registry.join({ roomId: 'history_room', socketId: 'socket-1', displayName: 'Анна' });
    const first = registry.appendMessage({ socketId: 'socket-1', roomEpoch: joined.room.epoch, clientMessageId: crypto.randomUUID(), text: 'Первое' });
    joined.room.nextSeq += 2;
    const second = registry.appendMessage({ socketId: 'socket-1', roomEpoch: joined.room.epoch, clientMessageId: crypto.randomUUID(), text: 'Второе' });
    const page = registry.getHistory({ socketId: 'socket-1', roomEpoch: joined.room.epoch, throughSeq: second.entry.seq, afterSeq: 0, limit: 2 });
    const finalPage = registry.getHistory({ socketId: 'socket-1', roomEpoch: joined.room.epoch, throughSeq: first.entry.seq, afterSeq: first.entry.seq, limit: 50 });

    expect(page.entries.map((entry) => entry.seq)).toEqual([1, first.entry.seq]);
    expect(page).toMatchObject({ done: false, nextAfterSeq: first.entry.seq });
    expect(finalPage).toMatchObject({ entries: [], done: true, nextAfterSeq: null });
  });

  it('only accepts strictly increasing media revisions for its own participant', () => {
    const registry = new RoomRegistry();
    const joined = registry.join({ roomId: 'media_room', socketId: 'socket-1', displayName: 'Анна' });
    expect(registry.updateMedia({ socketId: 'socket-1', roomEpoch: joined.room.epoch, revision: 1, micEnabled: true, cameraEnabled: false })).toMatchObject({ changed: true });
    expect(registry.updateMedia({ socketId: 'socket-1', roomEpoch: joined.room.epoch, revision: 1, micEnabled: false, cameraEnabled: true })).toMatchObject({ changed: false });
    expect(joined.participant).toMatchObject({ micEnabled: true, cameraEnabled: false, mediaRevision: 1 });
  });

  it('rejects new messages at the history budget without deleting accepted history', () => {
    const registry = new RoomRegistry({ historyBudgetBytes: 500, lifecycleReserveBytes: 300 });
    const joined = registry.join({ roomId: 'budget_room', socketId: 'socket-1', displayName: 'Анна' });
    expect(() => registry.appendMessage({ socketId: 'socket-1', roomEpoch: joined.room.epoch, clientMessageId: crypto.randomUUID(), text: 'сообщение'.repeat(30) })).toThrow(/cannot accept/);
    expect(joined.room.history).toHaveLength(1);
  });
});
