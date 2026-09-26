import { useEffect, useRef } from 'react';

export function attachMediaElementStream(mediaElement, stream) {
  mediaElement.srcObject = stream ?? null;
  return () => {
    if (mediaElement.srcObject === stream) mediaElement.srcObject = null;
  };
}

function ParticipantMedia({ stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return undefined;
    return attachMediaElementStream(videoRef.current, stream);
  }, [stream]);

  if (!stream) return <div className="participant-avatar" aria-hidden="true">👤</div>;

  return <video ref={videoRef} className="participant-video" autoPlay playsInline />;
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
