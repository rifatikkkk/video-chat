import { describe, expect, it } from 'vitest';
import { checkBrowserEnvironment } from '../../client/src/environment/preflight.js';

const supportedBrowser = {
  isSecureContext: true,
  RTCPeerConnection: class {},
  navigator: { mediaDevices: { getUserMedia() {} } },
  crypto: { randomUUID() {} },
};

describe('browser preflight', () => {
  it('accepts the required secure WebRTC and media APIs', () => {
    expect(checkBrowserEnvironment(supportedBrowser)).toEqual({ ok: true });
  });

  it('explains unsupported environments before any session can be created', () => {
    expect(checkBrowserEnvironment({ ...supportedBrowser, isSecureContext: false })).toMatchObject({ ok: false, message: expect.stringMatching(/HTTPS/) });
    expect(checkBrowserEnvironment({ ...supportedBrowser, RTCPeerConnection: undefined })).toMatchObject({ ok: false, message: expect.stringMatching(/WebRTC/) });
    expect(checkBrowserEnvironment({ ...supportedBrowser, navigator: {} })).toMatchObject({ ok: false, message: expect.stringMatching(/камере/) });
  });
});
