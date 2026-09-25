import { describe, expect, it } from 'vitest';
import { SlowConsumerGuard, getPendingPacketCount } from '../../server/src/socket/SlowConsumerGuard.js';

describe('SlowConsumerGuard', () => {
  it('uses the Engine.IO write buffer and disconnects only over the configured limit', () => {
    const socket = { conn: { writeBuffer: [{}, {}] }, disconnect: (close) => { socket.closedWith = close; } };
    const guard = new SlowConsumerGuard({ maxPendingPackets: 2 });

    expect(getPendingPacketCount(socket)).toBe(2);
    expect(guard.disconnectIfOverloaded(socket)).toBe(false);
    socket.conn.writeBuffer.push({});
    expect(guard.disconnectIfOverloaded(socket)).toBe(true);
    expect(socket.closedWith).toBe(true);
  });
});
