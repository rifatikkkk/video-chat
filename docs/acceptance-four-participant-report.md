# Acceptance report: four-participant mixed-browser call (Task 61)

Date: 2026-09-26  
Scope: T06, T20; PRD §4 (items 10–12, 15, 17, 37)

## Automated evidence

- `tests/smoke/browser-smoke.spec.js` joins four independent browser contexts to one room, checks four participant tiles, and toggles one participant's microphone while the other peers remain present. Remote media negotiation is covered by the two-context smoke and PeerManager unit tests; four-engine media playback remains a manual HTTPS check.
- Four participants create exactly six unordered P2P pairs. `tests/unit/peer-manager.test.js` verifies a tab caps at three peer connections and shares local tracks across all three senders.
- `tests/unit/participant-grid.test.js` covers autoplay rejection without losing the assigned remote stream; remote video elements use `autoPlay` and `playsInline`.
- `tests/unit/room-registry.test.js` verifies the room's hard limit of four participants.

The automated run uses Chromium with virtual camera/microphone devices. It validates topology, media publication, and toggles, but is not a mixed-engine result.

## HTTPS mixed-browser release check

On an HTTPS deployment, open four clients: Chrome, Firefox, Edge, and a second supported browser. Join one room and record:

| Check | Expected result |
| --- | --- |
| Six peer pairs | Each participant has up to three active `RTCPeerConnection`s; joining/leaving rebuilds only affected pairs. |
| Audio/video | Each remote tile has one playable media stream; no duplicate audio is audible. |
| Toggles | Microphone and camera off/on propagate to all remaining peers without a renegotiation storm. |
| Autoplay | Remote media starts after the first user gesture; a blocked `play()` does not discard the stream and shows the existing status. |
| Recomposition | When one participant leaves, its three peers close and the remaining three keep their calls. |

Mixed browser engines, real autoplay policies, and HTTPS certificate handling require the release testbed and are not claimed by the local Chromium run.

## Result

Automated four-participant topology and six-pair invariants pass. The browser matrix above is the required HTTPS release check for Chrome/Firefox/Edge interoperability.
