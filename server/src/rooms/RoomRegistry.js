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
  constructor({ roomIdGenerator = generateRoomId, uuidGenerator = randomUUID, historyBudgetBytes = 1024 ** 3, lifecycleReserveBytes = 1024 ** 2 } = {}) {
    this.rooms = new Map();
    this.socketIndex = new Map();
    this.roomIdGenerator = roomIdGenerator;
    this.uuidGenerator = uuidGenerator;
    this.historyBudgetBytes = historyBudgetBytes;
    this.lifecycleReserveBytes = lifecycleReserveBytes;
    this.historyBytes = 0;
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
      historyBytes: 0,
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
    try {
      return this.#joinRoom({ room, socketId, displayName: normalizedName });
    } catch (error) {
      this.#deleteEmptyRoom(room);
      throw error;
    }
  }

  join({ roomId, socketId, displayName }) {
    const validatedRoomId = validateRoomId(roomId);
    if (!validatedRoomId.ok) throw new RegistryError(ERROR_CODES.INVALID_ROOM_ID, validatedRoomId.reason);
    const normalizedName = this.#validateJoinInput({ socketId, displayName });
    const existingRoom = this.getRoom(validatedRoomId.value);
    const room = existingRoom ?? this.createRoom(validatedRoomId.value);
    try {
      return this.#joinRoom({ room, socketId, displayName: normalizedName });
    } catch (error) {
      if (!existingRoom) this.#deleteEmptyRoom(room);
      throw error;
    }
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
    this.#appendHistory(room, entry, { allowOverBudget: true });

    if (room.participants.size === 0) {
      this.#deleteEmptyRoom(room);
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
    this.#appendHistory(room, entry);
    room.messageIndex.set(key, entry);
    return { room, entry, duplicate: false };
  }

  getHistory({ socketId, roomEpoch, throughSeq, afterSeq = 0, limit }) {
    const membership = this.socketIndex.get(socketId);
    if (!membership) throw new RegistryError(ERROR_CODES.NOT_JOINED, 'Socket is not in a room.');
    const room = this.rooms.get(membership.roomId);
    if (!room || room.epoch !== roomEpoch) throw new RegistryError(ERROR_CODES.STALE_ROOM, 'Room epoch does not match the active session.');
    if (!Number.isInteger(throughSeq) || throughSeq < 0 || !Number.isInteger(afterSeq) || afterSeq < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new RegistryError(ERROR_CODES.INVALID_REQUEST, 'History cursor and limit are invalid.');
    }

    let low = 0;
    let high = room.history.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (room.history[middle].seq <= afterSeq) low = middle + 1;
      else high = middle;
    }
    const entries = [];
    for (let index = low; index < room.history.length && entries.length < limit; index += 1) {
      const entry = room.history[index];
      if (entry.seq > throughSeq) break;
      entries.push(entry);
    }
    const lastSeq = entries.at(-1)?.seq ?? afterSeq;
    const done = low >= room.history.length || room.history[low]?.seq > throughSeq || entries.length < limit;
    return { entries, nextAfterSeq: done ? null : lastSeq, done, throughSeq };
  }

  updateMedia({ socketId, roomEpoch, revision, micEnabled, cameraEnabled }) {
    const membership = this.socketIndex.get(socketId);
    if (!membership) throw new RegistryError(ERROR_CODES.NOT_JOINED, 'Socket is not in a room.');
    const room = this.rooms.get(membership.roomId);
    if (!room || room.epoch !== roomEpoch) throw new RegistryError(ERROR_CODES.STALE_ROOM, 'Room epoch does not match the active session.');
    if (!Number.isInteger(revision) || revision < 1 || typeof micEnabled !== 'boolean' || typeof cameraEnabled !== 'boolean') {
      throw new RegistryError(ERROR_CODES.INVALID_REQUEST, 'Media state is invalid.');
    }
    const participant = room.participants.get(membership.participantId);
    if (revision <= participant.mediaRevision) return { room, participant, changed: false };
    participant.mediaRevision = revision;
    participant.micEnabled = micEnabled;
    participant.cameraEnabled = cameraEnabled;
    const entry = { seq: room.nextSeq++ };
    return { room, participant, entry, changed: true };
  }

  getSignalRoute({ socketId, roomEpoch, toParticipantId }) {
    const membership = this.socketIndex.get(socketId);
    if (!membership) throw new RegistryError(ERROR_CODES.NOT_JOINED, 'Socket is not in a room.');
    const room = this.rooms.get(membership.roomId);
    if (!room || room.epoch !== roomEpoch) throw new RegistryError(ERROR_CODES.STALE_ROOM, 'Room epoch does not match the active session.');
    if (toParticipantId === membership.participantId) throw new RegistryError(ERROR_CODES.INVALID_REQUEST, 'Signal cannot target its sender.');
    const target = room.participants.get(toParticipantId);
    if (!target) throw new RegistryError(ERROR_CODES.PEER_NOT_FOUND, 'Target participant is not in this room.');
    return { room, fromParticipantId: membership.participantId, target };
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
    const entry = this.createChatEntry({
      room,
      type: 'join',
      participantId: participant.participantId,
      displayName: participant.displayName,
    });
    this.#appendHistory(room, entry);
    room.participants.set(participant.participantId, participant);
    this.socketIndex.set(socketId, {
      roomId: room.roomId,
      epoch: room.epoch,
      participantId: participant.participantId,
    });

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

  #appendHistory(room, entry, { allowOverBudget = false } = {}) {
    const entryBytes = Buffer.byteLength(JSON.stringify(entry));
    const limit = this.historyBudgetBytes - this.lifecycleReserveBytes;
    if (!allowOverBudget && this.historyBytes + entryBytes > limit) {
      throw new RegistryError(ERROR_CODES.SERVER_BUSY, 'Server cannot accept another message.');
    }
    room.history.push(entry);
    room.historyBytes += entryBytes;
    this.historyBytes += entryBytes;
  }

  #deleteEmptyRoom(room) {
    if (room.participants.size !== 0) return;
    this.rooms.delete(room.roomId);
    this.historyBytes -= room.historyBytes;
  }
}
