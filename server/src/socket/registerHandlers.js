import {
  ERROR_CODES,
  PROTOCOL_VERSION,
  createErrorAck,
  createSuccessAck,
  validateRequestEnvelope,
} from '@video-chat/shared';
import { RegistryError } from '../rooms/RoomRegistry.js';
import { toPublicParticipant } from '../rooms/RoomRegistry.js';

const ERROR_MESSAGES = {
  [ERROR_CODES.PROTOCOL_MISMATCH]: 'Обновите страницу: версии клиента и сервера не совпадают.',
  [ERROR_CODES.INVALID_REQUEST]: 'Некорректный запрос.',
};

function requestError(requestId, code, message) {
  return createErrorAck(requestId, code, message ?? ERROR_MESSAGES[code] ?? 'Операция не выполнена.');
}

function emitRoomEvent(io, room, kind, payload) {
  const event = { v: PROTOCOL_VERSION, roomEpoch: room.epoch, seq: payload.entry.seq, kind, payload };
  for (const participant of room.participants.values()) {
    io.to(participant.socketId).emit('room:event', event);
  }
}

export function registerHandlers(socket, registry, io) {
  const requestCache = new Map();

  function handle(event, action) {
    socket.on(event, (request, acknowledge = () => {}) => {
      const validation = validateRequestEnvelope(request);
      const requestId = request?.requestId;
      if (!validation.ok) {
        const code = request?.v !== PROTOCOL_VERSION ? ERROR_CODES.PROTOCOL_MISMATCH : ERROR_CODES.INVALID_REQUEST;
        acknowledge(requestError(requestId, code, validation.reason));
        return;
      }
      if (requestCache.has(requestId)) {
        acknowledge(requestCache.get(requestId));
        return;
      }

      let response;
      try {
        response = createSuccessAck(requestId, action(request));
      } catch (error) {
        response = error instanceof RegistryError
          ? requestError(requestId, error.code, error.message)
          : requestError(requestId, ERROR_CODES.INVALID_REQUEST);
      }
      requestCache.set(requestId, response);
      acknowledge(response);
    });
  }

  handle('room:create', ({ displayName }) => {
    const result = registry.createAndJoin({ socketId: socket.id, displayName });
    emitRoomEvent(io, result.room, 'participant-joined', {
      participant: toPublicParticipant(result.participant),
      entry: result.entry,
    });
    return result.snapshot;
  });

  handle('room:join', ({ roomId, displayName }) => {
    const result = registry.join({ roomId, socketId: socket.id, displayName });
    emitRoomEvent(io, result.room, 'participant-joined', {
      participant: toPublicParticipant(result.participant),
      entry: result.entry,
    });
    return result.snapshot;
  });

  handle('room:leave', ({ roomEpoch }) => {
    const result = registry.leave({ socketId: socket.id, roomEpoch });
    if (result.left) {
      emitRoomEvent(io, result.room, 'participant-left', {
        participantId: result.participant.participantId,
        entry: result.entry,
      });
    }
    return { left: result.left };
  });

  handle('chat:send', ({ roomEpoch, clientMessageId, text }) => {
    const result = registry.appendMessage({ socketId: socket.id, roomEpoch, clientMessageId, text });
    if (!result.duplicate) {
      emitRoomEvent(io, result.room, 'chat-message', { entry: result.entry });
    }
    return { entry: result.entry, duplicate: result.duplicate };
  });

  handle('history:get', ({ roomEpoch, throughSeq, afterSeq, limit }) => (
    registry.getHistory({ socketId: socket.id, roomEpoch, throughSeq, afterSeq, limit })
  ));

  handle('media:update', ({ roomEpoch, revision, micEnabled, cameraEnabled }) => {
    const result = registry.updateMedia({ socketId: socket.id, roomEpoch, revision, micEnabled, cameraEnabled });
    if (result.changed) {
      emitRoomEvent(io, result.room, 'media-updated', {
        entry: result.entry,
        participantId: result.participant.participantId,
        micEnabled: result.participant.micEnabled,
        cameraEnabled: result.participant.cameraEnabled,
        mediaRevision: result.participant.mediaRevision,
      });
    }
    return { changed: result.changed };
  });

  socket.on('disconnect', () => {
    const result = registry.leave({ socketId: socket.id });
    if (result.left) {
      emitRoomEvent(io, result.room, 'participant-left', {
        participantId: result.participant.participantId,
        entry: result.entry,
      });
    }
    requestCache.clear();
  });
}
