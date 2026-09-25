import { describe, expect, it } from 'vitest';
import { AUDIO_CONSTRAINTS, MediaController, VIDEO_CONSTRAINTS } from '../../client/src/media/MediaController.js';

function stream(kind) {
  const track = { kind, stopCalls: 0, stop() { this.stopCalls += 1; } };
  return { track, getAudioTracks: () => kind === 'audio' ? [track] : [], getVideoTracks: () => kind === 'video' ? [track] : [], getTracks: () => [track] };
}

describe('MediaController', () => {
  it('requests audio and video independently with soft constraints', async () => {
    const calls = [];
    const audio = stream('audio');
    const video = stream('video');
    const controller = new MediaController({ mediaDevices: { getUserMedia: async (constraints) => { calls.push(constraints); return constraints.audio ? audio : video; } } });
    await controller.start();

    expect(calls).toEqual([{ audio: AUDIO_CONSTRAINTS, video: false }, { audio: false, video: VIDEO_CONSTRAINTS }]);
    expect(controller.getState()).toMatchObject({ audio: 'on', video: 'on' });
  });

  it('does not let an audio failure or pending prompt block video capture', async () => {
    const video = stream('video');
    const controller = new MediaController({ mediaDevices: { getUserMedia: async (constraints) => {
      if (constraints.audio) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      return video;
    } } });
    await Promise.all([controller.startAudio(), controller.startVideo()]);

    expect(controller.getState()).toMatchObject({ audio: 'off', audioError: 'NotAllowedError', video: 'on' });
  });

  it('stops acquired tracks once when disposed', async () => {
    const audio = stream('audio');
    const controller = new MediaController({ mediaDevices: { getUserMedia: async () => audio } });
    await controller.startAudio();
    controller.dispose();
    controller.dispose();
    expect(audio.track.stopCalls).toBe(1);
  });

  it('stops a late stream after disposal instead of reviving the device state', async () => {
    let resolveCapture;
    const late = stream('video');
    const controller = new MediaController({ mediaDevices: { getUserMedia: () => new Promise((resolve) => { resolveCapture = resolve; }) } });
    const pending = controller.startVideo();
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.dispose();
    resolveCapture(late);
    await pending;

    expect(late.track.stopCalls).toBe(1);
    expect(controller.getState().video).toBe('off');
  });

  it('invalidates a pending capture when the user stops that device', async () => {
    let resolveCapture;
    const late = stream('audio');
    const controller = new MediaController({ mediaDevices: { getUserMedia: () => new Promise((resolve) => { resolveCapture = resolve; }) } });
    const pending = controller.startAudio();
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.stopAudio();
    resolveCapture(late);
    await pending;

    expect(late.track.stopCalls).toBe(1);
    expect(controller.getState().audio).toBe('off');
  });
});
