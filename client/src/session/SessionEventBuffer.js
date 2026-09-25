export const MAX_EARLY_SESSION_EVENTS = 256;

export class SessionEventBuffer {
  constructor({ onRoomEvent = () => {}, onSignal = () => {}, maxBufferedEvents = MAX_EARLY_SESSION_EVENTS } = {}) {
    this.onRoomEvent = onRoomEvent;
    this.onSignal = onSignal;
    this.maxBufferedEvents = maxBufferedEvents;
    this.buffer = [];
    this.snapshot = null;
    this.seenSequences = new Set();
    this.tombstones = new Set();
    this.overflowed = false;
  }

  receiveRoomEvent(event) {
    return this.#receive({ type: 'room', event });
  }

  receiveSignal(event) {
    return this.#receive({ type: 'signal', event });
  }

  applySnapshot(snapshot) {
    if (this.overflowed) throw new Error('Too many events arrived before room join completed.');
    this.snapshot = snapshot;
    for (const item of this.buffer) this.#apply(item);
    this.buffer = [];
  }

  #receive(item) {
    if (!this.snapshot) {
      if (this.buffer.length >= this.maxBufferedEvents) {
        this.overflowed = true;
        this.buffer = [];
        return { overflowed: true };
      }
      this.buffer.push(item);
      return { overflowed: false };
    }
    this.#apply(item);
    return { overflowed: false };
  }

  #apply({ type, event }) {
    if (!event || event.roomEpoch !== this.snapshot.roomEpoch) return;
    if (type === 'room') {
      if (!Number.isInteger(event.seq) || event.seq <= this.snapshot.snapshotSeq || this.seenSequences.has(event.seq)) return;
      this.seenSequences.add(event.seq);
      if (event.kind === 'participant-left') this.tombstones.add(event.payload.participantId);
      this.onRoomEvent(event);
      return;
    }
    if (this.tombstones.has(event.fromParticipantId)) return;
    this.onSignal(event);
  }
}
