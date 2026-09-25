import { PROTOCOL_VERSION } from '@video-chat/shared';

export default function App() {
  return (
    <main className="app-shell">
      <h1>Video Chat</h1>
      <p>Каркас приложения готов. Создание комнаты появится в следующей задаче.</p>
      <small>Версия протокола: {PROTOCOL_VERSION}</small>
    </main>
  );
}
