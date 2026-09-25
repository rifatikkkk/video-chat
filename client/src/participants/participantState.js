export function applyParticipantEvent(participants, event) {
  if (event.kind === 'participant-joined') {
    const participant = event.payload.participant;
    return participants.some(({ participantId }) => participantId === participant.participantId)
      ? participants
      : [...participants, participant];
  }
  if (event.kind === 'participant-left') {
    return participants.filter(({ participantId }) => participantId !== event.payload.participantId);
  }
  if (event.kind === 'media-updated') {
    return participants.map((participant) => participant.participantId === event.payload.participantId
      ? { ...participant, micEnabled: event.payload.micEnabled, cameraEnabled: event.payload.cameraEnabled, mediaRevision: event.payload.mediaRevision }
      : participant);
  }
  return participants;
}
