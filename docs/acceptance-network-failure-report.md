# Acceptance report: network/server failure (Task 59)

Date: 2026-09-26  
Scope: T14, T19; PRD §4 (items 9, 27, 31, 35, 36)

## Automated evidence

- `tests/unit/room-session.test.js` verifies that a signaling `disconnect` is terminal: the session does not reconnect, sends no invented `room:leave`, and disposes media and peer managers exactly once.
- `tests/integration/socket-server.test.js` verifies that when a participant disconnects, the room slot is released and remaining participants continue receiving room events. The overloaded-recipient scenario also confirms that one disconnected recipient does not stop delivery to other members.
- `tests/smoke/browser-smoke.spec.js` verifies a clear WebRTC-unsupported screen. The form is disabled, so no session or media capture can be created.
- `tests/unit/signaling-client.test.js` verifies `reconnection: false`; retry is manual through the form.

## Manual network scenarios

The following scenarios require an OS/browser network control and are intentionally not emulated by CI:

1. Join a room in two browser contexts, blackhole the signaling connection for one context, and wait for the Socket.IO disconnect timeout. Confirm the affected context returns to the join form, camera/microphone tracks stop, and no chat message claims a reason that was not received from the server.
2. Stop the server, confirm the same terminal/manual-retry state, then start it again. Confirm the old tab does not auto-reconnect; submitting the form creates a new session.
3. Open the app from a non-secure origin other than localhost and verify the browser's media-permission error is shown. Production deployment must use HTTPS.

These manual checks are recorded separately because CI cannot safely blackhole only one browser's network without changing the host firewall or affecting unrelated jobs.

## Result

Automated T14/T19 coverage passes. The implementation preserves the call for remaining peers, closes media after disconnect detection, releases server membership on socket disconnect, and never fabricates a chat reason. The blackhole, server restart, and non-secure-origin cases are documented as release-check steps.
