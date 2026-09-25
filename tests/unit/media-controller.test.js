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

  it('toggles a live microphone without a new capture and recaptures it when absent', async () => {
    const audio = stream('audio');
    const calls = [];
    const controller = new MediaController({ mediaDevices: { getUserMedia: async (constraints) => { calls.push(constraints); return audio; } } });
    await controller.startAudio();
    await controller.setMicEnabled(false);
    await controller.setMicEnabled(true);

    expect(audio.track.enabled).toBe(true);
    expect(calls).toHaveLength(1);
    controller.stopAudio();
    await controller.setMicEnabled(true);
    expect(calls).toHaveLength(2);
  });

  it('does not report microphone enabled if recapture fails', async () => {
    const controller = new MediaController({ mediaDevices: { getUserMedia: async () => { throw new Error('unavailable'); } } });
    await expect(controller.setMicEnabled(true)).resolves.toBe(false);
    expect(controller.getState().micEnabled).toBe(false);
  });

  it('stops video on camera off, recaptures a fresh track on on, and notifies peer subscribers', async () => {
    const first = stream('video');
    const second = stream('video');
    const streams = [first, second];
    const changes = [];
    const controller = new MediaController({ mediaDevices: { getUserMedia: async () => streams.shift() } });
    controller.subscribeTrackChanges((change) => changes.push(change));
    await controller.setCameraEnabled(true);
    await controller.setCameraEnabled(false);
    await controller.setCameraEnabled(true);

    expect(first.track.stopCalls).toBe(1);
    expect(controller.getTrack('video')).toBe(second.track);
    expect(controller.getState()).toMatchObject({ video: 'on', cameraEnabled: true });
    expect(changes).toEqual([
      { kind: 'video', track: first.track },
      { kind: 'video', track: null },
      { kind: 'video', track: second.track },
    ]);
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
