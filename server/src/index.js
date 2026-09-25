import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';

const port = Number(process.env.PORT ?? 3001);
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

io.on('connection', (socket) => {
  socket.emit('server:ready');
});

server.listen(port, () => {
  console.log(`Video Chat server listening on http://localhost:${port}`);
});
