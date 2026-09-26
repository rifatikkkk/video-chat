import { useEffect, useRef, useState } from 'react';

export async function attachMediaElementStream(mediaElement, stream) {
  mediaElement.srcObject = stream ?? null;
  if (stream) await mediaElement.play?.();
  return () => {
    if (mediaElement.srcObject === stream) mediaElement.srcObject = null;
  };
}

function ParticipantMedia({ stream }) {
  const videoRef = useRef(null);
  const [playBlocked, setPlayBlocked] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return undefined;
    let cleanup = () => {};
    let active = true;
    attachMediaElementStream(videoRef.current, stream)
      .then((nextCleanup) => {
        cleanup = nextCleanup;
        if (active) setPlayBlocked(false);
        else cleanup();
      })
      .catch(() => {
        if (active) setPlayBlocked(Boolean(stream));
      });
    return () => {
      active = false;
      cleanup();
    };
  }, [stream]);

  if (!stream) return <div className="participant-avatar" aria-hidden="true">👤</div>;

  async function enablePlayback() {
    try {
      await videoRef.current?.play();
      setPlayBlocked(false);
    } catch {
      setPlayBlocked(true);
    }
  }

  return (
    <div className="participant-media">
      <video ref={videoRef} className="participant-video" autoPlay playsInline />
      {playBlocked && <button type="button" className="playback-button" onClick={enablePlayback}>Включить звук</button>}
    </div>
  );
}

export function ParticipantGrid({ participants, selfParticipantId, remoteStreams = {} }) {
  return (
    <section className={`participant-grid participant-grid--${participants.length}`} aria-label="Участники комнаты">
      {participants.map((participant) => {
        const self = participant.participantId === selfParticipantId;
        const stream = self ? null : remoteStreams[participant.participantId] ?? null;
        return (
          <article className="participant-tile" key={participant.participantId}>
            <ParticipantMedia stream={stream} />
            <div className="participant-meta">
              <strong>{participant.displayName}{self && ' (вы)'}</strong>
              <span aria-label={participant.micEnabled ? 'Микрофон включён' : 'Микрофон выключен'} title={participant.micEnabled ? 'Микрофон включён' : 'Микрофон выключен'}>{participant.micEnabled ? '🎙' : '🔇'}</span>
            </div>
            <p>{participant.cameraEnabled ? 'Камера будет подключена' : 'Камера выключена'}</p>
          </article>
        );
      })}
    </section>
  );
}
