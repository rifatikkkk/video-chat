import { io } from 'socket.io-client';
import { ACK_TIMEOUT_MS, CONNECT_TIMEOUT_MS, PROTOCOL_VERSION } from '@video-chat/shared';

export class SignalingClientError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class SignalingClient {
  constructor({
    url,
    socketFactory = io,
    ackTimeoutMs = ACK_TIMEOUT_MS,
    connectTimeoutMs = CONNECT_TIMEOUT_MS,
    requestIdGenerator = () => crypto.randomUUID(),
  } = {}) {
    this.socket = socketFactory(url, { autoConnect: false, reconnection: false });
    this.ackTimeoutMs = ackTimeoutMs;
    this.connectTimeoutMs = connectTimeoutMs;
    this.requestIdGenerator = requestIdGenerator;
    this.connecting = null;
  }

  on(event, listener) {
    this.socket.on(event, listener);
    return () => this.socket.off(event, listener);
  }

  connect() {
    if (this.socket.connected) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.connecting = new Promise((resolve, reject) => {
      const finish = (callback) => (value) => {
        clearTimeout(timeout);
        this.socket.off('connect', connected);
        this.socket.off('connect_error', failed);
        this.connecting = null;
        callback(value);
      };
      const connected = finish(resolve);
      const failed = finish((error) => reject(error instanceof SignalingClientError ? error : new SignalingClientError('CONNECT_FAILED', error?.message ?? 'Unable to connect.')));
      const timeout = setTimeout(() => {
        this.socket.disconnect();
        failed(new SignalingClientError('CONNECT_TIMEOUT', 'Connection timed out.'));
      }, this.connectTimeoutMs);

      this.socket.once('connect', connected);
      this.socket.once('connect_error', failed);
      this.socket.connect();
    });
    return this.connecting;
  }

  request(event, payload = {}) {
    if (!this.socket.connected) {
      return Promise.reject(new SignalingClientError('NOT_CONNECTED', 'Connect before sending a request.'));
    }
    const request = { v: PROTOCOL_VERSION, requestId: this.requestIdGenerator(), ...payload };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new SignalingClientError('ACK_TIMEOUT', 'The server did not acknowledge the request.')), this.ackTimeoutMs);
      this.socket.emit(event, request, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
  }

  disconnect() {
    this.socket.disconnect();
  }
}
