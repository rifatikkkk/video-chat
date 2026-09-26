export const DEFAULT_IDLE_JOIN_TIMEOUT_MS = 30_000;

export class IdleJoinGuard {
  constructor({ timeoutMs = DEFAULT_IDLE_JOIN_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.timeoutMs = timeoutMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
  }

  watch(socket, isJoined) {
    if (this.timeoutMs <= 0) return () => {};
    const timer = this.setTimer(() => {
      if (!isJoined()) socket.disconnect(true);
    }, this.timeoutMs);
    return () => this.clearTimer(timer);
  }
}
