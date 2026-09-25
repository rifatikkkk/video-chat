import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { PROTOCOL_VERSION } from '@video-chat/shared';
import { RoomRegistry } from './rooms/RoomRegistry.js';
import { registerHandlers } from './socket/registerHandlers.js';

export function createAppServer({ registry = new RoomRegistry() } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: true },
    pingInterval: 10_000,
    pingTimeout: 10_000,
    connectionStateRecovery: false,
  });

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  io.on('connection', (socket) => {
    socket.emit('server:ready', { v: PROTOCOL_VERSION });
    registerHandlers(socket, registry, io);
  });

  return { app, io, registry, server };
}
