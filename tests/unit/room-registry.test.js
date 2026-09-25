import { describe, expect, it } from 'vitest';
import { RoomRegistry } from '../../server/src/rooms/RoomRegistry.js';

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
});
