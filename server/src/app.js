import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { PROTOCOL_VERSION } from '@video-chat/shared';
import { RoomRegistry } from './rooms/RoomRegistry.js';
import { registerHandlers } from './socket/registerHandlers.js';
import { SlowConsumerGuard } from './socket/SlowConsumerGuard.js';
import { IdleJoinGuard } from './socket/IdleJoinGuard.js';
import { parseCsv } from './config.js';
import { ServerMetrics } from './metrics/ServerMetrics.js';

export function parseOriginAllowlist(publicOrigin = process.env.PUBLIC_ORIGIN) {
  return Array.isArray(publicOrigin) ? publicOrigin : parseCsv(publicOrigin);
}

export function isOriginAllowed(origin, allowedOrigins = parseOriginAllowlist()) {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
}

export function createAppServer({
  registry = new RoomRegistry(),
  slowConsumerGuard = new SlowConsumerGuard(),
  idleJoinGuard = new IdleJoinGuard(),
  publicOrigin = process.env.PUBLIC_ORIGIN,
  readiness = createReadinessState(),
  metrics = new ServerMetrics(),
} = {}) {
  const allowedOrigins = parseOriginAllowlist(publicOrigin);
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => callback(null, isOriginAllowed(origin, allowedOrigins)),
    },
    allowRequest: (request, callback) => {
      callback(null, isOriginAllowed(request.headers.origin, allowedOrigins));
    },
    pingInterval: 10_000,
    pingTimeout: 10_000,
    connectionStateRecovery: false,
  });

  app.get(['/health', '/healthz'], (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/readyz', (_request, response) => {
    if (!readiness.canAcceptJoins()) {
      response.status(503).json({ status: 'not_ready' });
      return;
    }
    response.json({ status: 'ready' });
  });

  app.get('/metrics', (_request, response) => {
    response.json(metrics.snapshot({ registry }));
  });

  io.on('connection', (socket) => {
    socket.emit('server:ready', { v: PROTOCOL_VERSION });
    registerHandlers(socket, registry, io, { slowConsumerGuard, idleJoinGuard, canAcceptJoins: readiness.canAcceptJoins, metrics });
  });

  return { app, io, metrics, registry, server };
}

export function createReadinessState({ acceptingJoins = true } = {}) {
  return {
    canAcceptJoins: () => acceptingJoins,
    setAcceptingJoins: (nextValue) => { acceptingJoins = Boolean(nextValue); },
  };
}
