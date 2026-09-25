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
    const connection = { config, close: vi.fn() };
    connections.push(connection);
    return connection;
  });
  factory.connections = connections;
  return factory;
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
  it('creates one peer connection per epoch and remote participant with Google STUN only', () => {
    const factory = createPeerConnectionFactory();
    const manager = new PeerManager({ peerConnectionFactory: factory });

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId]));
    manager.handleRoomEvent(joined(firstRemoteId));

    expect(manager.getPeers()).toHaveLength(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(PEER_CONNECTION_CONFIG);
    expect(PEER_CONNECTION_CONFIG.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
    expect(manager.getPeer(firstRemoteId)).toMatchObject({ roomEpoch, remoteParticipantId: firstRemoteId, offerer: true, polite: false });
  });

  it('derives offerer and polite roles deterministically from participant UUID order', () => {
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory() });

    manager.applySnapshot(snapshot([selfParticipantId, lowerRemoteId, firstRemoteId]));

    expect(manager.getPeer(lowerRemoteId)).toMatchObject({ offerer: false, polite: true });
    expect(manager.getPeer(firstRemoteId)).toMatchObject({ offerer: true, polite: false });
  });

  it('caps a tab at three peer connections', () => {
    const manager = new PeerManager({ peerConnectionFactory: createPeerConnectionFactory() });

    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId, secondRemoteId, thirdRemoteId, fourthRemoteId]));

    expect(manager.getPeers().map(({ remoteParticipantId }) => remoteParticipantId)).toEqual([firstRemoteId, secondRemoteId, thirdRemoteId]);
  });

  it('closes only the leaving participant peer and tombstones its late signals', () => {
    const factory = createPeerConnectionFactory();
    const manager = new PeerManager({ peerConnectionFactory: factory });
    manager.applySnapshot(snapshot([selfParticipantId, firstRemoteId, secondRemoteId]));

    manager.handleRoomEvent(left(firstRemoteId));
    manager.handleSignal({ roomEpoch, fromParticipantId: firstRemoteId, description: { type: 'offer', sdp: 'late' } });
    manager.handleSignal({ roomEpoch, fromParticipantId: secondRemoteId, description: { type: 'offer', sdp: 'current' } });

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
});
