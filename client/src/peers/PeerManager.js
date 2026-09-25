export const PEER_CONNECTION_CONFIG = Object.freeze({
  iceServers: Object.freeze([{ urls: 'stun:stun.l.google.com:19302' }]),
});

export class PeerManager {
  constructor({ peerConnectionFactory = (config) => new RTCPeerConnection(config), maxPeers = 3 } = {}) {
    this.peerConnectionFactory = peerConnectionFactory;
    this.maxPeers = maxPeers;
    this.roomEpoch = null;
    this.selfParticipantId = null;
    this.peers = new Map();
    this.tombstones = new Set();
    this.signalLog = [];
  }

  applySnapshot(snapshot) {
    this.#resetForSnapshot(snapshot);
    for (const participant of snapshot.participants ?? []) {
      this.ensurePeer(participant.participantId);
    }
  }

  handleRoomEvent(event) {
    if (!this.#isCurrentEpoch(event?.roomEpoch)) return;
    if (event.kind === 'participant-joined') {
      this.ensurePeer(event.payload.participant.participantId);
      return;
    }
    if (event.kind === 'participant-left') {
      this.closePeer(event.payload.participantId);
      this.tombstones.add(event.payload.participantId);
    }
  }

  handleSignal(event) {
    if (!this.#isCurrentEpoch(event?.roomEpoch) || this.tombstones.has(event.fromParticipantId)) return null;
    const peer = this.peers.get(event.fromParticipantId);
    if (!peer) return null;
    this.signalLog.push(event);
    return peer;
  }

  ensurePeer(remoteParticipantId) {
    if (!this.roomEpoch || !remoteParticipantId || remoteParticipantId === this.selfParticipantId || this.tombstones.has(remoteParticipantId)) return null;
    const existing = this.peers.get(remoteParticipantId);
    if (existing) return existing;
    if (this.peers.size >= this.maxPeers) return null;

    const connection = this.peerConnectionFactory(PEER_CONNECTION_CONFIG);
    const peer = {
      roomEpoch: this.roomEpoch,
      remoteParticipantId,
      connection,
      offerer: this.selfParticipantId < remoteParticipantId,
      polite: this.selfParticipantId > remoteParticipantId,
    };
    this.peers.set(remoteParticipantId, peer);
    return peer;
  }

  closePeer(remoteParticipantId) {
    const peer = this.peers.get(remoteParticipantId);
    if (!peer) return false;
    peer.connection.close();
    this.peers.delete(remoteParticipantId);
    return true;
  }

  dispose() {
    for (const peer of this.peers.values()) peer.connection.close();
    this.peers.clear();
    this.tombstones.clear();
    this.signalLog = [];
    this.roomEpoch = null;
    this.selfParticipantId = null;
  }

  getPeer(remoteParticipantId) {
    return this.peers.get(remoteParticipantId) ?? null;
  }

  getPeers() {
    return [...this.peers.values()];
  }

  #resetForSnapshot(snapshot) {
    if (this.roomEpoch === snapshot.roomEpoch && this.selfParticipantId === snapshot.selfParticipantId) return;
    this.dispose();
    this.roomEpoch = snapshot.roomEpoch;
    this.selfParticipantId = snapshot.selfParticipantId;
  }

  #isCurrentEpoch(roomEpoch) {
    return Boolean(roomEpoch && roomEpoch === this.roomEpoch);
  }
}
