import { SessionEventBuffer } from './SessionEventBuffer.js';

export const SESSION_STATES = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  JOINING: 'joining',
  ACTIVE: 'active',
  LEAVING: 'leaving',
  ENDED: 'ended',
});

export class RoomSession {
  constructor({ signalingClient, mediaController = {}, peerManager = {}, page = globalThis, onRoomEvent, onSignal } = {}) {
    if (!signalingClient) throw new TypeError('signalingClient is required.');
    this.signalingClient = signalingClient;
    this.mediaController = mediaController;
    this.peerManager = peerManager;
    this.page = page;
    this.state = SESSION_STATES.IDLE;
    this.snapshot = null;
    this.listeners = new Set();
    this.cleaningUp = null;
    this.cleaned = false;
    this.earlyEventError = null;
    this.eventBuffer = new SessionEventBuffer({
      onRoomEvent: (event) => {
        this.peerManager.handleRoomEvent?.(event);
        onRoomEvent?.(event);
      },
      onSignal: (event) => {
        this.peerManager.handleSignal?.(event);
        onSignal?.(event);
      },
    });
    this.unsubscribeDisconnect = this.signalingClient.on('disconnect', () => { void this.dispose({ sendLeave: false }); });
    this.unsubscribeRoomEvent = this.signalingClient.on('room:event', (event) => this.#receiveEarlyEvent('room', event));
    this.unsubscribeSignalDescription = this.signalingClient.on('signal:description', (event) => this.#receiveEarlyEvent('signal', event));
    this.unsubscribeSignalCandidate = this.signalingClient.on('signal:candidate', (event) => this.#receiveEarlyEvent('signal', event));
    this.onPageHide = () => { void this.dispose(); };
    this.onPageShow = (event) => {
      if (event.persisted) void this.dispose({ sendLeave: false });
    };
    this.page.addEventListener?.('pagehide', this.onPageHide);
    this.page.addEventListener?.('pageshow', this.onPageShow);
  }

  onStateChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async join({ displayName, roomId } = {}) {
    if (this.state !== SESSION_STATES.IDLE) throw new Error('A RoomSession can join only once. Create a new session to retry.');
    this.#setState(SESSION_STATES.CONNECTING);
    try {
      await this.signalingClient.connect();
      this.#setState(SESSION_STATES.JOINING);
      const response = await this.signalingClient.request(roomId ? 'room:join' : 'room:create', roomId ? { roomId, displayName } : { displayName });
      if (!response?.ok) {
        const error = new Error(response?.error?.message ?? 'Unable to join the room.');
        error.code = response?.error?.code;
        throw error;
      }
      if (this.earlyEventError) throw this.earlyEventError;
      this.snapshot = response.data;
      this.peerManager.applySnapshot?.(this.snapshot);
      this.eventBuffer.applySnapshot(this.snapshot);
      this.#setState(SESSION_STATES.ACTIVE);
      return this.snapshot;
    } catch (error) {
      await this.dispose({ sendLeave: false });
      throw error;
    }
  }

  leave() {
    return this.dispose();
  }

  async dispose({ sendLeave = true } = {}) {
    if (this.cleaningUp) return this.cleaningUp;
    if (this.state === SESSION_STATES.ENDED) return undefined;
    this.cleaningUp = this.#dispose({ sendLeave });
    return this.cleaningUp;
  }

  async #dispose({ sendLeave }) {
    if (this.state !== SESSION_STATES.ENDED) this.#setState(SESSION_STATES.LEAVING);
    this.#cleanupLocalResources();
    this.#removeLifecycleListeners();

    const roomEpoch = this.snapshot?.roomEpoch;
    if (sendLeave && roomEpoch && this.signalingClient.socket.connected) {
      try {
        await this.signalingClient.request('room:leave', { roomEpoch });
      } catch {
        // The disconnect still lets the server release membership if the request cannot be acknowledged.
      }
    }
    this.signalingClient.disconnect();
    this.snapshot = null;
    this.#setState(SESSION_STATES.ENDED);
  }

  #cleanupLocalResources() {
    if (this.cleaned) return;
    this.cleaned = true;
    this.mediaController.dispose?.();
    this.peerManager.dispose?.();
  }

  #removeLifecycleListeners() {
    this.unsubscribeDisconnect?.();
    this.unsubscribeDisconnect = null;
    this.unsubscribeRoomEvent?.();
    this.unsubscribeRoomEvent = null;
    this.unsubscribeSignalDescription?.();
    this.unsubscribeSignalDescription = null;
    this.unsubscribeSignalCandidate?.();
    this.unsubscribeSignalCandidate = null;
    this.page.removeEventListener?.('pagehide', this.onPageHide);
    this.page.removeEventListener?.('pageshow', this.onPageShow);
  }

  #setState(state) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  #receiveEarlyEvent(type, event) {
    const result = type === 'room' ? this.eventBuffer.receiveRoomEvent(event) : this.eventBuffer.receiveSignal(event);
    if (result.overflowed) {
      this.earlyEventError = new Error('Too many events arrived before room join completed.');
      void this.dispose({ sendLeave: false });
    }
  }
}
