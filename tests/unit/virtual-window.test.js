import { describe, expect, it } from 'vitest';
import { CHAT_WINDOW_SIZE, previousWindowStart, visibleMessageWindow } from '../../client/src/chat/virtualWindow.js';

describe('chat virtual window', () => {
  it('limits rendered records while retaining a navigable window over all history', () => {
    expect(visibleMessageWindow(201)).toEqual({ start: 121, end: 201 });
    expect(visibleMessageWindow(201, previousWindowStart(121))).toEqual({ start: 41, end: 121 });
    expect(visibleMessageWindow(201, previousWindowStart(41))).toEqual({ start: 0, end: CHAT_WINDOW_SIZE });
  });

  it('handles a history shorter than one window', () => {
    expect(visibleMessageWindow(3)).toEqual({ start: 0, end: 3 });
  });
});
