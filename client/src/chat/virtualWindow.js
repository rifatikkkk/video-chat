export const CHAT_WINDOW_SIZE = 80;

export function visibleMessageWindow(messageCount, start = Math.max(0, messageCount - CHAT_WINDOW_SIZE)) {
  const safeStart = Math.max(0, Math.min(start, Math.max(0, messageCount - 1)));
  return { start: safeStart, end: Math.min(messageCount, safeStart + CHAT_WINDOW_SIZE) };
}

export function previousWindowStart(currentStart) {
  return Math.max(0, currentStart - CHAT_WINDOW_SIZE);
}
