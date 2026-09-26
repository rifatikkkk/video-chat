export const DEFAULT_SHUTDOWN_GRACE_MS = 10_000;

export class ShutdownController {
  constructor({
    io,
    server,
    readiness,
    graceMs = DEFAULT_SHUTDOWN_GRACE_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    exit = () => {},
    logger = console,
  }) {
    this.io = io;
    this.server = server;
    this.readiness = readiness;
    this.graceMs = graceMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.exit = exit;
    this.logger = logger;
    this.closing = false;
    this.timer = null;
  }

  begin({ signal = 'manual', reason = 'maintenance' } = {}) {
    if (this.closing) return false;
    this.closing = true;
    this.readiness.setAcceptingJoins(false);
    this.io.emit('server:closing', { v: 1, reason });
    this.logger.info?.(`Video Chat server shutdown started by ${signal}; closing sockets in ${this.graceMs} ms.`);
    this.timer = this.setTimer(() => this.#close(signal), this.graceMs);
    return true;
  }

  #close(signal) {
    this.timer = null;
    this.io.close(() => {
      this.server.close((error) => {
        if (error) {
          this.logger.error?.('Video Chat server shutdown failed.', error);
          this.exit(1);
          return;
        }
        this.logger.info?.(`Video Chat server shutdown completed after ${signal}.`);
        this.exit(0);
      });
    });
  }

  cancelTimerForTest() {
    if (!this.timer) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }
}

export function installShutdownHandlers({ processLike = process, controller }) {
  const handleSignal = (signal) => controller.begin({ signal, reason: 'maintenance' });
  processLike.once('SIGTERM', handleSignal);
  processLike.once('SIGINT', handleSignal);
  return () => {
    processLike.off?.('SIGTERM', handleSignal);
    processLike.off?.('SIGINT', handleSignal);
  };
}
