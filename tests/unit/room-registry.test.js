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
});
