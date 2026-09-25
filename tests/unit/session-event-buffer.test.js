import { describe, expect, it } from 'vitest';
import { SessionEventBuffer } from '../../client/src/session/SessionEventBuffer.js';

const snapshot = { roomEpoch: 'epoch-a', snapshotSeq: 3 };
const roomEvent = (seq, kind, payload = {}) => ({ roomEpoch: 'epoch-a', seq, kind, payload });

describe('SessionEventBuffer', () => {
  it('buffers early events, applies only post-snapshot sequences once, and ignores old epochs', () => {
    const events = [];
    const buffer = new SessionEventBuffer({ onRoomEvent: (event) => events.push(event) });
    buffer.receiveRoomEvent(roomEvent(3, 'participant-joined'));
    buffer.receiveRoomEvent(roomEvent(4, 'participant-joined'));
    buffer.receiveRoomEvent({ ...roomEvent(5, 'participant-joined'), roomEpoch: 'old-epoch' });
    buffer.applySnapshot(snapshot);
    buffer.receiveRoomEvent(roomEvent(4, 'participant-joined'));
    buffer.receiveRoomEvent(roomEvent(5, 'media-updated'));

    expect(events.map(({ seq }) => seq)).toEqual([4, 5]);
  });

  it('does not pass a late signal from a participant tombstoned by leave', () => {
    const signals = [];
    const buffer = new SessionEventBuffer({ onSignal: (event) => signals.push(event) });
    buffer.applySnapshot(snapshot);
    buffer.receiveRoomEvent(roomEvent(4, 'participant-left', { participantId: 'peer-a' }));
    buffer.receiveSignal({ roomEpoch: 'epoch-a', fromParticipantId: 'peer-a', description: {} });
    buffer.receiveSignal({ roomEpoch: 'epoch-a', fromParticipantId: 'peer-b', description: {} });

    expect(signals).toEqual([expect.objectContaining({ fromParticipantId: 'peer-b' })]);
  });

  it('marks joining as failed instead of growing an unbounded pre-ack buffer', () => {
    const buffer = new SessionEventBuffer({ maxBufferedEvents: 2 });
    buffer.receiveRoomEvent(roomEvent(1, 'participant-joined'));
    buffer.receiveSignal({ roomEpoch: 'epoch-a', fromParticipantId: 'peer-a' });

    expect(buffer.receiveRoomEvent(roomEvent(2, 'participant-left'))).toEqual({ overflowed: true });
    expect(() => buffer.applySnapshot(snapshot)).toThrow(/Too many events/);
  });
});
