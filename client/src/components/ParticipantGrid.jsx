export function ParticipantGrid({ participants, selfParticipantId }) {
  return (
    <section className={`participant-grid participant-grid--${participants.length}`} aria-label="Участники комнаты">
      {participants.map((participant) => {
        const self = participant.participantId === selfParticipantId;
        return (
          <article className="participant-tile" key={participant.participantId}>
            <div className="participant-avatar" aria-hidden="true">👤</div>
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
