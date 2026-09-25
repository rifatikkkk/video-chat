export const PEER_CONNECTION_CONFIG = Object.freeze({
  iceServers: Object.freeze([{ urls: 'stun:stun.l.google.com:19302' }]),
});

export class PeerManager {
  constructor({ peerConnectionFactory = (config) => new RTCPeerConnection(config), maxPeers = 3, sendDescription = async () => {} } = {}) {
    this.peerConnectionFactory = peerConnectionFactory;
    this.maxPeers = maxPeers;
    this.sendDescription = sendDescription;
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
    if (event.description) this.#queuePeerOperation(peer, () => this.#handleDescription(peer, event.description));
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
      negotiationStarted: false,
      operationQueue: Promise.resolve(),
    };
    this.peers.set(remoteParticipantId, peer);
    if (peer.offerer) this.#queuePeerOperation(peer, () => this.#startOffer(peer));
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

  #queuePeerOperation(peer, operation) {
    peer.operationQueue = peer.operationQueue.catch(() => null).then(async () => {
      if (this.peers.get(peer.remoteParticipantId) !== peer) return;
      await operation();
    });
    return peer.operationQueue;
  }

  async #startOffer(peer) {
    if (peer.negotiationStarted) return;
    peer.negotiationStarted = true;
    peer.connection.addTransceiver('audio', { direction: 'sendrecv' });
    peer.connection.addTransceiver('video', { direction: 'sendrecv' });
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    await this.#sendDescription(peer, peer.connection.localDescription ?? offer);
  }

  async #handleDescription(peer, description) {
    if (description.type === 'offer') {
      await peer.connection.setRemoteDescription(description);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      await this.#sendDescription(peer, peer.connection.localDescription ?? answer);
      return;
    }
    if (description.type === 'answer') {
      await peer.connection.setRemoteDescription(description);
    }
  }

  async #sendDescription(peer, description) {
    await this.sendDescription({
      roomEpoch: peer.roomEpoch,
      toParticipantId: peer.remoteParticipantId,
      description,
    });
  }
}
