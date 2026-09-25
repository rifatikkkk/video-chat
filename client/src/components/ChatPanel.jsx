import { useLayoutEffect, useRef, useState } from 'react';
import { formatChatTime } from '../chat/chatState.js';
import { previousWindowStart, visibleMessageWindow } from '../chat/virtualWindow.js';

export function ChatPanel({ messages, draft, onDraftChange, onSend, onRetry }) {
  const viewportRef = useRef(null);
  const [windowStart, setWindowStart] = useState(Math.max(0, messages.length - 80));
  const { start, end } = visibleMessageWindow(messages.length, windowStart);
  const visibleMessages = messages.slice(start, end);

  useLayoutEffect(() => {
    setWindowStart(Math.max(0, messages.length - 80));
    const frame = requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length]);

  async function submit(event) {
    event.preventDefault();
    const sent = await onSend(draft);
    if (sent) onDraftChange('');
  }

  return (
    <section className="chat-panel" aria-label="Чат комнаты">
      <h2>Чат</h2>
      <div className="chat-messages" aria-live="polite" ref={viewportRef}>
        {start > 0 && <button className="chat-older" type="button" onClick={() => setWindowStart(previousWindowStart(start))}>Показать предыдущие сообщения</button>}
        {visibleMessages.map((message) => {
          const userMessage = message.type === 'user' || !message.type;
          return <article className={`chat-message chat-message--${message.status}`} key={message.id}>
            {userMessage ? <><header><strong>{message.displayName}</strong><time dateTime={new Date(message.createdAt).toISOString()}>{formatChatTime(message.createdAt)}</time></header><p>{message.text}</p></> : <p className="system-message">{message.type === 'join' ? `Участник ${message.displayName} присоединился к комнате` : `Участник ${message.displayName} покинул комнату`}</p>}
            {userMessage && message.status !== 'confirmed' && <small>{message.status === 'pending' ? 'Отправка…' : message.status === 'unconfirmed' ? 'Отправка не подтверждена.' : message.error}</small>}
            {userMessage && (message.status === 'unconfirmed' || message.status === 'error') && <button type="button" onClick={() => onRetry(message)}>Повторить</button>}
          </article>
        })}
      </div>
      <form onSubmit={submit} className="chat-form">
        <label htmlFor="chat-text">Сообщение</label>
        <textarea id="chat-text" value={draft} onChange={(event) => onDraftChange(event.target.value)} maxLength="2000" rows="3" />
        <button type="submit">Отправить</button>
      </form>
    </section>
  );
}
