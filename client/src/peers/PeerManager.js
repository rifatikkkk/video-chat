export const PEER_CONNECTION_CONFIG = Object.freeze({
  iceServers: Object.freeze([{ urls: 'stun:stun.l.google.com:19302' }]),
});
export const MAX_QUEUED_ICE_CANDIDATES = 256;
export const ICE_CANDIDATE_QUEUE_TTL_MS = 15_000;
export const PEER_PROGRESS_TIMEOUT_MS = 15_000;
export const WEBRTC_DIAGNOSTICS_INTERVAL_MS = 5_000;

export class PeerManager {
  constructor({
    peerConnectionFactory = (config) => new RTCPeerConnection(config),
    maxPeers = 3,
    sendDescription = async () => {},
    sendCandidate = async () => {},
    createMediaStream = () => new MediaStream(),
    onRemoteStream = () => {},
    onPeerStatus = () => {},
    onPeerDiagnostics = () => {},
    now = () => Date.now(),
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (timer) => clearTimeout(timer),
    diagnosticsIntervalMs = WEBRTC_DIAGNOSTICS_INTERVAL_MS,
  } = {}) {
    this.peerConnectionFactory = peerConnectionFactory;
    this.maxPeers = maxPeers;
    this.sendDescription = sendDescription;
    this.sendCandidate = sendCandidate;
    this.createMediaStream = createMediaStream;
    this.onRemoteStream = onRemoteStream;
    this.onPeerStatus = onPeerStatus;
    this.onPeerDiagnostics = onPeerDiagnostics;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.diagnosticsIntervalMs = diagnosticsIntervalMs;
    this.roomEpoch = null;
    this.selfParticipantId = null;
    this.localTracks = { audio: null, video: null };
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
    if ('candidate' in event) this.#queuePeerOperation(peer, () => this.#handleCandidate(peer, event));
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
      makingOffer: false,
      ignoringOffer: false,
      operationQueue: Promise.resolve(),
      queuedIceCandidates: [],
      remoteIceUfrag: null,
      localIceUfrag: null,
      senders: { audio: null, video: null },
      remoteStream: null,
      status: 'new',
      progressTimer: null,
      diagnosticsTimer: null,
    };
    connection.onicecandidate = (event) => { void this.#sendCandidate(peer, event.candidate ?? null); };
    connection.ontrack = (event) => { this.#handleRemoteTrack(peer, event); };
    connection.oniceconnectionstatechange = () => { this.#updatePeerStatus(peer); };
    connection.onconnectionstatechange = () => { this.#updatePeerStatus(peer); };
    this.peers.set(remoteParticipantId, peer);
    this.#emitPeerStatus(peer, 'new');
    if (peer.offerer) this.#queuePeerOperation(peer, () => this.#startOffer(peer));
    return peer;
  }

  closePeer(remoteParticipantId) {
    const peer = this.peers.get(remoteParticipantId);
    if (!peer) return false;
    this.#cleanupPeer(peer);
    this.peers.delete(remoteParticipantId);
    return true;
  }

  dispose() {
    for (const peer of this.peers.values()) this.#cleanupPeer(peer);
    this.peers.clear();
    this.tombstones.clear();
    this.signalLog = [];
    this.localTracks = { audio: null, video: null };
    this.roomEpoch = null;
    this.selfParticipantId = null;
  }

  getPeer(remoteParticipantId) {
    return this.peers.get(remoteParticipantId) ?? null;
  }

  getPeers() {
    return [...this.peers.values()];
  }

  setLocalTrack(kind, track) {
    if (!['audio', 'video'].includes(kind)) return Promise.resolve();
    this.localTracks[kind] = track;
    return Promise.allSettled(this.getPeers().map((peer) => this.#queuePeerOperation(peer, () => this.#replacePeerTrack(peer, kind, track))));
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
      try {
        await operation();
      } catch {
        peer.queuedIceCandidates = [];
      }
    });
    return peer.operationQueue;
  }

  async #startOffer(peer) {
    if (peer.negotiationStarted) return;
    peer.negotiationStarted = true;
    peer.senders.audio = peer.connection.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    peer.senders.video = peer.connection.addTransceiver('video', { direction: 'sendrecv' }).sender;
    await this.#attachCurrentTracks(peer);
    peer.makingOffer = true;
    try {
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      peer.localIceUfrag = iceUfragFromDescription(peer.connection.localDescription ?? offer);
      await this.#sendDescription(peer, peer.connection.localDescription ?? offer);
    } finally {
      peer.makingOffer = false;
    }
  }

  async #handleDescription(peer, description) {
    if (description.type === 'offer') {
      const offerCollision = peer.makingOffer || peer.connection.signalingState !== 'stable';
      peer.ignoringOffer = !peer.polite && offerCollision;
      if (peer.ignoringOffer) {
        peer.queuedIceCandidates = [];
        return;
      }
      if (offerCollision) {
        await peer.connection.setLocalDescription({ type: 'rollback' });
        peer.localIceUfrag = null;
      }
      await peer.connection.setRemoteDescription(description);
      peer.remoteIceUfrag = iceUfragFromDescription(description);
      await this.#flushQueuedCandidates(peer);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      peer.localIceUfrag = iceUfragFromDescription(peer.connection.localDescription ?? answer);
      await this.#sendDescription(peer, peer.connection.localDescription ?? answer);
      return;
    }
    if (description.type === 'answer') {
      peer.ignoringOffer = false;
      await peer.connection.setRemoteDescription(description);
      peer.remoteIceUfrag = iceUfragFromDescription(description);
      await this.#flushQueuedCandidates(peer);
    }
  }

  async #sendDescription(peer, description) {
    await this.sendDescription({
      roomEpoch: peer.roomEpoch,
      toParticipantId: peer.remoteParticipantId,
      description,
    });
  }

  async #handleCandidate(peer, event) {
    if (peer.ignoringOffer) return;
    if (event.iceUfrag !== peer.remoteIceUfrag) {
      if (!peer.connection.remoteDescription && !peer.remoteIceUfrag) this.#queueCandidate(peer, event);
      return;
    }
    await peer.connection.addIceCandidate(event.candidate);
  }

  #queueCandidate(peer, event) {
    if (peer.queuedIceCandidates.length >= MAX_QUEUED_ICE_CANDIDATES) return;
    peer.queuedIceCandidates.push({ event, receivedAt: this.now() });
  }

  async #flushQueuedCandidates(peer) {
    const pendingCandidates = peer.queuedIceCandidates;
    peer.queuedIceCandidates = [];
    for (const item of pendingCandidates) {
      if (this.now() - item.receivedAt > ICE_CANDIDATE_QUEUE_TTL_MS) continue;
      if (item.event.iceUfrag !== peer.remoteIceUfrag) continue;
      await peer.connection.addIceCandidate(item.event.candidate);
    }
  }

  async #sendCandidate(peer, candidate) {
    if (!peer.localIceUfrag) peer.localIceUfrag = iceUfragFromDescription(peer.connection.localDescription);
    if (!peer.localIceUfrag) return;
    await this.sendCandidate({
      roomEpoch: peer.roomEpoch,
      toParticipantId: peer.remoteParticipantId,
      iceUfrag: peer.localIceUfrag,
      candidate,
    });
  }

  async #attachCurrentTracks(peer) {
    await this.#replacePeerTrack(peer, 'audio', this.localTracks.audio);
    await this.#replacePeerTrack(peer, 'video', this.localTracks.video);
  }

  async #replacePeerTrack(peer, kind, track) {
    const sender = this.#ensureSender(peer, kind);
    try {
      await sender.replaceTrack(track);
    } catch {
      await this.#renegotiate(peer);
    }
  }

  #ensureSender(peer, kind) {
    if (peer.senders[kind]) return peer.senders[kind];
    const transceiver = peer.connection.addTransceiver(kind, { direction: 'sendrecv' });
    peer.senders[kind] = transceiver.sender;
    return peer.senders[kind];
  }

  async #renegotiate(peer) {
    peer.makingOffer = true;
    try {
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      peer.localIceUfrag = iceUfragFromDescription(peer.connection.localDescription ?? offer);
      await this.#sendDescription(peer, peer.connection.localDescription ?? offer);
    } finally {
      peer.makingOffer = false;
    }
  }

  #handleRemoteTrack(peer, event) {
    const stream = event.streams?.[0] ?? peer.remoteStream ?? this.createMediaStream();
    peer.remoteStream = stream;
    if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track);
    this.#emitRemoteStream(peer, stream);
  }

  #emitRemoteStream(peer, stream) {
    peer.remoteStream = stream;
    this.onRemoteStream({ participantId: peer.remoteParticipantId, stream });
  }

  #updatePeerStatus(peer) {
    const state = peer.connection.connectionState === 'failed' ? 'failed' : peer.connection.iceConnectionState;
    if (state === 'failed' || state === 'disconnected') {
      this.#clearProgressTimer(peer);
      this.#emitPeerStatus(peer, state);
      return;
    }
    if (['connected', 'completed'].includes(state)) {
      this.#clearProgressTimer(peer);
      this.#emitPeerStatus(peer, 'connected');
      this.#startDiagnostics(peer);
      return;
    }
    if (['checking', 'connecting'].includes(state)) {
      this.#emitPeerStatus(peer, state);
      this.#startProgressTimer(peer);
    }
  }

  #startProgressTimer(peer) {
    if (peer.progressTimer) return;
    peer.progressTimer = this.setTimer(() => {
      peer.progressTimer = null;
      if (this.peers.get(peer.remoteParticipantId) === peer) this.#emitPeerStatus(peer, 'stalled');
    }, PEER_PROGRESS_TIMEOUT_MS);
  }

  #clearProgressTimer(peer) {
    if (!peer.progressTimer) return;
    this.clearTimer(peer.progressTimer);
    peer.progressTimer = null;
  }

  #startDiagnostics(peer) {
    if (peer.diagnosticsTimer || !peer.connection.getStats) return;
    peer.diagnosticsTimer = this.setTimer(() => {
      peer.diagnosticsTimer = null;
      void this.#sampleDiagnostics(peer);
    }, this.diagnosticsIntervalMs);
  }

  #clearDiagnosticsTimer(peer) {
    if (!peer.diagnosticsTimer) return;
    this.clearTimer(peer.diagnosticsTimer);
    peer.diagnosticsTimer = null;
  }

  async #sampleDiagnostics(peer) {
    if (this.peers.get(peer.remoteParticipantId) !== peer || !peer.connection.getStats) return;
    try {
      const report = await peer.connection.getStats();
      if (this.peers.get(peer.remoteParticipantId) !== peer) return;
      this.onPeerDiagnostics({
        participantId: peer.remoteParticipantId,
        diagnostics: summarizeWebRtcStats(report),
      });
    } catch {
      // Local diagnostics are best-effort only. Connection status remains the source of truth.
    } finally {
      if (this.peers.get(peer.remoteParticipantId) === peer) this.#startDiagnostics(peer);
    }
  }

  #emitPeerStatus(peer, status) {
    peer.status = status;
    this.onPeerStatus({ participantId: peer.remoteParticipantId, status });
  }

  #cleanupPeer(peer) {
    this.#clearProgressTimer(peer);
    this.#clearDiagnosticsTimer(peer);
    peer.queuedIceCandidates = [];
    peer.operationQueue = Promise.resolve();
    peer.connection.onicecandidate = null;
    peer.connection.ontrack = null;
    peer.connection.oniceconnectionstatechange = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.close();
    this.#emitRemoteStream(peer, null);
    this.#emitPeerStatus(peer, null);
    this.onPeerDiagnostics({ participantId: peer.remoteParticipantId, diagnostics: null });
  }
}

export function iceUfragFromDescription(description) {
  if (!description?.sdp) return null;
  return /^a=ice-ufrag:(.+)$/m.exec(description.sdp)?.[1]?.trim() ?? null;
}

export function summarizeWebRtcStats(statsReport) {
  const reports = [...statsReport.values?.() ?? []];
  const selectedPair = reports.find((report) => (
    report.type === 'candidate-pair'
    && (report.selected || report.nominated || report.state === 'succeeded')
  )) ?? null;
  const localCandidate = reports.find((report) => report.id === selectedPair?.localCandidateId) ?? null;
  const remoteCandidate = reports.find((report) => report.id === selectedPair?.remoteCandidateId) ?? null;
  const inboundRtp = reports.filter((report) => report.type === 'inbound-rtp');
  const packetsLost = sumFinite(inboundRtp.map((report) => report.packetsLost));
  const packetsReceived = sumFinite(inboundRtp.map((report) => report.packetsReceived));
  const totalPackets = packetsLost + packetsReceived;
  const framesPerSecond = firstFinite(reports.map((report) => report.kind === 'video' || report.mediaType === 'video' ? report.framesPerSecond : null));
  const rttSeconds = firstFinite([selectedPair?.currentRoundTripTime, selectedPair?.roundTripTime]);

  return {
    rttMs: rttSeconds === null ? null : Math.round(rttSeconds * 1000),
    packetLossPercent: totalPackets > 0 ? Math.round((packetsLost / totalPackets) * 1000) / 10 : null,
    framesPerSecond: framesPerSecond === null ? null : Math.round(framesPerSecond),
    localCandidateType: safeCandidateType(localCandidate?.candidateType),
    remoteCandidateType: safeCandidateType(remoteCandidate?.candidateType),
  };
}

function sumFinite(values) {
  return values.reduce((total, value) => (Number.isFinite(value) ? total + value : total), 0);
}

function firstFinite(values) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}

function safeCandidateType(candidateType) {
  return ['host', 'srflx', 'prflx', 'relay'].includes(candidateType) ? candidateType : null;
}
