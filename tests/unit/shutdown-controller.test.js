import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SHUTDOWN_GRACE_MS, ShutdownController, installShutdownHandlers } from '../../server/src/shutdown/ShutdownController.js';

function createController(options = {}) {
  const scheduled = [];
  const io = { emit: vi.fn(), close: vi.fn((callback) => callback?.()) };
  const server = { close: vi.fn((callback) => callback?.()) };
  const readiness = { setAcceptingJoins: vi.fn() };
  const exit = vi.fn();
  const controller = new ShutdownController({
    io,
    server,
    readiness,
    exit,
    logger: { info: vi.fn(), error: vi.fn() },
    setTimer: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      scheduled.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cleared = true; },
    ...options,
  });
  return { controller, exit, io, readiness, scheduled, server };
}

describe('ShutdownController', () => {
  it('marks readiness false, announces maintenance, and closes after the grace period', () => {
    const { controller, exit, io, readiness, scheduled, server } = createController();

    expect(controller.begin({ signal: 'SIGTERM' })).toBe(true);

    expect(readiness.setAcceptingJoins).toHaveBeenCalledWith(false);
    expect(io.emit).toHaveBeenCalledWith('server:closing', { v: 1, reason: 'maintenance' });
    expect(scheduled[0].delay).toBe(DEFAULT_SHUTDOWN_GRACE_MS);

    scheduled[0].callback();

    expect(io.close).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('ignores repeated shutdown signals', () => {
    const { controller, scheduled } = createController({ graceMs: 2_000 });

    expect(controller.begin({ signal: 'SIGTERM' })).toBe(true);
    expect(controller.begin({ signal: 'SIGINT' })).toBe(false);

    expect(scheduled).toHaveLength(1);
  });

  it('installs SIGTERM and SIGINT handlers', () => {
    const handlers = new Map();
    const processLike = {
      once: (signal, handler) => handlers.set(signal, handler),
      off: (signal, handler) => { if (handlers.get(signal) === handler) handlers.delete(signal); },
    };
    const controller = { begin: vi.fn() };

    const uninstall = installShutdownHandlers({ processLike, controller });
    handlers.get('SIGTERM')('SIGTERM');
    uninstall();

    expect(controller.begin).toHaveBeenCalledWith({ signal: 'SIGTERM', reason: 'maintenance' });
    expect(handlers.size).toBe(0);
  });
});
