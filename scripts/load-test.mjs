import { io } from 'socket.io-client';
import { randomUUID } from 'node:crypto';

const url = process.env.LOAD_URL ?? 'http://127.0.0.1:3001';
const rooms = positiveInt('LOAD_ROOMS', 2);
const participantsPerRoom = positiveInt('LOAD_PARTICIPANTS', 4);
const messagesPerRoom = positiveInt('LOAD_MESSAGES', 20);
const durationMs = positiveInt('LOAD_DURATION_MS', 10_000);
const slowClientDelayMs = positiveInt('LOAD_SLOW_CLIENT_MS', 0);
const clients = [];
const ackLatencies = [];
let rateLimited = 0;
const createdRooms = [];
const startedAt = Date.now();

function positiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function request(socket, event, data) {
  const requestId = randomUUID();
  return socket.timeout(5_000).emitWithAck(event, { v: 1, requestId, ...data });
}

function createClient() {
  const socket = io(url, { transports: ['websocket'], reconnection: false, autoConnect: true });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

async function join(socket, roomId, displayName) {
  const result = await request(socket, 'room:join', { roomId, displayName });
  if (!result.ok) throw new Error(`join failed: ${result.error?.code ?? 'UNKNOWN'}`);
  return result.data;
}

async function main() {
  const roomsData = [];
  for (let roomIndex = 0; roomIndex < rooms; roomIndex += 1) {
    const owner = await createClient();
    const created = await request(owner, 'room:create', { displayName: `Load owner ${roomIndex + 1}` });
    if (!created.ok) throw new Error(`create failed: ${created.error?.code ?? 'UNKNOWN'}`);
    const room = created.data;
    createdRooms.push(room.roomId);
    const members = [{ socket: owner, data: room }];
    for (let participantIndex = 1; participantIndex < participantsPerRoom; participantIndex += 1) {
      const member = await createClient();
      const joined = await join(member, room.roomId, `Load user ${roomIndex + 1} ${participantIndex + 1}`);
      members.push({ socket: member, data: joined });
    }
    roomsData.push({ room, members });
  }

  const deadline = Date.now() + durationMs;
  let messageNumber = 0;
  const roomMessageCounts = roomsData.map(() => 0);
  while (Date.now() < deadline) {
    if (roomMessageCounts.every((count) => count >= messagesPerRoom)) break;
    for (const [roomIndex, roomData] of roomsData.entries()) {
      if (roomMessageCounts[roomIndex] >= messagesPerRoom || Date.now() >= deadline) continue;
      const sender = roomData.members[0].socket;
      const text = `load-${roomIndex + 1}-${messageNumber + 1}`;
      if (slowClientDelayMs) await new Promise((resolve) => setTimeout(resolve, slowClientDelayMs));
      const sentAt = performance.now();
      const result = await request(sender, 'chat:send', {
        roomEpoch: roomData.room.roomEpoch,
        clientMessageId: randomUUID(),
        text,
      });
      if (!result.ok) {
        if (result.error?.code === 'RATE_LIMITED') {
          rateLimited += 1;
          continue;
        }
        throw new Error(`chat failed: ${result.error?.code ?? 'UNKNOWN'}`);
      }
      ackLatencies.push(Math.round(performance.now() - sentAt));
      roomMessageCounts[roomIndex] += 1;
      messageNumber += 1;
    }
  }

  const metricsBeforeCleanup = await fetch(`${url}/metrics`).then((response) => response.json());
  for (const socket of clients) socket.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const metricsAfterCleanup = await fetch(`${url}/metrics`).then((response) => response.json());
  const sorted = [...ackLatencies].sort((a, b) => a - b);
  const percentile = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
  console.log(JSON.stringify({
    url,
    durationMs,
    rooms,
    participantsPerRoom,
    messages: ackLatencies.length,
    rateLimited,
    slowClientDelayMs,
    ackLatencyMs: { min: sorted[0] ?? null, p50: percentile(0.5), p95: percentile(0.95), max: sorted.at(-1) ?? null },
    serverMetricsBeforeCleanup: metricsBeforeCleanup,
    serverMetricsAfterCleanup: metricsAfterCleanup,
    createdRooms: createdRooms.length,
    elapsedMs: Date.now() - startedAt,
  }, null, 2));
}

try {
  await main();
} finally {
  for (const socket of clients) socket.disconnect();
}
