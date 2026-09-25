export function mergeChatEntry(messages, entry) {
  const existingIndex = messages.findIndex((message) => message.id === entry.id || (entry.clientMessageId && message.clientMessageId === entry.clientMessageId));
  const confirmed = { ...entry, status: 'confirmed' };
  if (existingIndex < 0) return [...messages, confirmed];
  return messages.map((message, index) => index === existingIndex ? { ...message, ...confirmed } : message);
}

export function addPendingMessage(messages, { clientMessageId, text, displayName }) {
  return [...messages, { id: `pending:${clientMessageId}`, clientMessageId, text, displayName, createdAt: Date.now(), status: 'pending' }];
}

export function markMessage(messages, clientMessageId, status, error = '') {
  return messages.map((message) => message.clientMessageId === clientMessageId ? { ...message, status, error } : message);
}

export function chatErrorMessage(code, retryAfterMs) {
  if (code === 'RATE_LIMITED') return `Слишком много сообщений. Повторите через ${Math.ceil((retryAfterMs ?? 0) / 1000)} с.`;
  if (code === 'SERVER_BUSY') return 'Сервер временно не может принять сообщение.';
  return 'Сообщение не отправлено.';
}

export function formatChatTime(createdAt) {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(createdAt);
}
