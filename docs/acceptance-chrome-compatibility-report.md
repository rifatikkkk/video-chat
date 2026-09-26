# Acceptance report: Chrome compatibility (Task 63)

Date: 2026-09-26  
Scope: T06, T20; PRD §4 (items 10, 36, 37)

## Environment actually executed

| Component | Version | Result |
| --- | --- | --- |
| Chrome for Testing (Playwright Chromium) | 153.0.8010.12 | Tested |
| Playwright | 1.63.0 | Tested |
| Node.js | v24.18.0 | Tested |
| npm | 11.16.0 | Tested |
| OS | Windows | Tested |
| HTTPS | No; local `http://127.0.0.1` | Local smoke only |
| Physical camera/microphone | No; Chromium virtual devices | Virtual media only |

The browser binary is Chrome for Testing 153.0.8010.12 supplied by Playwright 1.63.0. The application engine requirement is Chromium-compatible; this is an actual Chromium run, not a unit-test-only claim.

## Automated results

- `npm run lint`: passed.
- `npm test`: passed (116 unit tests, 13 integration tests).
- `npm run build`: passed.
- `npm run test:smoke`: passed (10 tests): two-context negotiation and virtual media, four-participant room topology, microphone toggle, autoplay-safe remote video element setup, chat, reload, and lifecycle races.
- `tests/unit/participant-grid.test.js`: autoplay rejection keeps the remote stream assigned for a later user-gesture retry.

## Matrix status

| Chrome target | Status | Notes |
| --- | --- | --- |
| Earliest supported Chrome >=100 | Not tested | No isolated Chrome 100 binary is installed in this environment; do not mark as passed. |
| Current Chrome for Testing 153.0.8010.12 | Passed locally | Virtual camera/microphone, local HTTP smoke; HTTPS and physical hardware remain release checks. |

## Release follow-up

Run the same smoke on an isolated HTTPS testbed with the earliest supported Chrome version (>=100) and record the exact build, OS, physical devices, and autoplay result. This report intentionally does not substitute current Chromium for that minimum-version check.

## Result

Current Chrome for Testing passes the automated compatibility smoke. The minimum-version and HTTPS/physical-device rows remain unconfirmed and are explicitly not marked as passed.
