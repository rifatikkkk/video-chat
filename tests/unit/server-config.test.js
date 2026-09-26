import { describe, expect, it } from 'vitest';
import { loadServerConfig, validateMaxParticipants, validateOrigins, validatePort, validateShutdownGraceMs, validateStunUrls } from '../../server/src/config.js';

describe('server config', () => {
  it('loads validated defaults and configured values', () => {
    expect(loadServerConfig({ PORT: '3001', PUBLIC_ORIGIN: 'https://video.example.test', STUN_URLS: 'stun:one.example.test,turns:two.example.test', SHUTDOWN_GRACE_MS: '5000' })).toEqual({
      port: 3001,
      publicOrigins: ['https://video.example.test'],
      stunUrls: ['stun:one.example.test', 'turns:two.example.test'],
      shutdownGraceMs: 5000,
      limits: { maxParticipants: 4 },
    });
  });

  it('rejects invalid port, origin, STUN URL, participant limit, and shutdown grace settings', () => {
    expect(() => validatePort('0')).toThrow(/PORT/);
    expect(() => validateOrigins('https://video.example.test/path')).toThrow(/PUBLIC_ORIGIN/);
    expect(() => validateStunUrls('https://not-stun.example.test')).toThrow(/STUN_URLS/);
    expect(() => validateMaxParticipants('5')).toThrow(/MAX_PARTICIPANTS/);
    expect(() => validateShutdownGraceMs('999')).toThrow(/SHUTDOWN_GRACE_MS/);
  });

  it('keeps max participants fixed at four', () => {
    expect(validateMaxParticipants()).toBe(4);
    expect(loadServerConfig({}).limits.maxParticipants).toBe(4);
  });
});
