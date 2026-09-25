import { useEffect, useRef, useState } from 'react';
import { validateChatMessage, validateDisplayName, validateRoomId } from '@video-chat/shared';
import { RoomSession } from './session/RoomSession.js';
import { SignalingClient } from './socket/SignalingClient.js';
import { copyInvitation } from './clipboard/invitation.js';
import { ParticipantGrid } from './components/ParticipantGrid.jsx';
import { applyParticipantEvent } from './participants/participantState.js';
import { ChatPanel } from './components/ChatPanel.jsx';
import { addPendingMessage, chatErrorMessage, markMessage, mergeChatEntry } from './chat/chatState.js';

export function getRoomIdFromPath(pathname) {
  const match = /^\/room\/([^/]+)$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function joinErrorMessage(code) {
  if (code === 'ROOM_FULL') return 'Комната заполнена. Освободится место — повторите вход вручную.';
  if (code === 'INVALID_ROOM_ID') return 'Некорректная ссылка на комнату.';
  if (code === 'CONNECT_FAILED' || code === 'CONNECT_TIMEOUT') return 'Не удалось подключиться к серверу. Попробуйте ещё раз.';
  return 'Не удалось войти в комнату. Попробуйте ещё раз.';
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const sessionRef = useRef(null);
  const pendingParticipantEvents = useRef([]);
  const joiningRef = useRef(false);
  const roomId = getRoomIdFromPath(pathname);
  const validRoomId = roomId === null || validateRoomId(roomId).ok;

  useEffect(() => {
    const onPopState = () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      setSnapshot(null);
      setParticipants([]);
      setMessages([]);
      setDraft('');
      setError('');
      setStatus('');
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      sessionRef.current?.dispose();
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    const name = validateDisplayName(displayName);
    if (!name.ok) {
      setError('Введите имя: до 30 букв, цифр и пробелов.');
      return;
    }
    if (!validRoomId) {
      setError('Некорректная ссылка на комнату. Создайте новую комнату на главной странице.');
      return;
    }

    const client = new SignalingClient({ url: import.meta.env.VITE_SOCKET_URL });
    pendingParticipantEvents.current = [];
    joiningRef.current = true;
    const session = new RoomSession({
      signalingClient: client,
      onRoomEvent: (roomEvent) => {
        if (joiningRef.current) pendingParticipantEvents.current.push(roomEvent);
        setParticipants((current) => applyParticipantEvent(current, roomEvent));
        if (roomEvent.kind === 'chat-message') setMessages((current) => mergeChatEntry(current, roomEvent.payload.entry));
      },
    });
    sessionRef.current = session;
    const unsubscribe = session.onStateChange((state) => setStatus(state));
    try {
      const joined = await session.join({ displayName: name.value, roomId: roomId ?? undefined });
      setSnapshot(joined);
      setParticipants(pendingParticipantEvents.current.reduce(applyParticipantEvent, joined.participants));
      pendingParticipantEvents.current = [];
      joiningRef.current = false;
      const nextPath = `/room/${joined.roomId}`;
      window.history.pushState({}, '', nextPath);
      setPathname(nextPath);
    } catch (joinError) {
      joiningRef.current = false;
      sessionRef.current = null;
      setError(joinErrorMessage(joinError.code));
    } finally {
      unsubscribe();
    }
  }

  async function leave() {
    await sessionRef.current?.leave();
    sessionRef.current = null;
    setSnapshot(null);
    setParticipants([]);
    setMessages([]);
    setDraft('');
    setStatus('');
  }

  async function copyRoomUrl() {
    try {
      await copyInvitation(navigator.clipboard, window.location.href);
      setCopyStatus('Ссылка скопирована.');
    } catch {
      setCopyStatus('Не удалось скопировать автоматически. Скопируйте ссылку вручную.');
    }
  }

  async function sendMessage(text, retryMessage) {
    const validated = validateChatMessage(text);
    if (!validated.ok) return false;
    const clientMessageId = retryMessage?.clientMessageId ?? crypto.randomUUID();
    if (!retryMessage) setMessages((current) => addPendingMessage(current, { clientMessageId, text: validated.value, displayName }));
    else setMessages((current) => markMessage(current, clientMessageId, 'pending'));
    try {
      const response = await sessionRef.current.signalingClient.request('chat:send', { roomEpoch: snapshot.roomEpoch, clientMessageId, text: validated.value });
      if (response.ok) {
        setMessages((current) => mergeChatEntry(current, response.data.entry));
        return true;
      }
      setMessages((current) => markMessage(current, clientMessageId, 'error', chatErrorMessage(response.error.code, response.error.details?.retryAfterMs)));
    } catch (error) {
      const status = error.code === 'ACK_TIMEOUT' ? 'unconfirmed' : 'error';
      setMessages((current) => markMessage(current, clientMessageId, status, status === 'error' ? 'Не удалось отправить сообщение.' : ''));
    }
    return false;
  }

  if (snapshot) {
    return (
      <main className="app-shell">
        <section className="card" aria-live="polite">
          <p className="eyebrow">Вы в комнате</p>
          <h1>Video Chat</h1>
          <p>Участники комнаты</p>
          <ParticipantGrid participants={participants} selfParticipantId={snapshot.selfParticipantId} />
          <ChatPanel messages={messages} draft={draft} onDraftChange={setDraft} onSend={sendMessage} onRetry={(message) => sendMessage(message.text, message)} />
          <p className="room-code">{snapshot.roomId}</p>
          <button type="button" onClick={copyRoomUrl}>Скопировать приглашение</button>
          {copyStatus && <p className={copyStatus === 'Ссылка скопирована.' ? 'success' : 'error'} role="status">{copyStatus}</p>}
          {copyStatus.startsWith('Не удалось') && <input className="invite-url" aria-label="Ссылка-приглашение для ручного копирования" readOnly value={window.location.href} onFocus={(event) => event.target.select()} autoFocus />}
          <button type="button" onClick={leave}>Выйти</button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="card">
        <p className="eyebrow">Video Chat</p>
        <h1>{roomId ? 'Вход в комнату' : 'Создайте комнату'}</h1>
        <p>{roomId ? 'Введите имя, чтобы присоединиться по приглашению.' : 'Введите имя и создайте новую комнату.'}</p>
        {!validRoomId && <p className="error" role="alert">Некорректная ссылка на комнату.</p>}
        <form onSubmit={submit} noValidate>
          <label htmlFor="display-name">Ваше имя</label>
          <input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" maxLength="60" disabled={!validRoomId || Boolean(status)} />
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={!validRoomId || Boolean(status)}>{status ? 'Подключаемся…' : roomId ? 'Войти в комнату' : 'Создать комнату'}</button>
        </form>
        {roomId && <a href="/">Создать новую комнату</a>}
      </section>
    </main>
  );
}
