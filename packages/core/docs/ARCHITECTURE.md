# Architecture Notes

- **Owner/Main**: `planSpec → allocateShared → bindController → buildHandoff → postMessage(handoff)`
- **Processor**: `receiveHandoff → bindProcessor` (no planning/mapping on processor side).
- **Domains**: PU for params (Controller writer), MU for meters (Processor writer).

**Controller reads:** `*.snapshot(...)` (values) and `*.snapshotWithStatus(...)` (values + status pair).  
Both follow the same coherent reader path; the latter additionally returns `SnapshotStatus` telemetry.

**Identity & Zero‑alloc:** For array keys provided in `into`, buffers are filled in place and returned by identity. Others allocate a fresh typed array.
