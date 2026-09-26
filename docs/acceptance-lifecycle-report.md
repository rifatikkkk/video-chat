# Acceptance lifecycle and join-race report

Date: 2026-09-26

Scope: task 57, covering T02-T05 and T13-T16 from the technical design. These checks focus on room entry races and full UI lifecycle behavior. Browser smoke uses Chromium with virtual camera/microphone devices and is not a hardware-device result.

## Results

| TDD ID | Coverage | Actual result |
| --- | --- | --- |
| T02 | `tests/smoke/lifecycle-race.spec.js` and `tests/unit/room-registry.test.js` | Passed. Two browser contexts can join with the same display name, both tabs show two participant slots, and each tab marks only its own participant as `(вы)`. Registry also assigns distinct internal participant IDs for identical names. |
| T03 | `tests/smoke/lifecycle-race.spec.js` and `tests/unit/invitation.test.js` | Passed. Creating a room updates the URL to `/room/<id>` without reload. Clipboard success shows a success status, and unavailable Clipboard API shows the manual fallback input. |
| T04 | `tests/smoke/lifecycle-race.spec.js` and `tests/unit/room-registry.test.js` | Passed. A valid unknown room ID creates a room. After the last participant leaves, reusing the same room ID creates a fresh room with one participant and without previous chat history. |
| T05 | `tests/unit/room-registry.test.js` | Passed. With 3 seeded participants, 20 concurrent joins produce exactly 1 success and room size never exceeds 4; request replay does not consume another slot. |
| T13 | `tests/integration/socket-server.test.js` and `tests/unit/room-registry.test.js` | Passed. Leave/disconnect cleanup is idempotent and produces one participant-left/system leave result. |
| T15 | `tests/smoke/lifecycle-race.spec.js`, `tests/unit/app-routing.test.js`, and `tests/unit/room-session.test.js` | Passed. Reload returns to manual room-entry form on the same URL with an empty name and no restored participant UI state. bfcache restore is covered at unit/session level and does not reconnect automatically. |
| T16 | `tests/integration/socket-server.test.js` and `tests/unit/room-registry.test.js` | Passed. After the last participant leaves, the room and membership indexes are removed; stale epoch operations are rejected by registry/session handling. |

## Commands run

- `npm run check:versions`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:smoke`

## Defects

No defects were found during this task. Follow-up hardware, mixed-browser, network blackhole, and long-running checks remain in later acceptance tasks and are not claimed by this report.
