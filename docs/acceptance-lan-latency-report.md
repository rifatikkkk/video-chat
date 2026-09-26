# Acceptance report: LAN end-to-end media latency (Task 66)

Date: 2026-09-26  
Scope: T23; PRD §4 item 10; Design §9.1

## Required measurement stand

The prescribed measurement needs four physical clients on an isolated LAN, an HTTPS deployment, a 120 fps external camera (or equivalent shared visual timer), physical cameras/microphones, and an external audio recorder. None of those release-test resources is available in this local development environment.

The local Chromium smoke uses virtual media and four contexts on one host. It cannot validate LAN propagation, CPU/network contention, hardware LEDs, or camera-to-screen/audio-to-playback delay, so it is not used as a latency result.

## Measurement protocol

Run the procedure from [acceptance-testbed.md](acceptance-testbed.md): four devices, six P2P pairs, at least 30 samples per direction for video and audio, then repeat after 10 minutes and after camera toggles. Record min, median, p95, and max. The acceptance criterion is `max <= 500 ms` for every series.

## Results

| Date | Direction | Media | Samples | Min (ms) | Median (ms) | p95 (ms) | Max (ms) | Result |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-09-26 | A → B/C/D | Video | 0 | — | — | — | — | Not run: no physical 120 fps capture |
| 2026-09-26 | A → B/C/D | Audio | 0 | — | — | — | — | Not run: no external audio recorder |
| 2026-09-26 | B/C/D → A | Video | 0 | — | — | — | — | Not run: no physical testbed |
| 2026-09-26 | B/C/D → A | Audio | 0 | — | — | — | — | Not run: no physical testbed |

No `getStats()` RTT values are presented as end-to-end latency. The in-app WebRTC diagnostics remain useful for troubleshooting only and do not satisfy T23.

## Status

T23 latency acceptance is **unconfirmed/blocked**, not passed. The blocker is missing physical test equipment and HTTPS LAN deployment. Once the testbed is available, append raw recordings, the calculation table, OS/browser/device/network details, and the 10-minute repeat results before marking the ≤500 ms requirement complete.
