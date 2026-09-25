export const AUDIO_CONSTRAINTS = Object.freeze({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
export const VIDEO_CONSTRAINTS = Object.freeze({ width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } });

export class MediaController {
  constructor({ mediaDevices = globalThis.navigator?.mediaDevices, onStateChange = () => {} } = {}) {
    this.mediaDevices = mediaDevices;
    this.onStateChange = onStateChange;
    this.tracks = { audio: null, video: null };
    this.state = { audio: 'off', video: 'off', audioError: null, videoError: null };
    this.disposed = false;
  }

  start() {
    return Promise.allSettled([this.startAudio(), this.startVideo()]);
  }

  async startAudio() {
    return this.#capture('audio', { audio: AUDIO_CONSTRAINTS, video: false });
  }

  async startVideo() {
    return this.#capture('video', { audio: false, video: VIDEO_CONSTRAINTS });
  }

  getState() {
    return { ...this.state };
  }

  getTrack(kind) {
    return this.tracks[kind];
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const track of Object.values(this.tracks)) track?.stop();
    this.tracks = { audio: null, video: null };
    this.#setState({ audio: 'off', video: 'off' });
  }

  async #capture(kind, constraints) {
    if (this.disposed) return null;
    this.#setState({ [kind]: 'pending', [`${kind}Error`]: null });
    try {
      const stream = await this.mediaDevices.getUserMedia(constraints);
      const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
      if (this.disposed) {
        stream.getTracks().forEach((lateTrack) => lateTrack.stop());
        return null;
      }
      if (!track) throw new Error(`No ${kind} track returned.`);
      this.tracks[kind]?.stop();
      this.tracks[kind] = track;
      this.#setState({ [kind]: 'on' });
      return track;
    } catch (error) {
      if (!this.disposed) this.#setState({ [kind]: 'off', [`${kind}Error`]: error.name ?? 'MediaError' });
      return null;
    }
  }

  #setState(update) {
    this.state = { ...this.state, ...update };
    this.onStateChange(this.getState());
  }
}
