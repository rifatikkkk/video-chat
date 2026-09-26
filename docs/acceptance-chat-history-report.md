# Acceptance chat history and acknowledgement report

Date: 2026-09-26

Scope: task 58, covering T10-T12 from the technical design. Browser checks use Chromium with virtual camera/microphone devices and are not hardware-device results.

## Results

| TDD ID | Coverage | Actual result |
| --- | --- | --- |
| T10 | `tests/smoke/chat-history.spec.js`, `tests/integration/socket-server.test.js`, `tests/unit/chat-state.test.js` | Passed. Browser chat renders HTML as text, does not create HTML elements from user input, and confirmed messages remove pending status. Integration coverage confirms timestamps, rate limiting, sender spoofing rejection, and stale/foreign room rejection. |
| T11 | `tests/smoke/chat-history.spec.js`, `tests/unit/history-loader.test.js`, `tests/integration/socket-server.test.js` | Passed. A late browser join receives messages sent before and during the join flow exactly once and in order. History pagination preserves `throughSeq` and merges with live entries without duplicates. |
| T12 | `tests/integration/socket-server.test.js`, `tests/unit/chat-state.test.js` | Passed. Ack retry with the same request/client message is deduplicated to one chat entry; same `clientMessageId` with different text is rejected. Client state keeps unconfirmed messages separate from confirmed entries and does not mark them confirmed without an ack/server entry. |

## Long history and scrolling

`tests/smoke/chat-history.spec.js` sends 90 messages in one browser room. The browser shows the newest message, hides older messages behind the virtualized window, and reveals the first message through `Показать предыдущие сообщения`.

## Commands run

- `npm run check:versions`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:smoke`

## Defects

No defects were found during this task. Manual hardware and network-failure acceptance checks remain in later tasks and are not claimed by this report.
