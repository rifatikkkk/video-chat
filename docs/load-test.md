# Reproducible load scenario (Task 68)

The load generator exercises Socket.IO room membership and chat acknowledgements only. It deliberately does not create `RTCPeerConnection` objects, so server signaling/chat load is measured separately from browser WebRTC CPU and network load.

Start the server, then run:

```text
npm run load:test
```

Parameters are environment variables:

```text
LOAD_URL=http://127.0.0.1:3001
LOAD_ROOMS=10
LOAD_PARTICIPANTS=4
LOAD_MESSAGES=20
LOAD_DURATION_MS=60000
LOAD_SLOW_CLIENT_MS=250
```

The generator creates the requested rooms, joins the requested participants, sends chat messages until the duration expires, records ack min/p50/p95/max, captures `/metrics` (rooms, participants, heap/RSS, event-loop lag, history), and disconnects every client in a `finally` block. The JSON output is suitable for CI artifacts or a later capacity report.

`LOAD_SLOW_CLIENT_MS` models a deliberately delayed sender between operations. It is not a WebRTC slow-receiver test; that remains a separate browser/network scenario.
