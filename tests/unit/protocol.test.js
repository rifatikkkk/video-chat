import { describe, expect, it } from 'vitest';
import { ERROR_CODES, MAX_ICE_BYTES, MAX_SDP_BYTES, PROTOCOL_VERSION, createErrorAck, createSuccessAck, validateAck, validateChatMessage, validateDisplayName, validatePayloadSize, validateRequestEnvelope, validateRoomEvent, validateRoomId, validateSignalCandidate, validateSignalDescription } from '../../shared/protocol.js';

describe('protocol bootstrap', () => {
  it('exposes the initial protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('requires a compatible envelope and validates acknowledgements', () => {
    const requestId = crypto.randomUUID();
    expect(validateRequestEnvelope({ v: 1 })).toMatchObject({ ok: false });
    expect(validateRequestEnvelope({ v: 1, requestId })).toMatchObject({ ok: true });
    expect(validateAck(createSuccessAck(requestId, {}))).toMatchObject({ ok: true });
    expect(validateAck(createErrorAck(requestId, ERROR_CODES.ROOM_FULL, 'Комната заполнена'))).toMatchObject({ ok: true });
  });

  it('rejects malformed room events and signals', () => {
    expect(validateRoomEvent({ v: 1, roomEpoch: crypto.randomUUID(), seq: 0, kind: 'other', payload: {} })).toMatchObject({ ok: false });
    expect(validateSignalDescription({ v: 1, roomEpoch: crypto.randomUUID(), fromParticipantId: crypto.randomUUID(), description: { type: 'offer' } })).toMatchObject({ ok: false });
  });

  it('normalizes and validates display names by Unicode code points', () => {
    expect(validateDisplayName('  Анна  ')).toEqual({ ok: true, value: 'Анна' });
    expect(validateDisplayName('Jose\u0301')).toEqual({ ok: true, value: 'José' });
    expect(validateDisplayName('а'.repeat(30))).toMatchObject({ ok: true });
    expect(validateDisplayName('а'.repeat(31))).toMatchObject({ ok: false, code: ERROR_CODES.INVALID_NAME });
    expect(validateDisplayName(' <script> ')).toMatchObject({ ok: false, code: ERROR_CODES.INVALID_NAME });
    expect(validateDisplayName('   ')).toMatchObject({ ok: false, code: ERROR_CODES.INVALID_NAME });
  });

  it('accepts only the documented room ID alphabet and bounds', () => {
    expect(validateRoomId('Room_42-test')).toEqual({ ok: true, value: 'Room_42-test' });
    expect(validateRoomId('a'.repeat(64))).toMatchObject({ ok: true });
    expect(validateRoomId('a'.repeat(65))).toMatchObject({ ok: false, code: ERROR_CODES.INVALID_ROOM_ID });
    expect(validateRoomId('room/name')).toMatchObject({ ok: false, code: ERROR_CODES.INVALID_ROOM_ID });
  });

  it('validates messages by code points while keeping HTML as literal text', () => {
    expect(validateChatMessage('  <b>привет</b>  ')).toEqual({ ok: true, value: '<b>привет</b>' });
    expect(validateChatMessage('😀'.repeat(2_000))).toMatchObject({ ok: true });
    expect(validateChatMessage('😀'.repeat(2_001))).toMatchObject({ ok: false, code: ERROR_CODES.INVALID_MESSAGE });
    expect(validateChatMessage(' \n ')).toMatchObject({ ok: false, code: ERROR_CODES.INVALID_MESSAGE });
  });

  it('enforces packet, SDP, and ICE byte limits', () => {
    expect(validatePayloadSize({ text: 'a'.repeat(128 * 1024) })).toMatchObject({ ok: false });
    const ids = { roomEpoch: crypto.randomUUID(), fromParticipantId: crypto.randomUUID() };
    expect(validateSignalDescription({ v: 1, ...ids, description: { type: 'offer', sdp: 'a'.repeat(MAX_SDP_BYTES + 1) } })).toMatchObject({ ok: false });
    expect(validateSignalCandidate({ v: 1, ...ids, iceUfrag: 'u', candidate: { candidate: 'a'.repeat(MAX_ICE_BYTES) } })).toMatchObject({ ok: false });
  });
});
