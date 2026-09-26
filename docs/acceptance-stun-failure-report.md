# Acceptance report: STUN failure and unreachable NAT pair (Task 62)

Date: 2026-09-26  
Scope: T18; PRD §4 (items 10 and 34)

## Automated evidence

- `tests/unit/peer-manager.test.js` simulates one failed ICE pair in a four-person room and verifies that the failed peer is reported independently while the other two peer connections stay open. The manager does not recreate the failed pair or tear down room membership.
- Existing PeerManager tests verify deterministic offerer roles, candidate queue isolation, stale ICE rejection, and independent operation queues.
- `tests/integration/socket-server.test.js` verifies that room events and chat delivery continue for healthy participants when another socket is disconnected or overloaded.
- `client/src/components/ParticipantGrid.jsx` reports `P2P-связь не установилась. Чат работает...` for a failed pair, without fabricating a chat/system reason.

## Manual NAT/STUN release check

The product intentionally uses STUN without TURN. On a test LAN, block STUN/UDP for only one browser pair (or place one client behind an unreachable symmetric NAT) and join four participants:

1. Confirm host candidates still connect where a direct path exists.
2. Confirm only the blocked pair reaches `failed`/`disconnected` and shows the local P2P status.
3. Send chat messages between the remaining participants and verify delivery continues.
4. Remove one healthy participant and verify only its three peer connections close; the failed pair must not cause a room-wide teardown.

Firewall/NAT manipulation is not run in CI because it would affect the host and unrelated jobs. No TURN success is claimed.

## Result

Automated isolation and healthy-peer continuity checks pass. The real STUN-blocked NAT case remains a documented HTTPS/LAN release check, with explicit no-TURN expectations.
