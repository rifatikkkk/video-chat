import { MAX_PARTICIPANTS } from './rooms/RoomRegistry.js';

const DEFAULT_PORT = 3001;
const DEFAULT_STUN_URLS = Object.freeze(['stun:stun.l.google.com:19302']);

export function parseCsv(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validatePort(value = DEFAULT_PORT) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 to 65535.');
  return port;
}

export function validateOrigins(value) {
  const origins = parseCsv(value);
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('PUBLIC_ORIGIN entries must be absolute HTTP(S) origins.');
  }
  return origins;
}

export function validateStunUrls(value) {
  const urls = parseCsv(value);
  const selected = urls.length ? urls : [...DEFAULT_STUN_URLS];
  for (const url of selected) {
    if (!/^(stun|turn|turns):[^,\s]+$/i.test(url)) throw new Error('STUN_URLS entries must be stun:, turn:, or turns: URLs.');
  }
  return selected;
}

export function validateMaxParticipants(value = MAX_PARTICIPANTS) {
  const count = Number(value);
  if (count !== MAX_PARTICIPANTS) throw new Error(`MAX_PARTICIPANTS must remain ${MAX_PARTICIPANTS}.`);
  return MAX_PARTICIPANTS;
}

export function loadServerConfig(env = process.env) {
  return {
    port: validatePort(env.PORT ?? DEFAULT_PORT),
    publicOrigins: validateOrigins(env.PUBLIC_ORIGIN),
    stunUrls: validateStunUrls(env.STUN_URLS),
    limits: {
      maxParticipants: validateMaxParticipants(env.MAX_PARTICIPANTS ?? MAX_PARTICIPANTS),
    },
  };
}
