import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { PROTOCOL_VERSION } from '@video-chat/shared';
import { RoomRegistry } from './rooms/RoomRegistry.js';
import { registerHandlers } from './socket/registerHandlers.js';
import { SlowConsumerGuard } from './socket/SlowConsumerGuard.js';

export function parseOriginAllowlist(publicOrigin = process.env.PUBLIC_ORIGIN) {
  return String(publicOrigin ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin, allowedOrigins = parseOriginAllowlist()) {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
}

export function createAppServer({ registry = new RoomRegistry(), slowConsumerGuard = new SlowConsumerGuard(), publicOrigin = process.env.PUBLIC_ORIGIN } = {}) {
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

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  io.on('connection', (socket) => {
    socket.emit('server:ready', { v: PROTOCOL_VERSION });
    registerHandlers(socket, registry, io, { slowConsumerGuard });
  });

  return { app, io, registry, server };
}
