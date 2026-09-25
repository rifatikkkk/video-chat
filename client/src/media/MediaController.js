export const AUDIO_CONSTRAINTS = Object.freeze({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
export const VIDEO_CONSTRAINTS = Object.freeze({ width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } });

export class MediaController {
  constructor({ mediaDevices = globalThis.navigator?.mediaDevices, onStateChange = () => {} } = {}) {
    this.mediaDevices = mediaDevices;
    this.onStateChange = onStateChange;
    this.tracks = { audio: null, video: null };
    this.state = { audio: 'off', video: 'off', micEnabled: false, audioError: null, videoError: null };
    this.disposed = false;
    this.generations = { audio: 0, video: 0 };
    this.queues = { audio: Promise.resolve(), video: Promise.resolve() };
  }

  start() {
    return Promise.allSettled([this.startAudio(), this.startVideo()]);
  }

  async startAudio() {
    return this.#scheduleCapture('audio', { audio: AUDIO_CONSTRAINTS, video: false });
  }

  async startVideo() {
    return this.#scheduleCapture('video', { audio: false, video: VIDEO_CONSTRAINTS });
  }

  getState() {
    return { ...this.state };
  }

  getTrack(kind) {
    return this.tracks[kind];
  }

  stopAudio() {
    this.#stop('audio');
  }

  stopVideo() {
    this.#stop('video');
  }

  async setMicEnabled(enabled) {
    if (!enabled) {
      if (this.tracks.audio) this.tracks.audio.enabled = false;
      this.#setState({ micEnabled: false });
      return true;
    }
    const currentTrack = this.tracks.audio;
    const track = currentTrack && currentTrack.readyState !== 'ended' ? currentTrack : await this.startAudio();
    if (!track) return false;
    track.enabled = true;
    this.#setState({ micEnabled: true });
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generations.audio += 1;
    this.generations.video += 1;
    this.#stopTrack('audio');
    this.#stopTrack('video');
    this.#setState({ audio: 'off', video: 'off', micEnabled: false });
  }

  #scheduleCapture(kind, constraints) {
    const generation = ++this.generations[kind];
    const capture = this.queues[kind].catch(() => null).then(() => this.#capture(kind, constraints, generation));
    this.queues[kind] = capture;
    return capture;
  }

  #stop(kind) {
    this.generations[kind] += 1;
    this.#stopTrack(kind);
    this.#setState({ [kind]: 'off', ...(kind === 'audio' ? { micEnabled: false } : {}), [`${kind}Error`]: null });
  }

  #stopTrack(kind) {
    this.tracks[kind]?.stop();
    this.tracks[kind] = null;
  }

  async #capture(kind, constraints, generation) {
    if (this.disposed || generation !== this.generations[kind]) return null;
    this.#setState({ [kind]: 'pending', [`${kind}Error`]: null });
    try {
      const stream = await this.mediaDevices.getUserMedia(constraints);
      const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
      if (this.disposed || generation !== this.generations[kind]) {
        stream.getTracks().forEach((lateTrack) => lateTrack.stop());
        return null;
      }
      if (!track) throw new Error(`No ${kind} track returned.`);
      this.#stopTrack(kind);
      this.tracks[kind] = track;
      if (kind === 'audio') track.enabled = true;
      this.#setState({ [kind]: 'on', ...(kind === 'audio' ? { micEnabled: true } : {}) });
      return track;
    } catch (error) {
      if (!this.disposed && generation === this.generations[kind]) this.#setState({ [kind]: 'off', ...(kind === 'audio' ? { micEnabled: false } : {}), [`${kind}Error`]: error.name ?? 'MediaError' });
      return null;
    }
  }

  #setState(update) {
    this.state = { ...this.state, ...update };
    this.onStateChange(this.getState());
  }
}
