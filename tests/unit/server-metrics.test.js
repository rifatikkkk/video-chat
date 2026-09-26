import { describe, expect, it } from 'vitest';
import { ServerMetrics } from '../../server/src/metrics/ServerMetrics.js';
import { RoomRegistry } from '../../server/src/rooms/RoomRegistry.js';

describe('ServerMetrics', () => {
  it('reports anonymized registry, memory, lag, join failure, and rate limit counters', () => {
    let now = 0;
    let tick;
    const metrics = new ServerMetrics({
      now: () => now,
      setTimer: (callback) => { tick = callback; return 'timer'; },
      clearTimer: () => {},
    });
    const registry = new RoomRegistry({ roomIdGenerator: () => 'room-one', uuidGenerator: () => crypto.randomUUID() });
    registry.createAndJoin({ socketId: 'socket-one', displayName: 'Анна' });
    metrics.recordJoinFailure();
    metrics.recordRateLimit();
    now = 1_050;
    tick();

    expect(metrics.snapshot({ registry, memoryUsage: { heapUsed: 10, rss: 20 } })).toEqual({
      rooms: 1,
      participants: 1,
      memory: { heapUsedBytes: 10, rssBytes: 20 },
      eventLoopLagMs: 50,
      historyBytes: expect.any(Number),
      historyEntries: 1,
      joinFailures: 1,
      rateLimited: 1,
    });
  });
});
