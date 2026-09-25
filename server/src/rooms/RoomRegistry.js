import { randomBytes, randomUUID } from 'node:crypto';

const ROOM_ID_BYTES = 16;

export function generateRoomId() {
  return randomBytes(ROOM_ID_BYTES).toString('base64url');
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
}
