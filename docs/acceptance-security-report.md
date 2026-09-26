# Acceptance report: HTTPS security checks (Task 70)

Date: 2026-09-26  
Scope: T01, T21; PRD §4 items 38–40; Design §10

## Automated evidence

| Check | Evidence | Result |
| --- | --- | --- |
| Foreign Origin | `tests/integration/socket-server.test.js` connects with allowed and `https://evil.example.test` origins over polling and WebSocket | Foreign origin rejected; allowlisted origin accepted |
| Inter-room access | `tests/integration/socket-server.test.js` requests foreign `history:get` and `media:update` | Both rejected with `STALE_ROOM`; no cross-room data returned |
| XSS payload | `tests/smoke/chat-history.spec.js` renders `<b>safe & visible</b>` as text; `chat-state`/React rendering keeps text content | No HTML element is created |
| Oversize/flood | Shared protocol payload limits plus Socket.IO TokenBucket checks; integration metrics assert rate-limit counter | Explicit validation/rate-limit error; accepted history is not deleted |
| Access logs | `tests/unit/deployment-reverse-proxy.test.js` checks room-ID redaction and absence of request bodies/chat/SDP/ICE from `video_chat_safe` | Sensitive values excluded by config |
| Browser security headers | `tests/unit/deployment-reverse-proxy.test.js` checks CSP, `frame-ancestors 'none'`, Permissions-Policy, no-referrer, and cache rules | Required headers present |

## HTTPS release check

The local automated server uses HTTP. The nginx configuration in `deploy/nginx/video-chat.conf` is the HTTPS termination point and must be exercised on a real HTTPS host before release. On that host, repeat the matrix with a foreign Origin, room URL containing a random ID, XSS/oversize/flood payloads, and inspect proxy logs for absence of room IDs, names, chat text, SDP, and ICE candidates.

## Result

Automated T01/T21 security evidence passes. The HTTPS-specific proxy deployment and certificate/browser trust portion remains a release-staging check; no local HTTP result is presented as proof of production TLS.
