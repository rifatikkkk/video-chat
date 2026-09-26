import { describe, expect, it } from 'vitest';
import { attachMediaElementStream } from '../../client/src/components/ParticipantGrid.jsx';

describe('attachMediaElementStream', () => {
  it('assigns a participant stream and clears it on cleanup', () => {
    const videoElement = { srcObject: null };
    const stream = { id: 'participant-stream' };

    const cleanup = attachMediaElementStream(videoElement, stream);

    expect(videoElement.srcObject).toBe(stream);
    cleanup();
    expect(videoElement.srcObject).toBeNull();
  });

  it('does not clear a stream replaced by a later render', () => {
    const videoElement = { srcObject: null };
    const previousStream = { id: 'previous' };
    const currentStream = { id: 'current' };

    const cleanup = attachMediaElementStream(videoElement, previousStream);
    videoElement.srcObject = currentStream;
    cleanup();

    expect(videoElement.srcObject).toBe(currentStream);
  });
});
