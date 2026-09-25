import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../../shared/protocol.js';

describe('protocol bootstrap', () => {
  it('exposes the initial protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
