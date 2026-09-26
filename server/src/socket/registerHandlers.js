import {
  ERROR_CODES,
  MAX_ICE_BYTES,
  MAX_INCOMING_PAYLOAD_BYTES,
  MAX_SDP_BYTES,
  PROTOCOL_VERSION,
  createErrorAck,
  createSuccessAck,
  validatePayloadSize,
  validateRequestEnvelope,
} from '@video-chat/shared';
import { RegistryError } from '../rooms/RoomRegistry.js';
import { toPublicParticipant } from '../rooms/RoomRegistry.js';
import { TokenBucket } from './TokenBucket.js';

const ERROR_MESSAGES = {
  [ERROR_CODES.PROTOCOL_MISMATCH]: 'Обновите страницу: версии клиента и сервера не совпадают.',
  [ERROR_CODES.INVALID_REQUEST]: 'Некорректный запрос.',
  [ERROR_CODES.SERVER_BUSY]: 'Сервер временно не принимает новые входы.',
};

function requestError(requestId, code, message) {
  return createErrorAck(requestId, code, message ?? ERROR_MESSAGES[code] ?? 'Операция не выполнена.');
}

function emitRoomEvent(io, room, kind, payload, slowConsumerGuard) {
  const event = { v: PROTOCOL_VERSION, roomEpoch: room.epoch, seq: payload.entry.seq, kind, payload };
  for (const participant of room.participants.values()) {
    const recipient = io.sockets.sockets.get(participant.socketId);
    if (!recipient) continue;
    recipient.emit('room:event', event);
    slowConsumerGuard.disconnectIfOverloaded(recipient);
  }
}

export function registerHandlers(socket, registry, io, { slowConsumerGuard, idleJoinGuard, canAcceptJoins = () => true, metrics = {} }) {
  const requestCache = new Map();
  const buckets = new Map();
  const limits = {
    'chat:send': { rate: 2, burst: 10 },
    'media:update': { rate: 10, burst: 20 },
    'signal:description': { rate: 10, burst: 20 },
    'signal:candidate': { rate: 100, burst: 300 },
  };
  const stopIdleJoinWatch = idleJoinGuard?.watch?.(socket, () => Boolean(registry.getMembership(socket.id))) ?? (() => {});

  function handle(event, action) {
    socket.on(event, (request, acknowledge = () => {}) => {
      const validation = validateRequestEnvelope(request);
      const requestId = request?.requestId;
      if (!validation.ok) {
        const code = request?.v !== PROTOCOL_VERSION ? ERROR_CODES.PROTOCOL_MISMATCH : ERROR_CODES.INVALID_REQUEST;
        acknowledge(requestError(requestId, code, validation.reason));
        return;
      }
      const payloadSize = validatePayloadSize(request, MAX_INCOMING_PAYLOAD_BYTES);
      if (!payloadSize.ok) {
        acknowledge(requestError(requestId, ERROR_CODES.INVALID_REQUEST, payloadSize.reason));
        return;
      }
      if (requestCache.has(requestId)) {
        acknowledge(requestCache.get(requestId));
        return;
      }
      const limit = limits[event];
      if (limit) {
        const bucket = buckets.get(event) ?? new TokenBucket(limit);
        buckets.set(event, bucket);
        const allowance = bucket.take();
        if (!allowance.ok) {
          metrics.recordRateLimit?.();
          acknowledge(createErrorAck(requestId, ERROR_CODES.RATE_LIMITED, 'Слишком много запросов.', { retryAfterMs: allowance.retryAfterMs }));
          return;
        }
      }

      let response;
      try {
        response = createSuccessAck(requestId, action(request));
      } catch (error) {
        if (['room:create', 'room:join'].includes(event)) metrics.recordJoinFailure?.();
        response = error instanceof RegistryError
          ? requestError(requestId, error.code, error.message)
          : requestError(requestId, ERROR_CODES.INVALID_REQUEST);
      }
      requestCache.set(requestId, response);
      acknowledge(response);
    });
  }

  handle('room:create', ({ displayName }) => {
    if (!canAcceptJoins()) throw new RegistryError(ERROR_CODES.SERVER_BUSY, 'Server is not ready to accept new room entries.');
    const result = registry.createAndJoin({ socketId: socket.id, displayName });
    emitRoomEvent(io, result.room, 'participant-joined', {
      participant: toPublicParticipant(result.participant),
      entry: result.entry,
    }, slowConsumerGuard);
    return result.snapshot;
  });

  handle('room:join', ({ roomId, displayName }) => {
    if (!canAcceptJoins()) throw new RegistryError(ERROR_CODES.SERVER_BUSY, 'Server is not ready to accept new room entries.');
    const result = registry.join({ roomId, socketId: socket.id, displayName });
    emitRoomEvent(io, result.room, 'participant-joined', {
      participant: toPublicParticipant(result.participant),
      entry: result.entry,
    }, slowConsumerGuard);
    return result.snapshot;
  });

  handle('room:leave', ({ roomEpoch }) => {
    const result = registry.leave({ socketId: socket.id, roomEpoch });
    if (result.left) {
      emitRoomEvent(io, result.room, 'participant-left', {
        participantId: result.participant.participantId,
        entry: result.entry,
      }, slowConsumerGuard);
    }
    return { left: result.left };
  });

  handle('chat:send', ({ roomEpoch, clientMessageId, text }) => {
    const result = registry.appendMessage({ socketId: socket.id, roomEpoch, clientMessageId, text });
    if (!result.duplicate) {
      emitRoomEvent(io, result.room, 'chat-message', { entry: result.entry }, slowConsumerGuard);
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
      }, slowConsumerGuard);
    }
    return { changed: result.changed };
  });

  handle('signal:description', ({ roomEpoch, toParticipantId, description }) => {
    if (!description || !['offer', 'answer'].includes(description.type) || typeof description.sdp !== 'string' || Buffer.byteLength(description.sdp) > MAX_SDP_BYTES) {
      throw new RegistryError(ERROR_CODES.INVALID_REQUEST, 'Invalid SDP description.');
    }
    const route = registry.getSignalRoute({ socketId: socket.id, roomEpoch, toParticipantId });
    io.to(route.target.socketId).emit('signal:description', { v: PROTOCOL_VERSION, roomEpoch, fromParticipantId: route.fromParticipantId, description });
    return { delivered: true };
  });

  handle('signal:candidate', ({ roomEpoch, toParticipantId, iceUfrag, candidate }) => {
    if (typeof iceUfrag !== 'string' || !(candidate === null || (typeof candidate === 'object' && !Array.isArray(candidate))) || (candidate !== null && !validatePayloadSize(candidate, MAX_ICE_BYTES).ok)) {
      throw new RegistryError(ERROR_CODES.INVALID_REQUEST, 'Invalid ICE candidate.');
    }
    const route = registry.getSignalRoute({ socketId: socket.id, roomEpoch, toParticipantId });
    io.to(route.target.socketId).emit('signal:candidate', { v: PROTOCOL_VERSION, roomEpoch, fromParticipantId: route.fromParticipantId, iceUfrag, candidate });
    return { delivered: true };
  });

  socket.on('disconnect', () => {
    const result = registry.leave({ socketId: socket.id });
    if (result.left) {
      emitRoomEvent(io, result.room, 'participant-left', {
        participantId: result.participant.participantId,
        entry: result.entry,
      }, slowConsumerGuard);
    }
    requestCache.clear();
    buckets.clear();
    stopIdleJoinWatch();
  });
}
