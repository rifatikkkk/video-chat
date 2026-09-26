import { performance } from 'node:perf_hooks';

export class ServerMetrics {
  constructor({ now = () => performance.now(), setTimer = (callback, delay) => setInterval(callback, delay), clearTimer = (timer) => clearInterval(timer), lagIntervalMs = 1_000 } = {}) {
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.lagIntervalMs = lagIntervalMs;
    this.joinFailures = 0;
    this.rateLimited = 0;
    this.eventLoopLagMs = 0;
    this.lastTick = this.now();
    this.timer = this.setTimer(() => this.#sampleLag(), this.lagIntervalMs);
    this.timer.unref?.();
  }

  recordJoinFailure() {
    this.joinFailures += 1;
  }

  recordRateLimit() {
    this.rateLimited += 1;
  }

  snapshot({ registry, memoryUsage = process.memoryUsage() } = {}) {
    const registryMetrics = registry.getMetrics();
    return {
      rooms: registryMetrics.rooms,
      participants: registryMetrics.participants,
      memory: {
        heapUsedBytes: memoryUsage.heapUsed,
        rssBytes: memoryUsage.rss,
      },
      eventLoopLagMs: Math.max(0, Math.round(this.eventLoopLagMs)),
      historyBytes: registryMetrics.historyBytes,
      historyEntries: registryMetrics.historyEntries,
      joinFailures: this.joinFailures,
      rateLimited: this.rateLimited,
    };
  }

  dispose() {
    this.clearTimer(this.timer);
  }

  #sampleLag() {
    const current = this.now();
    this.eventLoopLagMs = Math.max(0, current - this.lastTick - this.lagIntervalMs);
    this.lastTick = current;
  }
}
