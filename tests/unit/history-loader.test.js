import { describe, expect, it } from 'vitest';
import { loadHistoryPages } from '../../client/src/chat/historyLoader.js';

describe('history loader', () => {
  it('loads fixed pages sequentially while preserving the snapshot boundary', async () => {
    const requests = [];
    const entries = [];
    const pages = [
      { ok: true, data: { entries: [{ id: 'epoch:1', seq: 1 }], nextAfterSeq: 1, done: false } },
      { ok: true, data: { entries: [{ id: 'epoch:2', seq: 2 }], nextAfterSeq: null, done: true } },
    ];
    await loadHistoryPages({
      roomEpoch: 'epoch', throughSeq: 2,
      request: async (_event, payload) => { requests.push(payload); return pages.shift(); },
      onEntries: (page) => entries.push(...page),
    });

    expect(requests).toEqual([
      { roomEpoch: 'epoch', throughSeq: 2, afterSeq: 0, limit: 50 },
      { roomEpoch: 'epoch', throughSeq: 2, afterSeq: 1, limit: 50 },
    ]);
    expect(entries.map(({ id }) => id)).toEqual(['epoch:1', 'epoch:2']);
  });

  it('stops applying pages after the owning session has ended', async () => {
    const applied = [];
    const result = await loadHistoryPages({
      roomEpoch: 'epoch', throughSeq: 1, isCurrent: () => false,
      request: async () => ({ ok: true, data: { entries: [{ id: 'epoch:1' }], done: true, nextAfterSeq: null } }),
      onEntries: (entries) => applied.push(...entries),
    });
    expect(result).toEqual({ cancelled: true });
    expect(applied).toEqual([]);
  });
});
