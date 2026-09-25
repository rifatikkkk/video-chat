import { randomBytes, randomUUID } from 'node:crypto';
import { ERROR_CODES, validateChatMessage, validateDisplayName, validateRoomId } from '@video-chat/shared';

const ROOM_ID_BYTES = 16;
const MAX_PARTICIPANTS = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RegistryError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function generateRoomId() {
  return randomBytes(ROOM_ID_BYTES).toString('base64url');
}

export function toPublicParticipant({ socketId: _socketId, joinedAt: _joinedAt, ...participant }) {
  return participant;
}

export class RoomRegistry {
  constructor({ roomIdGenerator = generateRoomId, uuidGenerator = randomUUID } = {}) {
    this.rooms = new Map();
    this.socketIndex = new Map();
    this.roomIdGenerator = roomIdGenerator;
    this.uuidGenerator = uuidGenerator;
  }

  generateUniqueRoomId() {
    let roomId;
    do {
      roomId = this.roomIdGenerator();
    } while (this.rooms.has(roomId));
    return roomId;
  }

  createRoom(roomId = this.generateUniqueRoomId()) {
    if (this.rooms.has(roomId)) throw new Error(`Room already exists: ${roomId}`);
    const room = {
      roomId,
      epoch: this.uuidGenerator(),
      createdAt: Date.now(),
      nextSeq: 1,
      participants: new Map(),
      history: [],
      messageIndex: new Map(),
    };
    this.rooms.set(roomId, room);
    return room;
  }

  createParticipant({ socketId, displayName }) {
    return {
      participantId: this.uuidGenerator(),
      socketId,
      displayName,
      joinedAt: Date.now(),
      micEnabled: false,
      cameraEnabled: false,
      mediaRevision: 0,
    };
  }

  createChatEntry({ room, type, participantId, displayName, text, clientMessageId }) {
    const seq = room.nextSeq++;
    const entry = {
      id: `${room.epoch}:${seq}`,
      seq,
      type,
      participantId,
      displayName,
      createdAt: Date.now(),
    };
    if (text !== undefined) entry.text = text;
    if (clientMessageId !== undefined) entry.clientMessageId = clientMessageId;
    return entry;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getMembership(socketId) {
    return this.socketIndex.get(socketId);
  }

  createAndJoin({ socketId, displayName }) {
    const normalizedName = this.#validateJoinInput({ socketId, displayName });
    const room = this.createRoom();
    return this.#joinRoom({ room, socketId, displayName: normalizedName });
  }

  join({ roomId, socketId, displayName }) {
    const validatedRoomId = validateRoomId(roomId);
    if (!validatedRoomId.ok) throw new RegistryError(ERROR_CODES.INVALID_ROOM_ID, validatedRoomId.reason);
    const normalizedName = this.#validateJoinInput({ socketId, displayName });
    const room = this.getRoom(validatedRoomId.value) ?? this.createRoom(validatedRoomId.value);
    return this.#joinRoom({ room, socketId, displayName: normalizedName });
  }

  leave({ socketId, roomEpoch } = {}) {
    const membership = this.socketIndex.get(socketId);
    if (!membership) return { left: false, entry: null };
    if (roomEpoch !== undefined && roomEpoch !== membership.epoch) {
      throw new RegistryError(ERROR_CODES.STALE_ROOM, 'Room epoch does not match the active session.');
    }

    const room = this.rooms.get(membership.roomId);
    this.socketIndex.delete(socketId);
    if (!room) return { left: false, entry: null };

    const participant = room.participants.get(membership.participantId);
    if (!participant) return { left: false, entry: null };

    room.participants.delete(participant.participantId);
    const entry = this.createChatEntry({
      room,
      type: 'leave',
      participantId: participant.participantId,
      displayName: participant.displayName,
    });
    room.history.push(entry);

    if (room.participants.size === 0) {
      this.rooms.delete(room.roomId);
    }
    return { left: true, room, participant, entry };
  }

  appendMessage({ socketId, roomEpoch, clientMessageId, text }) {
    const membership = this.socketIndex.get(socketId);
    if (!membership) throw new RegistryError(ERROR_CODES.NOT_JOINED, 'Socket is not in a room.');
    const room = this.rooms.get(membership.roomId);
    if (!room || room.epoch !== roomEpoch) throw new RegistryError(ERROR_CODES.STALE_ROOM, 'Room epoch does not match the active session.');
    if (typeof clientMessageId !== 'string' || !UUID.test(clientMessageId)) {
      throw new RegistryError(ERROR_CODES.INVALID_REQUEST, 'clientMessageId must be a UUID.');
    }
    const validatedText = validateChatMessage(text);
    if (!validatedText.ok) throw new RegistryError(ERROR_CODES.INVALID_MESSAGE, validatedText.reason);

    const key = `${membership.participantId}:${clientMessageId}`;
    const existing = room.messageIndex.get(key);
    if (existing) {
      if (existing.text !== validatedText.value) throw new RegistryError(ERROR_CODES.MESSAGE_ID_CONFLICT, 'Message ID was already used with different text.');
      return { room, entry: existing, duplicate: true };
    }

    const participant = room.participants.get(membership.participantId);
    const entry = this.createChatEntry({
      room,
      type: 'user',
      participantId: participant.participantId,
      displayName: participant.displayName,
      text: validatedText.value,
      clientMessageId,
    });
    room.history.push(entry);
    room.messageIndex.set(key, entry);
    return { room, entry, duplicate: false };
  }

  #validateJoinInput({ socketId, displayName }) {
    const validatedName = validateDisplayName(displayName);
    if (!validatedName.ok) throw new RegistryError(ERROR_CODES.INVALID_NAME, validatedName.reason);
    if (this.socketIndex.has(socketId)) throw new RegistryError(ERROR_CODES.ALREADY_JOINED, 'Socket already belongs to a room.');
    return validatedName.value;
  }

  #joinRoom({ room, socketId, displayName }) {
    if (room.participants.size >= MAX_PARTICIPANTS) throw new RegistryError(ERROR_CODES.ROOM_FULL, 'Room is full.');

    const participant = this.createParticipant({ socketId, displayName });
    room.participants.set(participant.participantId, participant);
    this.socketIndex.set(socketId, {
      roomId: room.roomId,
      epoch: room.epoch,
      participantId: participant.participantId,
    });
    const entry = this.createChatEntry({
      room,
      type: 'join',
      participantId: participant.participantId,
      displayName: participant.displayName,
    });
    room.history.push(entry);

    return {
      room,
      participant,
      entry,
      snapshot: {
        roomId: room.roomId,
        roomEpoch: room.epoch,
        selfParticipantId: participant.participantId,
        snapshotSeq: entry.seq,
        participants: [...room.participants.values()].map(toPublicParticipant),
        historyThroughSeq: entry.seq,
      },
    };
  }
}
