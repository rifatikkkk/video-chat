import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { PROTOCOL_VERSION } from '@video-chat/shared';

export function createAppServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: true } });

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  io.on('connection', (socket) => {
    socket.emit('server:ready', { v: PROTOCOL_VERSION });
  });

  return { app, io, server };
}
