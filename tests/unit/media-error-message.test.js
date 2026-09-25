import { describe, expect, it } from 'vitest';
import { mediaErrorMessage } from '../../client/src/media/mediaErrorMessage.js';

describe('media error messages', () => {
  it('gives actionable Russian instructions without claiming an automatic retry', () => {
    expect(mediaErrorMessage('NotAllowedError', 'audio')).toMatch(/Разрешите/);
    expect(mediaErrorMessage('NotFoundError', 'video')).toMatch(/не найдены/);
    expect(mediaErrorMessage('NotReadableError', 'audio')).toMatch(/другие приложения/);
    expect(mediaErrorMessage('DEVICE_ENDED', 'video')).toMatch(/вручную/);
  });
});
