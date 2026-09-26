import { describe, expect, it, vi } from 'vitest';
import { attachMediaElementStream, peerDiagnosticsMessage, peerStatusMessage } from '../../client/src/components/ParticipantGrid.jsx';

describe('attachMediaElementStream', () => {
  it('assigns a participant stream, starts playback, and clears it on cleanup', async () => {
    const videoElement = { srcObject: null, play: vi.fn(async () => {}) };
    const stream = { id: 'participant-stream' };

    const cleanup = await attachMediaElementStream(videoElement, stream);

    expect(videoElement.srcObject).toBe(stream);
    expect(videoElement.play).toHaveBeenCalledTimes(1);
    cleanup();
    expect(videoElement.srcObject).toBeNull();
  });

  it('does not clear a stream replaced by a later render', async () => {
    const videoElement = { srcObject: null, play: vi.fn(async () => {}) };
    const previousStream = { id: 'previous' };
    const currentStream = { id: 'current' };

    const cleanup = await attachMediaElementStream(videoElement, previousStream);
    videoElement.srcObject = currentStream;
    cleanup();

    expect(videoElement.srcObject).toBe(currentStream);
  });

  it('rejects when autoplay blocks playback while keeping the stream assigned', async () => {
    const videoElement = { srcObject: null, play: vi.fn(async () => { throw new Error('blocked'); }) };
    const stream = { id: 'blocked-stream' };

    await expect(attachMediaElementStream(videoElement, stream)).rejects.toThrow(/blocked/);

    expect(videoElement.srcObject).toBe(stream);
  });
});

describe('peerStatusMessage', () => {
  it('explains peer failures without implying room membership removal', () => {
    expect(peerStatusMessage('disconnected')).toMatch(/Чат работает/);
    expect(peerStatusMessage('failed')).toMatch(/выйдите и войдите снова/);
    expect(peerStatusMessage('stalled')).toMatch(/15 секунд/);
    expect(peerStatusMessage('connected')).toBe('');
  });
});

describe('peerDiagnosticsMessage', () => {
  it('formats safe WebRTC quality diagnostics without calling RTT end-to-end latency', () => {
    expect(peerDiagnosticsMessage({
      rttMs: 42,
      packetLossPercent: 2.5,
      framesPerSecond: 30,
      localCandidateType: 'relay',
      remoteCandidateType: 'srflx',
    })).toBe('RTT WebRTC: 42 мс · потери: 2.5% · FPS: 30 · ICE: relay/srflx');
    expect(peerDiagnosticsMessage(null)).toBe('');
  });
});
