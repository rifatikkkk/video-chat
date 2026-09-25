import { describe, expect, it } from 'vitest';
import { getRoomIdFromPath, joinErrorMessage } from '../../client/src/App.jsx';

describe('room entry routing', () => {
  it('recognizes only a single room ID path segment', () => {
    expect(getRoomIdFromPath('/')).toBeNull();
    expect(getRoomIdFromPath('/room/invite_123')).toBe('invite_123');
    expect(getRoomIdFromPath('/room/invite_123/extra')).toBeNull();
  });

  it('keeps a full room distinguishable and retryable', () => {
    expect(joinErrorMessage('ROOM_FULL')).toMatch(/заполнена/i);
    expect(joinErrorMessage('INVALID_ROOM_ID')).toMatch(/Некорректная/i);
  });
});
