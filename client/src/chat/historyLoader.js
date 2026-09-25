export async function loadHistoryPages({ request, roomEpoch, throughSeq, onEntries, isCurrent = () => true }) {
  let afterSeq = 0;
  do {
    const response = await request('history:get', { roomEpoch, throughSeq, afterSeq, limit: 50 });
    if (!isCurrent()) return { cancelled: true };
    if (!response?.ok) throw new Error(response?.error?.message ?? 'Unable to load history.');
    onEntries(response.data.entries);
    afterSeq = response.data.nextAfterSeq;
    if (response.data.done) return { cancelled: false };
  } while (afterSeq !== null);
  return { cancelled: false };
}
