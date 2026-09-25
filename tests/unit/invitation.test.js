import { describe, expect, it } from 'vitest';
import { copyInvitation } from '../../client/src/clipboard/invitation.js';

describe('invitation copying', () => {
  it('copies the exact current room URL only after the Clipboard API resolves', async () => {
    const calls = [];
    await copyInvitation({ writeText: async (value) => calls.push(value) }, 'https://video.example/room/invite_123');
    expect(calls).toEqual(['https://video.example/room/invite_123']);
  });

  it('rejects when the browser cannot copy, allowing the UI to offer manual copying', async () => {
    await expect(copyInvitation(undefined, 'https://video.example/room/invite_123')).rejects.toThrow(/unavailable/);
  });
});
