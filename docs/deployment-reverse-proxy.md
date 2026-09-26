# HTTPS reverse proxy and SPA routes

Production deployment uses one Node.js application process behind one HTTPS reverse proxy. The proxy terminates TLS and exposes a single same-origin site for the React SPA, Socket.IO, health checks, readiness, and metrics.

Reference nginx configuration: [deploy/nginx/video-chat.conf](../deploy/nginx/video-chat.conf).

## Process model

- Run exactly one Node.js process for the app. Do not run a second replica: rooms, participants, chat history, and Socket.IO membership are intentionally in memory.
- Build the SPA with `npm run build` and publish `client/dist` as the proxy document root.
- Start the Node.js process with `npm run start` on `127.0.0.1:3001`.
- Set `PUBLIC_ORIGIN` to the public HTTPS origin, for example `https://video.example.com`, so the server Origin check matches browser Socket.IO handshakes.

## Route split

The proxy must keep backend endpoints out of the SPA fallback:

- `/socket.io/` is proxied to Node.js with WebSocket upgrade and HTTP long-polling support.
- `/health`, `/healthz`, `/readyz`, and `/metrics` are proxied to Node.js.
- `/assets/*` is served only as a static file and returns `404` when the asset is missing.
- frontend routes, including direct room URLs such as `/room/abc123`, fall back to `/index.html`.

This lets a copied room link open the UI directly while Socket.IO and health endpoints never receive `index.html`.

## Timeouts and same-origin

Socket.IO uses a 10 s ping interval and 10 s ping timeout in the server. The reverse proxy uses 60 s `proxy_read_timeout` and `proxy_send_timeout`, leaving enough margin for WebSocket and long-polling transports.

The browser talks to one HTTPS origin. The SPA does not need a separate API host; Socket.IO connects to `/socket.io` on the same origin.

## TLS

TLS is terminated at the reverse proxy. Use a real certificate for the target domain before enabling camera and microphone outside localhost, because `getUserMedia` and WebRTC require a secure context.

The nginx template redirects HTTP to HTTPS and forwards `X-Forwarded-Proto: https` to the Node.js process.

## Security headers, cache, and logs

The reverse proxy sets browser security headers without blocking the required media APIs:

- `Content-Security-Policy` allows same-origin scripts/styles/connects, `wss:` for Socket.IO over TLS, `blob:` media URLs, and blocks embedding with `frame-ancestors 'none'`.
- `Permissions-Policy` allows `camera` and `microphone` for `self` only and disables unrelated capabilities such as geolocation, payment, and USB.
- `Referrer-Policy: no-referrer` prevents room URLs from being sent as referrers.
- `X-Content-Type-Options: nosniff` is enabled.

Cache policy is split by route:

- `/assets/*` gets `public, max-age=31536000, immutable` for hashed Vite assets.
- everything else, including `index.html` and direct `/room/<id>` SPA routes, gets `no-cache` so a release is picked up quickly.

Access logs use `video_chat_safe`, which replaces `/room/<id>` paths with `/room/[room-id-redacted]`. Keep query strings out of the log format and do not log request bodies, chat messages, display names, SDP, or ICE candidates.

## Handshake and idle join limits

The reverse proxy applies per-IP request limits before traffic reaches Node.js:

- `/socket.io/` uses `video_chat_handshake` at `2r/s` with `burst=20 nodelay`. This allows a small office NAT to open four legitimate clients at once while limiting handshake floods.
- operational HTTP routes use `video_chat_http` at `20r/s` with separate bursts for probes and metrics.

The Node.js server also disconnects sockets that connect but do not successfully `room:create` or `room:join` within 30 seconds. Disconnecting an idle pre-join socket does not remove an active room, because the socket has no registry membership yet.

## Planned shutdown

Send `SIGTERM` or `SIGINT` to the single Node.js process for a planned stop:

1. The process marks readiness as false, so `/readyz` returns `503` and new `room:create` / `room:join` attempts receive `SERVER_BUSY`.
2. Active clients receive `server:closing` with reason `maintenance`; the UI tells users to return manually.
3. After `SHUTDOWN_GRACE_MS` (default 10 seconds, configurable from 1 to 60 seconds), the server closes Socket.IO clients and the HTTP server.

Rooms, participants, and chat history are in memory. A newly started process does not restore rooms from the old process.
