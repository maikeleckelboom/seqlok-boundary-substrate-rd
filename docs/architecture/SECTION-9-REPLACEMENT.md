# Section 9 Replacement: Introspect domain (`introspect.*`)

> **Note**: This section replaces the old "Diagnostics domain (`diagnostics.*`)" section.
> Copy this into `packages/core/docs/architecture/07-seqlok-api-shape-rationale.md` replacing
> the original Section 9.

---

## 9. Introspect domain (`introspect.*`)

`@seqlok/introspect` is a **host-side sidecar** for observability and health. The runtime engine does not depend on it and can run without it, but hosts are free to enable it in both development and production.

There are three layers involved:

1. **Errors (`introspect.*`)**

- `introspect.counterInvalid`
- `introspect.featureInvalid`

These are raised when the _introspection subsystem itself_ is misconfigured or corrupted:

- invalid counters / budgets / timestamps,
- unknown introspection feature flags.

They carry `ErrorMeta` with:

- `severity: 'warning'`
- `recoverable: true`
- `boundarySafe: false`

`introspect.*` errors represent issues in instrumentation or observability rather than core engine failures. They are expected to be non-fatal and are primarily useful for developers and operators, even in production logs.

2. **Health interpretation**

   The central `interpretHealth(error)` helper treats `introspect.*` as:

- `status: 'degraded'`
- label along the lines of "Introspection subsystem issue"
- hint: "Introspection is misconfigured; core engine remains healthy."

This keeps introspection failures clearly separate from engine failures.

3. **Introspection toolkit**

   This lives under `src/*` in `@seqlok/introspect`:

- `counters` – named introspection counters (degraded snapshots, spin budget exhaustions, …)
- `budgets` – validated limits for introspection work
- `features` – typed feature flags (some dev-only like `seqlockTrace`, others production-appropriate)
- `session` – start/end introspection sessions with timestamp sanity
- `export` – JSON / Prometheus / CSV export for counters

These modules are intended for:

- CI / stress tests
- dev HUDs and profiling tools
- production dashboards and operator observability
- Node/Electron CLIs that scrape metrics

**Architectural invariant**: Runtime packages never import `@seqlok/introspect`. Production behaviour must not _rely_ on introspect being present. This keeps the engine decoupled from observability, but does not ban introspect from production—it simply means the engine runs correctly whether or not introspect is wired in.
