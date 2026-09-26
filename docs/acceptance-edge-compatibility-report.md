# Acceptance report: Edge compatibility (Task 65)

Date: 2026-09-26  
Scope: T06, T20; PRD §4 (items 10, 36, 37)

## Environment discovery

| Component | Result |
| --- | --- |
| Microsoft Edge executable | Not installed/found on this Windows host |
| Playwright Edge target | `msedge (playwright msedge vundefined)`, `<system>` |
| Chromium for Testing | Available, but intentionally not used as Edge evidence |
| Node.js / npm | v24.18.0 / 11.16.0 |

`Get-Command msedge` and standard `Program Files`/`LOCALAPPDATA` Edge paths did not resolve an executable. Playwright's `msedge` channel therefore has no browser binary to launch.

## Compatibility run result

The Edge smoke command could not be run because the required system Edge executable is absent. No Edge version, negotiation, camera toggle, video, audio, or autoplay result is claimed. The available Chromium run from task 63 is not substituted for Edge.

The minimum supported Edge (>=100) and the current stable Edge version were not tested and must remain unconfirmed.

## Required release follow-up

On a Windows test host with Microsoft Edge installed, run:

```text
npx playwright test --browser=msedge
```

Record `msedge --version` (or the executable ProductVersion), OS/build, HTTPS URL, physical camera/microphone, and results for join, video/audio, autoplay, camera/microphone toggles, and a four-participant room. Repeat with the earliest supported Edge version (>=100); do not mark an unrun version as passed.

## Shared project checks

The application remains covered by the shared `npm run lint`, `npm test`, `npm run build`, and Chromium smoke checks. These validate the codebase but are not Edge compatibility evidence.

## Result

Edge compatibility is blocked by the missing browser installation and is explicitly left unconfirmed pending an actual Edge binary.
