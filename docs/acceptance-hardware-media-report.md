# Acceptance report: hardware camera and microphone (Task 60)

Date: 2026-09-26  
Scope: T08, T09, T17; PRD §4 (items 13–20, 33)

## Automated evidence

- `tests/unit/media-controller.test.js` covers missing devices (`NotFoundError`), permission denial, a pending permission prompt, independent audio/video capture, repeated capture after toggling, unexpected `track.onended` (USB/device removal), idempotent disposal, and late streams returned after disposal.
- The controller invalidates a pending capture before stopping a device. Any stream that resolves after invalidation is stopped immediately and cannot revive state or the device indicator.
- `tests/smoke/browser-smoke.spec.js` and lifecycle smoke tests use two independent browser contexts with virtual camera/microphone devices. They verify that both tabs can capture, publish, and clean up media without sharing session state.

## Manual hardware matrix

The following cases must be run on the release laptop with a real camera/microphone and browser permission UI:

| Case | Expected result |
| --- | --- |
| No camera or microphone connected | Join remains usable only for supported devices; capture shows a clear device-unavailable error and no track is published. |
| Permission denied | The corresponding control remains off; retry is explicit and does not create a stale stream. |
| Permission prompt left pending | The other device can still be captured; leaving the room cancels the pending capture. |
| USB camera/microphone unplugged | `track.onended` turns the device state off, removes its published track, and does not reconnect the room. |
| Turn off/on repeatedly | The old track is stopped once and a fresh track is published on the next explicit enable. |
| Two tabs | Each tab owns independent tracks; leaving one tab stops only its tracks and the hardware indicator turns off when no consumer remains. |

Hardware LED state and browser-specific permission prompts cannot be asserted reliably in CI; they are release checks rather than simulated claims.

## Result

Automated T08/T09/T17 coverage passes. The implementation has no late-stream leak path and does not leave media active after disposal. Real-device LED, USB unplug, and browser permission UI results are captured by the manual matrix above.
