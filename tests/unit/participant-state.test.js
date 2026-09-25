import { describe, expect, it } from 'vitest';
import { applyParticipantEvent } from '../../client/src/participants/participantState.js';

const anna = { participantId: 'participant-a', displayName: 'Анна', micEnabled: false, cameraEnabled: false, mediaRevision: 0 };
const anotherAnna = { participantId: 'participant-b', displayName: 'Анна', micEnabled: false, cameraEnabled: false, mediaRevision: 0 };

describe('participant state', () => {
  it('keeps participants with equal display names independent by participantId', () => {
    const joined = applyParticipantEvent([anna], { kind: 'participant-joined', payload: { participant: anotherAnna } });
    const updated = applyParticipantEvent(joined, { kind: 'media-updated', payload: { participantId: 'participant-b', micEnabled: true, cameraEnabled: true, mediaRevision: 1 } });

    expect(updated).toEqual([anna, expect.objectContaining({ participantId: 'participant-b', micEnabled: true, cameraEnabled: true })]);
  });

  it('removes only the participant named by a leave event', () => {
    expect(applyParticipantEvent([anna, anotherAnna], { kind: 'participant-left', payload: { participantId: 'participant-a' } })).toEqual([anotherAnna]);
  });
});
