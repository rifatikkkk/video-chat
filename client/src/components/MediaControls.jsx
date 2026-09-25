import { mediaErrorMessage } from '../media/mediaErrorMessage.js';

export function MediaControls({ mediaState, onToggleMicrophone, onToggleCamera }) {
  const audioPending = mediaState.audio === 'pending';
  const videoPending = mediaState.video === 'pending';
  const audioLabel = audioPending ? 'Подключаем микрофон…' : mediaState.micEnabled ? 'Микрофон включён' : 'Микрофон выключен';
  const videoLabel = videoPending ? 'Подключаем камеру…' : mediaState.cameraEnabled ? 'Камера включена' : 'Камера выключена';

  return (
    <section className="media-controls" aria-label="Управление медиа">
      <p className="media-status">{audioLabel} · {videoLabel}</p>
      {mediaState.audioError && <p className="error" role="status">{mediaErrorMessage(mediaState.audioError, 'audio')}</p>}
      {mediaState.videoError && <p className="error" role="status">{mediaErrorMessage(mediaState.videoError, 'video')}</p>}
      <div className="media-actions">
        <button type="button" onClick={onToggleMicrophone} disabled={audioPending}>
          {mediaState.micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
        </button>
        <button type="button" onClick={onToggleCamera} disabled={videoPending}>
          {mediaState.cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
        </button>
      </div>
    </section>
  );
}
