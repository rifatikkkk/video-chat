import { describe, expect, it, vi } from 'vitest';
import { PEER_CONNECTION_CONFIG, PeerManager } from '../../client/src/peers/PeerManager.js';

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
    close: vi.fn(),
    addTransceiver: vi.fn(function addTransceiver(kind, options) {
      this.transceivers.push({ kind, ...options });
    }),
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' })),
    createAnswer: vi.fn(async () => ({ type: 'answer', sdp: 'answer-sdp' })),
    setLocalDescription: vi.fn(async function setLocalDescription(description) {
      this.localDescription = description;
    }),
    setRemoteDescription: vi.fn(async function setRemoteDescription(description) {
      this.remoteDescription = description;
    }),
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
      { kind: 'audio', direction: 'sendrecv' },
      { kind: 'video', direction: 'sendrecv' },
    ]);
    expect(peer.connection.createOffer).toHaveBeenCalledTimes(1);
    expect(peer.connection.setLocalDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'offer-sdp' });
    expect(sendDescription).toHaveBeenCalledWith({ roomEpoch, toParticipantId: firstRemoteId, description: { type: 'offer', sdp: 'offer-sdp' } });
  });

  it('answers an incoming offer without adding duplicate media sections', async () => {
    const factory = createPeerConnectionFactory();
    const sendDescription = vi.fn(async () => ({ ok: true }));
    const manager = new PeerManager({ peerConnectionFactory: factory, sendDescription });

    manager.applySnapshot(snapshot([selfParticipantId, lowerRemoteId]));
    const peer = manager.getPeer(lowerRemoteId);
    manager.handleSignal({ roomEpoch, fromParticipantId: lowerRemoteId, description: { type: 'offer', sdp: 'remote-offer' } });
    await peer.operationQueue;

    expect(peer.connection.addTransceiver).not.toHaveBeenCalled();
    expect(peer.connection.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'remote-offer' });
    expect(peer.connection.createAnswer).toHaveBeenCalledTimes(1);
    expect(sendDescription).toHaveBeenCalledWith({ roomEpoch, toParticipantId: lowerRemoteId, description: { type: 'answer', sdp: 'answer-sdp' } });
  });

  it('applies an incoming answer on the existing offerer connection', async () => {
    const factory = createPeerConnectionFactory();
    const manager = new PeerManager({ peerConnectionFactory: factory, sendDescription: vi.fn(async () => ({ ok: true })) });

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId]));
    const peer = manager.getPeer(firstRemoteId);
    await peer.operationQueue;
    manager.handleSignal({ roomEpoch, fromParticipantId: firstRemoteId, description: { type: 'answer', sdp: 'remote-answer' } });
    await peer.operationQueue;

    expect(peer.connection.createOffer).toHaveBeenCalledTimes(1);
    expect(peer.connection.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'remote-answer' });
  });
});
