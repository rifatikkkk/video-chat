import { describe, expect, it } from 'vitest';
import { ERROR_CODES, PROTOCOL_VERSION, createErrorAck, createSuccessAck, validateAck, validateRequestEnvelope, validateRoomEvent, validateSignalDescription } from '../../shared/protocol.js';

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
});
