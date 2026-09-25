import { useEffect, useRef, useState } from 'react';
import { validateDisplayName, validateRoomId } from '@video-chat/shared';
import { RoomSession } from './session/RoomSession.js';
import { SignalingClient } from './socket/SignalingClient.js';
import { copyInvitation } from './clipboard/invitation.js';

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
  const sessionRef = useRef(null);
  const roomId = getRoomIdFromPath(pathname);
  const validRoomId = roomId === null || validateRoomId(roomId).ok;

  useEffect(() => {
    const onPopState = () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      setSnapshot(null);
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
    const session = new RoomSession({ signalingClient: client });
    sessionRef.current = session;
    const unsubscribe = session.onStateChange((state) => setStatus(state));
    try {
      const joined = await session.join({ displayName: name.value, roomId: roomId ?? undefined });
      setSnapshot(joined);
      const nextPath = `/room/${joined.roomId}`;
      window.history.pushState({}, '', nextPath);
      setPathname(nextPath);
    } catch (joinError) {
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

  if (snapshot) {
    return (
      <main className="app-shell">
        <section className="card" aria-live="polite">
          <p className="eyebrow">Вы в комнате</p>
          <h1>Video Chat</h1>
          <p>Комната подключена. Интерфейс участников, чат и медиа появятся в следующих задачах.</p>
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
