import { useEffect, useRef, useState } from 'react';
import { validateChatMessage, validateDisplayName, validateRoomId } from '@video-chat/shared';
import { RoomSession } from './session/RoomSession.js';
import { SignalingClient } from './socket/SignalingClient.js';
import { copyInvitation } from './clipboard/invitation.js';
import { ParticipantGrid } from './components/ParticipantGrid.jsx';
import { applyParticipantEvent } from './participants/participantState.js';
import { ChatPanel } from './components/ChatPanel.jsx';
import { MediaControls } from './components/MediaControls.jsx';
import { addPendingMessage, chatErrorMessage, markMessage, mergeChatEntries, mergeChatEntry } from './chat/chatState.js';
import { loadHistoryPages } from './chat/historyLoader.js';
import { checkBrowserEnvironment } from './environment/preflight.js';
import { MediaController } from './media/MediaController.js';
import { SelfView } from './components/SelfView.jsx';
import { PeerManager } from './peers/PeerManager.js';

export function getRoomIdFromPath(pathname) {
  const match = /^\/room\/([^/]+)$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function joinErrorMessage(code) {
  if (code === 'ROOM_FULL') return 'Комната заполнена. Освободится место — повторите вход вручную.';
  if (code === 'INVALID_ROOM_ID') return 'Некорректная ссылка на комнату.';
  if (code === 'PROTOCOL_MISMATCH') return 'Версия приложения устарела. Обновите страницу и попробуйте снова.';
  if (code === 'CONNECT_FAILED' || code === 'CONNECT_TIMEOUT') return 'Не удалось подключиться к серверу. Попробуйте ещё раз.';
  return 'Не удалось войти в комнату. Попробуйте ещё раз.';
}

export function shouldResetForPageShow(event) {
  return Boolean(event?.persisted);
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [participants, setParticipants] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [peerStatuses, setPeerStatuses] = useState({});
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [mediaState, setMediaState] = useState({ audio: 'off', video: 'off' });
  const sessionRef = useRef(null);
  const pendingParticipantEvents = useRef([]);
  const joiningRef = useRef(false);
  const mediaControllerRef = useRef(null);
  const mediaRevisionRef = useRef(0);
  const roomId = getRoomIdFromPath(pathname);
  const validRoomId = roomId === null || validateRoomId(roomId).ok;
  const environment = checkBrowserEnvironment(window);

  function resetSessionView({ clearName = true } = {}) {
    joiningRef.current = false;
    pendingParticipantEvents.current = [];
    setSnapshot(null);
    setParticipants([]);
    setRemoteStreams({});
    setPeerStatuses({});
    setMessages([]);
    setDraft('');
    setCopyStatus('');
    setMediaState({ audio: 'off', video: 'off' });
    mediaControllerRef.current = null;
    setStatus('');
    if (clearName) setDisplayName('');
  }

  useEffect(() => {
    const onPopState = () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      resetSessionView();
      setError('');
      setPathname(window.location.pathname);
    };
    const onPageHide = () => {
      void sessionRef.current?.dispose();
      sessionRef.current = null;
      resetSessionView();
    };
    const onPageShow = (event) => {
      if (!shouldResetForPageShow(event)) return;
      sessionRef.current = null;
      resetSessionView();
      setError('Сессия завершена. Введите имя, чтобы войти снова.');
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      sessionRef.current?.dispose();
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!environment.ok) {
      setError(environment.message);
      return;
    }
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
    const mediaController = new MediaController({ onStateChange: setMediaState });
    const peerManager = new PeerManager({
      sendDescription: (payload) => client.request('signal:description', payload),
      sendCandidate: (payload) => client.request('signal:candidate', payload),
      onRemoteStream: ({ participantId, stream }) => {
        setRemoteStreams((current) => {
          const next = { ...current };
          if (stream) next[participantId] = stream;
          else delete next[participantId];
          return next;
        });
      },
      onPeerStatus: ({ participantId, status }) => {
        setPeerStatuses((current) => {
          const next = { ...current };
          if (status) next[participantId] = status;
          else delete next[participantId];
          return next;
        });
      },
    });
    const unsubscribeTracks = mediaController.subscribeTrackChanges(({ kind, track }) => {
      void peerManager.setLocalTrack(kind, track);
    });
    mediaControllerRef.current = mediaController;
    pendingParticipantEvents.current = [];
    joiningRef.current = true;
    const session = new RoomSession({
      signalingClient: client,
      mediaController,
      peerManager,
      onRoomEvent: (roomEvent) => {
        if (joiningRef.current) pendingParticipantEvents.current.push(roomEvent);
        setParticipants((current) => applyParticipantEvent(current, roomEvent));
        if (roomEvent.kind === 'participant-left') {
          setRemoteStreams((current) => {
            const next = { ...current };
            delete next[roomEvent.payload.participantId];
            return next;
          });
          setPeerStatuses((current) => {
            const next = { ...current };
            delete next[roomEvent.payload.participantId];
            return next;
          });
        }
        if (['chat-message', 'participant-joined', 'participant-left'].includes(roomEvent.kind)) {
          setMessages((current) => mergeChatEntry(current, roomEvent.payload.entry));
        }
      },
    });
    sessionRef.current = session;
    const unsubscribe = session.onStateChange((state) => {
      setStatus(state);
      if (state === 'ended' && sessionRef.current === session) {
        sessionRef.current = null;
        unsubscribeTracks();
        resetSessionView();
        setError('Соединение завершено. Введите имя, чтобы войти снова.');
        unsubscribe();
      }
    });
    try {
      const joined = await session.join({ displayName: name.value, roomId: roomId ?? undefined });
      setSnapshot(joined);
      mediaRevisionRef.current = joined.participants.find(({ participantId }) => participantId === joined.selfParticipantId)?.mediaRevision ?? 0;
      setParticipants(pendingParticipantEvents.current.reduce(applyParticipantEvent, joined.participants));
      pendingParticipantEvents.current = [];
      joiningRef.current = false;
      void loadRoomHistory(session, joined);
      void mediaController.start();
      const nextPath = `/room/${joined.roomId}`;
      window.history.pushState({}, '', nextPath);
      setPathname(nextPath);
    } catch (joinError) {
      joiningRef.current = false;
      sessionRef.current = null;
      setError(joinErrorMessage(joinError.code));
      unsubscribeTracks();
      unsubscribe();
    }
  }

  async function leave() {
    await sessionRef.current?.leave();
    sessionRef.current = null;
    resetSessionView();
  }

  async function copyRoomUrl() {
    try {
      await copyInvitation(navigator.clipboard, window.location.href);
      setCopyStatus('Ссылка скопирована.');
    } catch {
      setCopyStatus('Не удалось скопировать автоматически. Скопируйте ссылку вручную.');
    }
  }

  async function toggleMicrophone() {
    const nextMicEnabled = !mediaState.micEnabled;
    const applied = await mediaControllerRef.current?.setMicEnabled(nextMicEnabled);
    if (!applied || !sessionRef.current || !snapshot) return;
    await publishMediaState({ micEnabled: nextMicEnabled, cameraEnabled: mediaState.cameraEnabled });
  }

  async function toggleCamera() {
    const nextCameraEnabled = !mediaState.cameraEnabled;
    const applied = await mediaControllerRef.current?.setCameraEnabled(nextCameraEnabled);
    if (!applied || !sessionRef.current || !snapshot) return;
    await publishMediaState({ micEnabled: mediaState.micEnabled, cameraEnabled: nextCameraEnabled });
  }

  async function publishMediaState({ micEnabled, cameraEnabled }) {
    const revision = ++mediaRevisionRef.current;
    try {
      const response = await sessionRef.current.signalingClient.request('media:update', {
        roomEpoch: snapshot.roomEpoch,
        revision,
        micEnabled,
        cameraEnabled,
      });
      if (!response.ok) throw new Error('Media update was rejected.');
    } catch {
      // The next explicit toggle retries publication; no false "on" state is sent after a failed capture.
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

  async function loadRoomHistory(session, joined) {
    try {
      await loadHistoryPages({
        request: session.signalingClient.request.bind(session.signalingClient),
        roomEpoch: joined.roomEpoch,
        throughSeq: joined.historyThroughSeq,
        isCurrent: () => sessionRef.current === session,
        onEntries: (entries) => setMessages((current) => mergeChatEntries(current, entries)),
      });
    } catch {
      // Live chat remains usable even if historical messages cannot be fetched.
    }
  }

  if (snapshot) {
    return (
      <main className="app-shell">
        <section className="card" aria-live="polite">
          <p className="eyebrow">Вы в комнате</p>
          <h1>Video Chat</h1>
          <p>Участники комнаты</p>
          <SelfView displayName={displayName} videoTrack={mediaControllerRef.current?.getTrack('video') ?? null} />
          <MediaControls mediaState={mediaState} onToggleMicrophone={toggleMicrophone} onToggleCamera={toggleCamera} />
          <ParticipantGrid participants={participants} selfParticipantId={snapshot.selfParticipantId} remoteStreams={remoteStreams} peerStatuses={peerStatuses} />
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
        {!environment.ok && <p className="error" role="alert">{environment.message}</p>}
        <form onSubmit={submit} noValidate>
          <label htmlFor="display-name">Ваше имя</label>
          <input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" maxLength="60" disabled={!validRoomId || !environment.ok || Boolean(status)} />
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={!validRoomId || !environment.ok || Boolean(status)}>{status ? 'Подключаемся…' : roomId ? 'Войти в комнату' : 'Создать комнату'}</button>
        </form>
        {roomId && <a href="/">Создать новую комнату</a>}
      </section>
    </main>
  );
}
