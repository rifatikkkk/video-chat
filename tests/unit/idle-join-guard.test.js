import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_IDLE_JOIN_TIMEOUT_MS, IdleJoinGuard } from '../../server/src/socket/IdleJoinGuard.js';

describe('IdleJoinGuard', () => {
  it('disconnects sockets that do not join before the timeout', () => {
    const socket = { disconnect: vi.fn() };
    const scheduled = [];
    const guard = new IdleJoinGuard({
      setTimer: (callback, delay) => {
        const timer = { callback, delay, cleared: false };
        scheduled.push(timer);
        return timer;
      },
      clearTimer: (timer) => { timer.cleared = true; },
    });

    guard.watch(socket, () => false);

    expect(scheduled[0].delay).toBe(DEFAULT_IDLE_JOIN_TIMEOUT_MS);
    scheduled[0].callback();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('leaves joined sockets connected and clears timers on disconnect cleanup', () => {
    const socket = { disconnect: vi.fn() };
    const scheduled = [];
    const guard = new IdleJoinGuard({
      timeoutMs: 1_000,
      setTimer: (callback, delay) => {
        const timer = { callback, delay, cleared: false };
        scheduled.push(timer);
        return timer;
      },
      clearTimer: (timer) => { timer.cleared = true; },
    });

    const cleanup = guard.watch(socket, () => true);
    scheduled[0].callback();
    cleanup();

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(scheduled[0].cleared).toBe(true);
  });
});
