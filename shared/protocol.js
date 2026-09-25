export const PROTOCOL_VERSION = 1;
export const ACK_TIMEOUT_MS = 5_000;
export const CONNECT_TIMEOUT_MS = 10_000;
export const MAX_INCOMING_PAYLOAD_BYTES = 128 * 1024;
export const MAX_SDP_BYTES = 64 * 1024;
export const MAX_ICE_BYTES = 4 * 1024;
export const MAX_MESSAGE_CODE_POINTS = 2_000;
export const CLIENT_EVENTS = Object.freeze(['room:create', 'room:join', 'room:leave', 'history:get', 'chat:send', 'media:update', 'signal:description', 'signal:candidate']);
export const ROOM_EVENT_KINDS = Object.freeze(['participant-joined', 'participant-left', 'media-updated', 'chat-message']);
export const ERROR_CODES = Object.freeze({ PROTOCOL_MISMATCH: 'PROTOCOL_MISMATCH', INVALID_REQUEST: 'INVALID_REQUEST', INVALID_NAME: 'INVALID_NAME', INVALID_ROOM_ID: 'INVALID_ROOM_ID', INVALID_MESSAGE: 'INVALID_MESSAGE', ROOM_FULL: 'ROOM_FULL', ALREADY_JOINED: 'ALREADY_JOINED', NOT_JOINED: 'NOT_JOINED', STALE_ROOM: 'STALE_ROOM', PEER_NOT_FOUND: 'PEER_NOT_FOUND', MESSAGE_ID_CONFLICT: 'MESSAGE_ID_CONFLICT', RATE_LIMITED: 'RATE_LIMITED', SERVER_BUSY: 'SERVER_BUSY', SLOW_CONSUMER: 'SLOW_CONSUMER' });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOM_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DISPLAY_NAME = /^[\p{L}\p{M}\p{N} ]+$/u;
const DISPLAY_NAME_CONTENT = /[\p{L}\p{N}]/u;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isUuid = (value) => typeof value === 'string' && UUID.test(value);
const invalid = (reason) => ({ ok: false, reason });
const utf8Bytes = (value) => new TextEncoder().encode(value).byteLength;

export function validateChatMessage(value) {
  if (typeof value !== 'string') return { ...invalid('Message must be a string.'), code: ERROR_CODES.INVALID_MESSAGE };
  const text = value.trim();
  if (Array.from(text).length === 0 || Array.from(text).length > MAX_MESSAGE_CODE_POINTS) {
    return { ...invalid('Message must contain 1–2000 code points.'), code: ERROR_CODES.INVALID_MESSAGE };
  }
  return { ok: true, value: text };
}

export function validatePayloadSize(value, maximumBytes = MAX_INCOMING_PAYLOAD_BYTES) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ...invalid('Payload must be JSON serializable.'), code: ERROR_CODES.INVALID_REQUEST };
  }
  if (typeof serialized !== 'string' || utf8Bytes(serialized) > maximumBytes) {
    return { ...invalid(`Payload exceeds ${maximumBytes} bytes.`), code: ERROR_CODES.INVALID_REQUEST };
  }
  return { ok: true, value };
}

export function validateDisplayName(value) {
  if (typeof value !== 'string') return { ...invalid('Display name must be a string.'), code: ERROR_CODES.INVALID_NAME };
  const normalized = value.normalize('NFC').trim();
  if (Array.from(normalized).length === 0 || Array.from(normalized).length > 30 || !DISPLAY_NAME.test(normalized) || !DISPLAY_NAME_CONTENT.test(normalized)) {
    return { ...invalid('Display name must contain 1–30 letters, numbers, or spaces.'), code: ERROR_CODES.INVALID_NAME };
  }
  return { ok: true, value: normalized };
}

export function validateRoomId(value) {
  if (typeof value !== 'string' || !ROOM_ID.test(value)) {
    return { ...invalid('roomId must contain 1–64 ASCII letters, digits, underscores, or hyphens.'), code: ERROR_CODES.INVALID_ROOM_ID };
  }
  return { ok: true, value };
}

export function validateRequestEnvelope(value) {
  if (!isObject(value) || value.v !== PROTOCOL_VERSION || !isUuid(value.requestId)) return invalid('Request requires v:1 and UUID requestId.');
  return { ok: true, value };
}

export function createSuccessAck(requestId, data) { return { ok: true, requestId, data }; }
export function createErrorAck(requestId, code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return { ok: false, requestId, error };
}

export function validateAck(value) {
  if (!isObject(value) || typeof value.ok !== 'boolean' || !isUuid(value.requestId)) return invalid('Ack requires ok and UUID requestId.');
  if (value.ok && !Object.hasOwn(value, 'data')) return invalid('Success ack requires data.');
  if (!value.ok && (!isObject(value.error) || typeof value.error.code !== 'string' || typeof value.error.message !== 'string')) return invalid('Failure ack requires error.');
  return { ok: true, value };
}

export function validateRoomEvent(value) {
  if (!isObject(value) || value.v !== PROTOCOL_VERSION || !isUuid(value.roomEpoch) || !Number.isInteger(value.seq) || value.seq < 0 || !ROOM_EVENT_KINDS.includes(value.kind) || !Object.hasOwn(value, 'payload')) return invalid('Invalid room:event.');
  return { ok: true, value };
}

export function validateSignalDescription(value) {
  const description = value?.description;
  if (!isObject(value) || value.v !== PROTOCOL_VERSION || !isUuid(value.roomEpoch) || !isUuid(value.fromParticipantId) || !isObject(description) || !['offer', 'answer'].includes(description.type) || typeof description.sdp !== 'string' || utf8Bytes(description.sdp) > MAX_SDP_BYTES) return invalid('Invalid signal description.');
  return { ok: true, value };
}

export function validateSignalCandidate(value) {
  if (!isObject(value) || value.v !== PROTOCOL_VERSION || !isUuid(value.roomEpoch) || !isUuid(value.fromParticipantId) || typeof value.iceUfrag !== 'string' || !(value.candidate === null || isObject(value.candidate)) || (value.candidate !== null && !validatePayloadSize(value.candidate, MAX_ICE_BYTES).ok)) return invalid('Invalid signal candidate.');
  return { ok: true, value };
}
