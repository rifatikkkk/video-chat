import { describe, expect, it, vi } from 'vitest';
import { attachSelfView } from '../../client/src/components/SelfView.jsx';

describe('attachSelfView', () => {
  it('assigns a muted self-view stream and clears the same stream on cleanup', () => {
    const videoElement = { muted: false, srcObject: null };
    const track = { kind: 'video' };
    const stream = { id: 'local-stream' };
    const createStream = vi.fn(() => stream);

    const cleanup = attachSelfView(videoElement, track, createStream);

    expect(createStream).toHaveBeenCalledWith([track]);
    expect(videoElement.muted).toBe(true);
    expect(videoElement.srcObject).toBe(stream);

    cleanup();

    expect(videoElement.srcObject).toBeNull();
  });

  it('does not clear a stream replaced by a newer render', () => {
    const videoElement = { srcObject: null };
    const previousStream = { id: 'previous' };
    const currentStream = { id: 'current' };

    const cleanup = attachSelfView(videoElement, { kind: 'video' }, () => previousStream);
    videoElement.srcObject = currentStream;

    cleanup();

    expect(videoElement.srcObject).toBe(currentStream);
  });

  it('clears the video element when no track is available', () => {
    const videoElement = { srcObject: { id: 'stale' } };

    const cleanup = attachSelfView(videoElement, null);

    expect(videoElement.srcObject).toBeNull();
    cleanup();
    expect(videoElement.srcObject).toBeNull();
  });
});
