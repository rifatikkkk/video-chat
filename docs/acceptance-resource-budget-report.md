# Acceptance report: resource budgets and cleanup (Task 69)

Date: 2026-09-26  
Scope: T22; PRD §4 (items 9, 23, 27, 40)

## Checks performed

- `npm run load:test` is a repeatable Socket.IO/chat-only load scenario. It does not create WebRTC connections, so server resource measurements are not mixed with browser media CPU/network usage.
- The generator now records `/metrics` before cleanup and after disconnecting every generated client. The post-cleanup snapshot is the authoritative registry leak check.
- `tests/unit/room-registry.test.js` verifies that accepted history is retained while new messages are rejected with `SERVER_BUSY` at the configured history budget, and that room/history bytes return to zero after the last participant leaves.
- `tests/integration/socket-server.test.js` verifies explicit `SERVER_BUSY` for new joins while readiness is false, history access for active members, and slow-consumer disconnect while other members continue receiving events.
- `tests/unit/slow-consumer-guard.test.js` verifies the pending-packet queue threshold and deterministic disconnect decision.

## Local capacity smoke

Run used during this task: 2 rooms × 4 participants, 5 seconds, delayed sender 10 ms. The generator reported 38 acknowledged messages, ack latency min/p50/p95/max of 1/2/3/3 ms, 284 explicit `RATE_LIMITED` responses, heap 13.9 MB, RSS 60.8 MB, and event-loop lag 14 ms. Both rooms were created successfully.

The smaller repeat after adding post-cleanup metrics used 1 room × 2 participants × 3 messages and completed with zero rate limits. It confirmed that the generator exits cleanly and captures both metric snapshots.

## Status and limits

The code-level budget and cleanup checks pass. A full 10-room/40-participant, 1 GB, four-hour soak was not run in this local short smoke; its result remains a release/load-test follow-up. No accepted history is deleted to make room for new messages, and budget failures are explicit `SERVER_BUSY`/`RATE_LIMITED` responses.
