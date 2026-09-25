import { describe, expect, it } from 'vitest';
import { addPendingMessage, chatErrorMessage, markMessage, mergeChatEntries, mergeChatEntry } from '../../client/src/chat/chatState.js';

describe('chat state', () => {
  it('merges broadcast and acknowledgement into one confirmed entry by clientMessageId', () => {
    const pending = addPendingMessage([], { clientMessageId: 'id-1', text: '<b>Привет</b>', displayName: 'Анна' });
    const broadcast = mergeChatEntry(pending, { id: 'epoch:2', clientMessageId: 'id-1', text: '<b>Привет</b>', displayName: 'Анна', createdAt: 1, type: 'user' });
    const acknowledged = mergeChatEntry(broadcast, { id: 'epoch:2', clientMessageId: 'id-1', text: '<b>Привет</b>', displayName: 'Анна', createdAt: 1, type: 'user' });

    expect(acknowledged).toHaveLength(1);
    expect(acknowledged[0]).toMatchObject({ id: 'epoch:2', status: 'confirmed', text: '<b>Привет</b>' });
  });

  it('merges history and live entries by id and sequence without dropping system entries', () => {
    const live = mergeChatEntry([], { id: 'epoch:3', seq: 3, type: 'user', text: 'live', displayName: 'Анна', createdAt: 3 });
    const merged = mergeChatEntries(live, [
      { id: 'epoch:1', seq: 1, type: 'join', displayName: 'Анна', createdAt: 1 },
      { id: 'epoch:3', seq: 3, type: 'user', text: 'live', displayName: 'Анна', createdAt: 3 },
      { id: 'epoch:2', seq: 2, type: 'leave', displayName: 'Борис', createdAt: 2 },
    ]);

    expect(merged.map(({ id }) => id)).toEqual(['epoch:1', 'epoch:2', 'epoch:3']);
  });

  it('keeps retry identity and gives visible rate and capacity errors', () => {
    const pending = addPendingMessage([], { clientMessageId: 'id-1', text: 'Привет', displayName: 'Анна' });
    expect(markMessage(pending, 'id-1', 'unconfirmed')[0]).toMatchObject({ clientMessageId: 'id-1', status: 'unconfirmed' });
    expect(chatErrorMessage('RATE_LIMITED', 1200)).toMatch(/2 с/);
    expect(chatErrorMessage('SERVER_BUSY')).toMatch(/временно/);
  });
});
