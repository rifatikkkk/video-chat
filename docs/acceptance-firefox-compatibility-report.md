# Acceptance report: Firefox compatibility (Task 64)

Date: 2026-09-26  
Scope: T06, T20; PRD §4 (items 10, 36, 37)

## Environment attempted

| Component | Version | Result |
| --- | --- | --- |
| Firefox (Playwright) | 155.0 (build v1543) | Installed; smoke blocked before app launch |
| Playwright | 1.63.0 | Tested |
| Node.js | v24.18.0 | Tested |
| npm | 11.16.0 | Tested |
| OS | Windows | Tested |

Firefox was installed into `C:\Users\Rifat\AppData\Local\ms-playwright\firefox-1543` and invoked with `npx playwright test --browser=firefox`.

## Compatibility run result

The run stopped in `browser.newContext` for all 10 smoke tests with:

> `Unknown permission: camera`

The current smoke suite uses Chromium's `camera`/`microphone` permission names and fake-device launch flags. Playwright Firefox rejects those permission entries before navigation, so negotiation, camera switching, and autoplay were not exercised. This is an infrastructure/configuration blocker, not a Firefox pass or an application failure.

The minimum supported Firefox (>=100) was not installed or tested. It must not be marked as passed.

## Required follow-up to unblock Firefox

Create a Firefox-specific Playwright project that:

1. removes Chromium-only `permissions: ['camera', 'microphone']` from Firefox contexts;
2. enables Firefox fake media through Firefox preferences (`media.navigator.streams.fake` and `media.navigator.permission.disabled`);
3. runs the two-context negotiation, camera toggle, and autoplay tests on Firefox 155.0;
4. repeats the same run on the earliest supported Firefox version (>=100) and records HTTPS/physical-device results separately.

Until that project exists, this task remains unconfirmed for Firefox. Chromium results from task 63 do not substitute for Firefox.

## Project checks on the shared code

The shared application still passes `npm run lint`, `npm test`, `npm run build`, and the Chromium smoke suite. Those results are not Firefox compatibility evidence.
