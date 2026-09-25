export const DEFAULT_MAX_PENDING_PACKETS = 100;

export function getPendingPacketCount(socket) {
  const writeBuffer = socket.conn?.writeBuffer;
  return Array.isArray(writeBuffer) ? writeBuffer.length : 0;
}

export class SlowConsumerGuard {
  constructor({ maxPendingPackets = DEFAULT_MAX_PENDING_PACKETS, getPendingPackets = getPendingPacketCount } = {}) {
    if (!Number.isInteger(maxPendingPackets) || maxPendingPackets < 1) throw new TypeError('maxPendingPackets must be a positive integer.');
    this.maxPendingPackets = maxPendingPackets;
    this.getPendingPackets = getPendingPackets;
  }

  disconnectIfOverloaded(socket) {
    if (this.getPendingPackets(socket) <= this.maxPendingPackets) return false;
    socket.disconnect(true);
    return true;
  }
}
