import { describe, expect, it, vi } from 'vitest';
import { ICE_CANDIDATE_QUEUE_TTL_MS, MAX_QUEUED_ICE_CANDIDATES, PEER_CONNECTION_CONFIG, PeerManager, iceUfragFromDescription } from '../../client/src/peers/PeerManager.js';

const selfParticipantId = '00000000-0000-4000-8000-000000000001';
const firstRemoteId = '00000000-0000-4000-8000-000000000002';
const secondRemoteId = '00000000-0000-4000-8000-000000000003';
const thirdRemoteId = '00000000-0000-4000-8000-000000000004';
const fourthRemoteId = '00000000-0000-4000-8000-000000000005';
const lowerRemoteId = '00000000-0000-4000-8000-000000000000';
const roomEpoch = '10000000-0000-4000-8000-000000000001';
const staleEpoch = '10000000-0000-4000-8000-000000000002';

function createPeerConnectionFactory() {
  const connections = [];
  const factory = vi.fn((config) => {
    const connection = createPeerConnection(config);
    connections.push(connection);
    return connection;
  });
  factory.connections = connections;
  return factory;
}

function createPeerConnection(config) {
  return {
    config,
    transceivers: [],
    localDescription: null,
    remoteDescription: null,
    signalingState: 'stable',
    onicecandidate: null,
    close: vi.fn(),
    addTransceiver: vi.fn(function addTransceiver(kind, options) {
      const sender = { kind, replaceTrack: vi.fn(async (track) => { sender.track = track; }) };
      const transceiver = { kind, sender, ...options };
      this.transceivers.push(transceiver);
      return transceiver;
    }),
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: sdpWithUfrag('offer-ufrag') })),
    createAnswer: vi.fn(async () => ({ type: 'answer', sdp: sdpWithUfrag('answer-ufrag') })),
    setLocalDescription: vi.fn(async function setLocalDescription(description) {
      if (description.type === 'rollback') {
        this.signalingState = 'stable';
        this.localDescription = null;
        return;
      }
      this.localDescription = description;
      this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
    }),
    setRemoteDescription: vi.fn(async function setRemoteDescription(description) {
      this.remoteDescription = description;
      this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    }),
    addIceCandidate: vi.fn(async function addIceCandidate(candidate) {
      this.appliedCandidates ??= [];
      this.appliedCandidates.push(candidate);
    }),
  };
}

function sdpWithUfrag(ufrag) {
  return `v=0\r\na=ice-ufrag:${ufrag}\r\n`;
}

function createStream(id) {
  const tracks = [];
  return {
    id,
    addTrack: vi.fn((track) => tracks.push(track)),
    getTracks: vi.fn(() => tracks),
  };
}

function snapshot(participantIds) {
  return {
    roomEpoch,
    selfParticipantId,
    participants: participantIds.map((participantId) => ({ participantId })),
  };
}

function joined(participantId, epoch = roomEpoch) {
  return { roomEpoch: epoch, kind: 'participant-joined', payload: { participant: { participantId } } };
}

function left(participantId, epoch = roomEpoch) {
  return { roomEpoch: epoch, kind: 'participant-left', payload: { participantId } };
}

describe('PeerManager', () => {
  it('creates one peer connection per epoch and remote participant with Google STUN only', async () => {
    const factory = createPeerConnectionFactory();
    const manager = new PeerManager({ peerConnectionFactory: factory });

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId]));
    await manager.getPeer(firstRemoteId).operationQueue;
    manager.handleRoomEvent(joined(firstRemoteId));

    expect(manager.getPeers()).toHaveLength(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(PEER_CONNECTION_CONFIG);
    expect(PEER_CONNECTION_CONFIG.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
    expect(manager.getPeer(firstRemoteId)).toMatchObject({ roomEpoch, remoteParticipantId: firstRemoteId, offerer: true, polite: false });
  });

  it('derives offerer and polite roles deterministically from participant UUID order', async () => {
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory() });

    manager.applySnapshot(snapshot([selfParticipantId, lowerRemoteId, firstRemoteId]));
    await Promise.all(manager.getPeers().map((peer) => peer.operationQueue));

    expect(manager.getPeer(lowerRemoteId)).toMatchObject({ offerer: false, polite: true });
    expect(manager.getPeer(firstRemoteId)).toMatchObject({ offerer: true, polite: false });
  });

  it('caps a tab at three peer connections', async () => {
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory() });

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId, secondRemoteId, thirdRemoteId, fourthRemoteId]));
    await Promise.all(manager.getPeers().map((peer) => peer.operationQueue));

    expect(manager.getPeers().map(({ remoteParticipantId }) => remoteParticipantId)).toEqual([firstRemoteId, secondRemoteId, thirdRemoteId]);
  });

  it('closes only the leaving participant peer and tombstones its late signals', async () => {
    const factory = createPeerConnectionFactory();
    const manager = new PeerManager({ peerConnectionFactory: factory });
    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId, secondRemoteId]));
    await Promise.all(manager.getPeers().map((peer) => peer.operationQueue));

    manager.handleRoomEvent(left(firstRemoteId));
    manager.handleSignal({ roomEpoch, fromParticipantId: firstRemoteId, description: { type: 'offer', sdp: 'late' } });
    manager.handleSignal({ roomEpoch, fromParticipantId: secondRemoteId, description: { type: 'offer', sdp: 'current' } });
    await manager.getPeer(secondRemoteId).operationQueue;

    expect(factory.connections[0].close).toHaveBeenCalledTimes(1);
    expect(factory.connections[1].close).not.toHaveBeenCalled();
    expect(manager.getPeer(firstRemoteId)).toBeNull();
    expect(manager.getPeer(secondRemoteId)).not.toBeNull();
    expect(manager.signalLog).toEqual([expect.objectContaining({ fromParticipantId: secondRemoteId })]);
  });

  it('ignores stale epoch room events and signals', () => {
    const factory = createPeerConnectionFactory();
    const manager = new PeerManager({ peerConnectionFactory: factory });
    manager.applySnapshot(snapshot([selfParticipantId]));

    manager.handleRoomEvent(joined(firstRemoteId, staleEpoch));
    manager.handleSignal({ roomEpoch: staleEpoch, fromParticipantId: firstRemoteId, description: { type: 'offer', sdp: 'stale' } });

    expect(manager.getPeers()).toEqual([]);
    expect(manager.signalLog).toEqual([]);
  });

  it('starts initial offer negotiation with exactly audio and video sendrecv transceivers', async () => {
    const factory = createPeerConnectionFactory();
    const sendDescription = vi.fn(async () => ({ ok: true }));
    const manager = new PeerManager({ peerConnectionFactory: factory, sendDescription });

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId]));
    const peer = manager.getPeer(firstRemoteId);
    await peer.operationQueue;

    expect(peer.connection.addTransceiver).toHaveBeenCalledTimes(2);
    expect(peer.connection.transceivers).toEqual([
      expect.objectContaining({ kind: 'audio', direction: 'sendrecv' }),
      expect.objectContaining({ kind: 'video', direction: 'sendrecv' }),
    ]);
    expect(peer.connection.createOffer).toHaveBeenCalledTimes(1);
    expect(peer.connection.setLocalDescription).toHaveBeenCalledWith({ type: 'offer', sdp: sdpWithUfrag('offer-ufrag') });
    expect(sendDescription).toHaveBeenCalledWith({ roomEpoch, toParticipantId: firstRemoteId, description: { type: 'offer', sdp: sdpWithUfrag('offer-ufrag') } });
  });

  it('answers an incoming offer without adding duplicate media sections', async () => {
    const factory = createPeerConnectionFactory();
    const sendDescription = vi.fn(async () => ({ ok: true }));
    const manager = new PeerManager({ peerConnectionFactory: factory, sendDescription });

    manager.applySnapshot(snapshot([selfParticipantId, lowerRemoteId]));
    const peer = manager.getPeer(lowerRemoteId);
    manager.handleSignal({ roomEpoch, fromParticipantId: lowerRemoteId, description: { type: 'offer', sdp: sdpWithUfrag('remote-offer') } });
    await peer.operationQueue;

    expect(peer.connection.addTransceiver).not.toHaveBeenCalled();
    expect(peer.connection.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: sdpWithUfrag('remote-offer') });
    expect(peer.connection.createAnswer).toHaveBeenCalledTimes(1);
    expect(sendDescription).toHaveBeenCalledWith({ roomEpoch, toParticipantId: lowerRemoteId, description: { type: 'answer', sdp: sdpWithUfrag('answer-ufrag') } });
  });

  it('applies an incoming answer on the existing offerer connection', async () => {
    const factory = createPeerConnectionFactory();
    const manager = new PeerManager({ peerConnectionFactory: factory, sendDescription: vi.fn(async () => ({ ok: true })) });

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId]));
    const peer = manager.getPeer(firstRemoteId);
    await peer.operationQueue;
    manager.handleSignal({ roomEpoch, fromParticipantId: firstRemoteId, description: { type: 'answer', sdp: sdpWithUfrag('remote-answer') } });
    await peer.operationQueue;

    expect(peer.connection.createOffer).toHaveBeenCalledTimes(1);
    expect(peer.connection.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: sdpWithUfrag('remote-answer') });
  });

  it('routes local trickle ICE candidates and the null marker with the local ufrag', async () => {
    const sendCandidate = vi.fn(async () => ({ ok: true }));
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory(), sendCandidate });

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId]));
    const peer = manager.getPeer(firstRemoteId);
    await peer.operationQueue;
    peer.connection.onicecandidate({ candidate: { candidate: 'candidate:1', usernameFragment: 'ignored-by-us' } });
    peer.connection.onicecandidate({ candidate: null });

    expect(sendCandidate).toHaveBeenCalledWith({ roomEpoch, toParticipantId: firstRemoteId, iceUfrag: 'offer-ufrag', candidate: { candidate: 'candidate:1', usernameFragment: 'ignored-by-us' } });
    expect(sendCandidate).toHaveBeenCalledWith({ roomEpoch, toParticipantId: firstRemoteId, iceUfrag: 'offer-ufrag', candidate: null });
  });

  it('queues ICE before remote SDP and applies it after a matching description', async () => {
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory() });

    manager.applySnapshot(snapshot([selfParticipantId, lowerRemoteId]));
    const peer = manager.getPeer(lowerRemoteId);
    manager.handleSignal({ roomEpoch, fromParticipantId: lowerRemoteId, iceUfrag: 'remote-offer', candidate: { candidate: 'candidate:queued' } });
    await peer.operationQueue;
    manager.handleSignal({ roomEpoch, fromParticipantId: lowerRemoteId, description: { type: 'offer', sdp: sdpWithUfrag('remote-offer') } });
    await peer.operationQueue;

    expect(peer.connection.addIceCandidate).toHaveBeenCalledWith({ candidate: 'candidate:queued' });
  });

  it('drops overflowing queued ICE candidates locally for one pair', async () => {
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory() });

    manager.applySnapshot(snapshot([selfParticipantId, lowerRemoteId]));
    const peer = manager.getPeer(lowerRemoteId);
    for (let index = 0; index < MAX_QUEUED_ICE_CANDIDATES + 1; index += 1) {
      manager.handleSignal({ roomEpoch, fromParticipantId: lowerRemoteId, iceUfrag: 'remote-offer', candidate: { candidate: `candidate:${index}` } });
    }
    await peer.operationQueue;
    manager.handleSignal({ roomEpoch, fromParticipantId: lowerRemoteId, description: { type: 'offer', sdp: sdpWithUfrag('remote-offer') } });
    await peer.operationQueue;

    expect(peer.connection.addIceCandidate).toHaveBeenCalledTimes(MAX_QUEUED_ICE_CANDIDATES);
    expect(peer.connection.addIceCandidate).not.toHaveBeenCalledWith({ candidate: `candidate:${MAX_QUEUED_ICE_CANDIDATES}` });
  });

  it('drops queued ICE after timeout and stale-generation ICE after SDP', async () => {
    let now = 1_000;
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory(), now: () => now });

    manager.applySnapshot(snapshot([selfParticipantId, lowerRemoteId]));
    const peer = manager.getPeer(lowerRemoteId);
    manager.handleSignal({ roomEpoch, fromParticipantId: lowerRemoteId, iceUfrag: 'remote-offer', candidate: { candidate: 'candidate:expired' } });
    await peer.operationQueue;
    now += ICE_CANDIDATE_QUEUE_TTL_MS + 1;
    manager.handleSignal({ roomEpoch, fromParticipantId: lowerRemoteId, description: { type: 'offer', sdp: sdpWithUfrag('remote-offer') } });
    await peer.operationQueue;
    manager.handleSignal({ roomEpoch, fromParticipantId: lowerRemoteId, iceUfrag: 'stale-offer', candidate: { candidate: 'candidate:stale' } });
    await peer.operationQueue;

    expect(peer.connection.addIceCandidate).not.toHaveBeenCalledWith({ candidate: 'candidate:expired' });
    expect(peer.connection.addIceCandidate).not.toHaveBeenCalledWith({ candidate: 'candidate:stale' });
  });

  it('parses ICE ufrag from SDP descriptions', () => {
    expect(iceUfragFromDescription({ sdp: 'v=0\r\na=ice-ufrag:abc123\r\n' })).toBe('abc123');
    expect(iceUfragFromDescription({ sdp: 'v=0\r\n' })).toBeNull();
  });

  it('shares live local audio and video tracks across up to three peer senders', async () => {
    const audioTrack = { kind: 'audio', id: 'audio-1' };
    const videoTrack = { kind: 'video', id: 'video-1' };
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory() });

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId, secondRemoteId, thirdRemoteId]));
    await Promise.all(manager.getPeers().map((peer) => peer.operationQueue));
    await manager.setLocalTrack('audio', audioTrack);
    await manager.setLocalTrack('video', videoTrack);

    for (const peer of manager.getPeers()) {
      expect(peer.senders.audio.replaceTrack).toHaveBeenCalledWith(audioTrack);
      expect(peer.senders.video.replaceTrack).toHaveBeenCalledWith(videoTrack);
    }
  });

  it('attaches existing local tracks when a new peer is created', async () => {
    const audioTrack = { kind: 'audio', id: 'audio-1' };
    const videoTrack = { kind: 'video', id: 'video-1' };
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory() });

    manager.applySnapshot(snapshot([selfParticipantId]));
    await manager.setLocalTrack('audio', audioTrack);
    await manager.setLocalTrack('video', videoTrack);
    manager.handleRoomEvent(joined(firstRemoteId));
    const peer = manager.getPeer(firstRemoteId);
    await peer.operationQueue;

    expect(peer.senders.audio.replaceTrack).toHaveBeenCalledWith(audioTrack);
    expect(peer.senders.video.replaceTrack).toHaveBeenCalledWith(videoTrack);
  });

  it('detaches a stopped camera from every sender with replaceTrack(null)', async () => {
    const videoTrack = { kind: 'video', id: 'video-1' };
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory() });

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId, secondRemoteId]));
    await Promise.all(manager.getPeers().map((peer) => peer.operationQueue));
    await manager.setLocalTrack('video', videoTrack);
    await manager.setLocalTrack('video', null);

    for (const peer of manager.getPeers()) {
      expect(peer.senders.video.replaceTrack).toHaveBeenCalledWith(null);
    }
  });

  it('falls back to renegotiation when replaceTrack fails without stopping other peers', async () => {
    const sendDescription = vi.fn(async () => ({ ok: true }));
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory(), sendDescription });
    const nextTrack = { kind: 'video', id: 'video-2' };

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId, secondRemoteId]));
    await Promise.all(manager.getPeers().map((peer) => peer.operationQueue));
    const failingPeer = manager.getPeer(firstRemoteId);
    const healthyPeer = manager.getPeer(secondRemoteId);
    sendDescription.mockClear();
    failingPeer.senders.video.replaceTrack.mockRejectedValueOnce(new Error('replace failed'));

    await manager.setLocalTrack('video', nextTrack);

    expect(failingPeer.senders.video.replaceTrack).toHaveBeenCalledWith(nextTrack);
    expect(healthyPeer.senders.video.replaceTrack).toHaveBeenCalledWith(nextTrack);
    expect(sendDescription).toHaveBeenCalledWith({ roomEpoch, toParticipantId: firstRemoteId, description: { type: 'offer', sdp: sdpWithUfrag('offer-ufrag') } });
    expect(manager.getPeer(secondRemoteId)).toBe(healthyPeer);
  });

  it('rolls back a polite peer on offer collision and sends an answer', async () => {
    const sendDescription = vi.fn(async () => ({ ok: true }));
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory(), sendDescription });

    manager.applySnapshot(snapshot([selfParticipantId, lowerRemoteId]));
    const peer = manager.getPeer(lowerRemoteId);
    peer.connection.signalingState = 'have-local-offer';
    manager.handleSignal({ roomEpoch, fromParticipantId: lowerRemoteId, description: { type: 'offer', sdp: sdpWithUfrag('remote-collision') } });
    await peer.operationQueue;

    expect(peer.connection.setLocalDescription).toHaveBeenCalledWith({ type: 'rollback' });
    expect(peer.connection.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: sdpWithUfrag('remote-collision') });
    expect(sendDescription).toHaveBeenCalledWith({ roomEpoch, toParticipantId: lowerRemoteId, description: { type: 'answer', sdp: sdpWithUfrag('answer-ufrag') } });
    expect(peer.connection.signalingState).toBe('stable');
  });

  it('ignores an impolite collided offer and drops its related ICE', async () => {
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory() });

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId]));
    const peer = manager.getPeer(firstRemoteId);
    await peer.operationQueue;
    peer.connection.signalingState = 'have-local-offer';
    manager.handleSignal({ roomEpoch, fromParticipantId: firstRemoteId, description: { type: 'offer', sdp: sdpWithUfrag('ignored-offer') } });
    manager.handleSignal({ roomEpoch, fromParticipantId: firstRemoteId, iceUfrag: 'ignored-offer', candidate: { candidate: 'candidate:ignored' } });
    await peer.operationQueue;

    expect(peer.connection.setRemoteDescription).not.toHaveBeenCalledWith({ type: 'offer', sdp: sdpWithUfrag('ignored-offer') });
    expect(peer.connection.addIceCandidate).not.toHaveBeenCalledWith({ candidate: 'candidate:ignored' });
    expect(peer.queuedIceCandidates).toEqual([]);
  });

  it('keeps other peers alive when one SDP operation fails', async () => {
    const factory = createPeerConnectionFactory();
    const manager = new PeerManager({ peerConnectionFactory: factory });

    manager.applySnapshot(snapshot([selfParticipantId, lowerRemoteId, firstRemoteId]));
    await Promise.all(manager.getPeers().map((peer) => peer.operationQueue));
    const failingPeer = manager.getPeer(lowerRemoteId);
    const healthyPeer = manager.getPeer(firstRemoteId);
    failingPeer.connection.setRemoteDescription.mockRejectedValueOnce(new Error('bad sdp'));

    manager.handleSignal({ roomEpoch, fromParticipantId: lowerRemoteId, description: { type: 'offer', sdp: sdpWithUfrag('bad-offer') } });
    manager.handleSignal({ roomEpoch, fromParticipantId: firstRemoteId, description: { type: 'answer', sdp: sdpWithUfrag('healthy-answer') } });
    await Promise.all(manager.getPeers().map((peer) => peer.operationQueue));

    expect(healthyPeer.connection.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: sdpWithUfrag('healthy-answer') });
    expect(manager.getPeer(lowerRemoteId)).toBe(failingPeer);
    expect(manager.getPeer(firstRemoteId)).toBe(healthyPeer);
  });

  it('stores one remote MediaStream per participant and uses event.streams when present', async () => {
    const onRemoteStream = vi.fn();
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory(), onRemoteStream });
    const remoteStream = createStream('remote-stream');
    const videoTrack = { kind: 'video', id: 'video-remote' };
    const audioTrack = { kind: 'audio', id: 'audio-remote' };

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId]));
    const peer = manager.getPeer(firstRemoteId);
    peer.connection.ontrack({ track: videoTrack, streams: [remoteStream] });
    peer.connection.ontrack({ track: audioTrack, streams: [remoteStream] });

    expect(peer.remoteStream).toBe(remoteStream);
    expect(remoteStream.addTrack).toHaveBeenCalledWith(videoTrack);
    expect(remoteStream.addTrack).toHaveBeenCalledWith(audioTrack);
    expect(onRemoteStream).toHaveBeenLastCalledWith({ participantId: firstRemoteId, stream: remoteStream });
  });

  it('creates a fallback remote MediaStream when ontrack has no streams and clears it on leave', () => {
    const fallbackStream = createStream('fallback-stream');
    const onRemoteStream = vi.fn();
    const manager = new PeerManager({
      peerConnectionFactory: createPeerConnectionFactory(),
      createMediaStream: vi.fn(() => fallbackStream),
      onRemoteStream,
    });
    const videoTrack = { kind: 'video', id: 'video-remote' };

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId]));
    const peer = manager.getPeer(firstRemoteId);
    peer.connection.ontrack({ track: videoTrack, streams: [] });

    expect(peer.remoteStream).toBe(fallbackStream);
    expect(fallbackStream.addTrack).toHaveBeenCalledWith(videoTrack);

    manager.handleRoomEvent(left(firstRemoteId));

    expect(onRemoteStream).toHaveBeenLastCalledWith({ participantId: firstRemoteId, stream: null });
  });
});
