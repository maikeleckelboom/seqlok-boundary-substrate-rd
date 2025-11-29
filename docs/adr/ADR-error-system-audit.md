# Seqlok Error System Audit v1.0

*Applies to Seqlok v1.0.x*

> **Goal:** Make numeric error codes first-class citizens for native language ports (C++, Rust).

This document serves as both an audit report and the **reference specification** for the Seqlok error system. It covers code usage, detail type alignment, domain ID allocation, wire format, and native port expectations.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Numeric Code Architecture](#numeric-code-architecture)
  - [Structure](#structure)
  - [String Code Format](#string-code-format)
  - [Domain ID Allocation](#domain-id-allocation-v1--abi-stable)
  - [Error Envelope](#error-envelope)
  - [Host Handling Policy](#host-handling-policy)
- [Audit Findings by Domain](#audit-findings-by-domain)
- [Required Fixes](#required-fixes)
- [Decisions Required](#decisions-required)
- [Domain Visibility Contract](#domain-visibility-contract)
- [Registry Architecture](#registry-architecture)
- [Adding a New Error Code](#adding-a-new-error-code)
- [Native Port Expectations](#native-port-expectations)
- [Invariants (Enforced by Tests)](#invariants-enforced-by-tests)
- [Worked Example](#worked-example-backingallocundersized)
- [Summary Checklist](#summary-checklist)

---

## Executive Summary

The error system is fundamentally sound. All domains have proper code definitions and detail types. The audit identified:

- **1 runtime bug** — error created but not thrown
- **3 type/field misalignments** — detail types vs call sites
- **4 unused codes** — need decision: wire or remove
- **Several documentation gaps** — now addressed in this document

Once the fixes are applied, native ports can import the domain table, consume the manifest, and implement `switch` statements directly.

---

## Numeric Code Architecture

### Structure

Error codes use an **8-bit domain ID** (high bits) and **24-bit local ordinal** (low bits):

```
code = (domainId << 24) | localOrdinal
```

Decoding:

```
domainId     = (code >>> 24) & 0xff
localOrdinal = code & 0x00ff_ffff
```

This provides 256 domains with ~16 million codes per domain — vastly exceeding any foreseeable requirements.

### String Code Format

String codes follow the pattern `"<domain>.<localKey>"`, e.g. `"backing.allocFailed"` where:

- `domain` ∈ `{env, backing, primitives, binding, spec, plan, handoff, introspect, internal, ...}`
- `localKey` matches the registry key exactly (camelCase)

### Domain ID Allocation (v1 — ABI Stable)

The domain ID table and numeric encoding are **ABI-stable as of v1.0**. Native ports implement `computeNumericCode` following this contract.

| ID  | Domain        | Purpose                                     |
|-----|---------------|---------------------------------------------|
| 0   | *(reserved)*  | Reserved for "unknown" or "unset"           |
| 1   | `env`         | Host environment / SAB gate                 |
| 2   | `backing`     | Memory shapes and allocation                |
| 3   | `primitives`  | Atomics, seqlock, counters                  |
| 4   | `binding`     | Param/meter bindings, coherence             |
| 5   | `spec`        | Declarative model of params/meters          |
| 6   | `plan`        | Layouts derived from specs                  |
| 7   | `handoff`     | Writing layouts into shared backing         |
| 8   | `introspect`  | Observability and instrumentation sidecar   |
| 9   | `internal`    | Invariants and "this is a bug"              |
| 20  | `commands`    | *(future)* Command ring operations          |
| 30  | `hotswap`     | *(future)* Hot-swap protocol                |
| 40  | `integration` | *(future)* Integration tests                |
| 50  | `playground`  | *(future)* Dev/experimentation              |
| 200–255 | *(reserved)* | Extensions and third-party domains       |

**Range 10–19** is reserved as "Core v2" in case a fundamental domain is missing.

### Error Envelope

Seqlok errors are always transported as a JSON-ish envelope:

```ts
interface SeqlokErrorEnvelope {
  code: string;          // "backing.allocFailed"
  numericCode: number;   // 0x02_0001
  message: string;       // human readable
  details: JsonValue;    // domain-specific detail object
  severity: "info" | "warning" | "error";
  recoverable: boolean;
  boundarySafe: boolean;
}
```

- JS code should always include both `code` and `numericCode`.
- Native ports may choose to only use `numericCode` internally, but must be able to emit the envelope for logs/telemetry.
- The `details` object shape is determined by `CodeToPayload[code]`.

### Host Handling Policy

| Domain | Severity | Recoverable | Typical Host Action |
|--------|----------|-------------|---------------------|
| `env.*` | error | false | Refuse to start runtime; show env message |
| `backing.*` | error | false | Fail allocation/mapping; stop engine |
| `primitives.*` | error | varies | Log, possibly retry, surface to dev tools |
| `binding.*` | error | true | Reject API call; keep runtime alive |
| `spec.*` | error | true | Reject spec definition; report to caller |
| `plan.*` | warning | true | Log, maybe suggest smaller spec |
| `handoff.*` | error | true | Refuse handoff; instruct to re-export |
| `introspect.*` | warning | true | Non-critical: log observability warnings |
| `internal.*` | error | false | Treat as bug: crash context / raise alarm |

**Rules:**

- `recoverable === false` → host may tear down the affected engine/context.
- `boundarySafe === false` → scrub `details` before sending outside the trust boundary.

---

## Audit Findings by Domain

### Pass 1: Core Low-Level Domains

#### `env.*` — Environment

| Code | Status | Notes |
|------|--------|-------|
| `env.unsupported` | ✅ Used | `assertSabSupportFromSummary`, `throwEnvUnsupported` |
| `env.coopCoepRequired` | ✅ Used | `throwEnvUnsupported` |

All env codes are used. Environment errors are terminal; no recovery path.

---

#### `backing.*` — Memory Allocation

| Code | Status | Notes |
|------|--------|-------|
| `backing.allocFailed` | ⚠️ Bug | Created but **not thrown** in `allocateSharedPartitioned` |
| `backing.allocUndersized` | ✅ Used | Correctly thrown in `mapPackedBacking` |
| `backing.viewMappingFailed` | ✅ Used | Used in `mapViews` |
| `backing.intoTypeMismatch` | ⚠️ Unused | Not thrown anywhere |
| `backing.intoLengthMismatch` | ⚠️ Unused | Not thrown anywhere |

**Action:** Fix the throw bug. Decide on unused codes (wire or remove).

---

#### `primitives.*` — Low-Level Concurrency

| Code | Status | Notes |
|------|--------|-------|
| `primitives.invalidSpinBudget` | ✅ Used | Validated on binding construction |
| `primitives.atomicsFailed` | ✅ Used | Caught Atomics errors |
| `primitives.seqlockTimeout` | ✅ Used | Bounded acquire path |
| `primitives.planeUnaligned` | ⚠️ Unused | No alignment check calls this yet |
| `primitives.swsrRingInvalidLayout` | ✅ Used | Ring validation |

All used codes are wired. `planeUnaligned` may be reserved for future hardening.

---

### Pass 2: API-Surface Domains

#### `spec.*` — DSL Errors

| Code | Status | Notes |
|------|--------|-------|
| `spec.invalid` | ✅ Used | General spec validation |
| `spec.builderInvalid` | ✅ Used | `createSharedContext` wrapper |
| `spec.duplicateKey` | ✅ Used | Key collision in params/meters |
| `spec.rangeInvalid` | ✅ Used | `{min,max}` sanity |
| `spec.arrayInvalid` | ✅ Used | Bad array length |

All spec codes are used.

---

#### `plan.*` — Layout Planning

| Code | Status | Notes |
|------|--------|-------|
| `plan.failed` | ✅ Used | Generic planning failure |
| `plan.overflowRisk` | ✅ Used | Total bytes / count overflow |
| `plan.alignmentImpossible` | ✅ Used | Alignment constraints |
| `plan.layoutMismatch` | ✅ Used | Plan vs backing mismatch |

All plan codes are used.

---

#### `binding.*` — Bindings

| Code | Status | Notes |
|------|--------|-------|
| `binding.doubleBind` | ✅ Used | Re-binding same role |
| `binding.snapshotFailed` | ✅ Used | Coherent read failure |
| `binding.snapshotRetryExhausted` | ✅ Used | Retry budget exceeded |
| `binding.shapeInvalid` | ⚠️ Unused | Reserved for future shape validation |
| `binding.staleSnapshot` | ✅ Used | Degraded-mode snapshot |

Most binding codes are used. `shapeInvalid` is reserved.

---

#### `handoff.*` — Handoff Protocol

| Code | Status | Notes |
|------|--------|-------|
| `handoff.invalidArtifact` | ✅ Used | Broken handoff structure |
| `handoff.versionMismatch` | ✅ Used | Schema version incompatibility |
| `handoff.specMismatch` | ✅ Used | Spec hash mismatch |
| `handoff.backingMismatch` | ✅ Used | Backing capacity mismatch |

All handoff codes are used. Consider marking all as `boundarySafe: false` since artifacts may contain sensitive data.

---

#### `introspect.*` — Observability

| Code | Status | Notes |
|------|--------|-------|
| `introspect.counterInvalid` | ✅ Used | Invalid counter values |
| `introspect.featureInvalid` | ✅ Used | Invalid feature flags |

All introspect codes are used. These represent observability issues, are non-fatal, and should not cross trust boundaries.

---

## Required Fixes

### Critical (Runtime Bug)

1. **`allocateSharedPartitioned` — throw the error**
   ```ts
   // Current (broken):
   } catch (cause) {
     createBackingError("allocFailed", { ... }, cause);
     // falls through, returns broken backing
   }
   
   // Fixed:
   } catch (cause) {
     throw createBackingError("allocFailed", { ... }, cause);
   }
   ```

### Type Alignment

2. **`throwEnvUnsupported` — add `where` parameter**
   ```ts
   export function throwEnvUnsupported(
     where: EnvUnsupportedDetails["where"],
     feature: EnvUnsupportedDetails["feature"],
     reason: string,
     cause?: unknown,
   ): never {
     throw createEnvError("unsupported", { where, feature, reason }, cause);
   }
   ```

3. **`allocUndersized` call sites — rename fields**
   ```ts
   // Change from:
   { requiredBytes, actualBytes }
   // To match detail type:
   { requestedBytes, allocatedBytes }
   ```

4. **`CodeToPayload` — tighten primitives mappings**
   
   Map `primitives.*` codes to their concrete detail types instead of generic `ErrorDetails`:
   ```ts
   "primitives.planeUnaligned": PrimitivesPlaneUnalignedDetails;
   "primitives.atomicsFailed": PrimitivesAtomicsFailedDetails;
   "primitives.invalidSpinBudget": PrimitivesInvalidSpinBudgetDetails;
   ```
   
   (Other domains — backing, binding, handoff — are already correctly mapped.)

---

## Decisions Required

### Unused Codes

For each unused code, choose one:

| Code | Option A: Wire It | Option B: Remove It |
|------|-------------------|---------------------|
| `backing.intoTypeMismatch` | Reserve for future low-level `backing.into*` helpers | Delete if binding layer owns all snapshot semantics |
| `backing.intoLengthMismatch` | Same as above | Same as above |
| `primitives.planeUnaligned` | Add invariant in `primitives/planes.ts` for alignment checks | Delete if plan layer handles all alignment |
| `binding.shapeInvalid` | Wire into shape validation (rank/layout mismatches) | Delete if not needed for v1 |

**Recommendation:** Keep as reserved with TODO comments, or delete now to keep registry clean. Don't leave them in limbo.

---

## Domain Visibility Contract

### Clarification on `plan.*` vs `spec.*`

The original suggestion "callers should never see `plan.*`" is too strong. The actual contract:

- **`spec.*`** = "your DSL/shape is wrong" (user error)
- **`plan.*`** = "spec is valid, but planning hit a limit" (resource/policy issue)

**Recommended contract:**

> High-level spec builders (like `createSharedContext`) may rewrap `plan.*` failures as `spec.builderInvalid` with `reason: "planFailed"`. Low-level planning APIs (`planLayout`, native bindings) may throw `plan.*` directly.

Native bindings are explicitly allowed to surface `plan.*` directly when they call planning APIs.

This keeps the layering honest while giving most users a simpler `spec.*`-only surface.

---

## Registry Architecture

The current structure is correct:

- **`packages/core/src/errors/registry.ts`** — type-only mapping (`CodeToPayload`)
- **`packages/introspect/src/errors/all-domains.ts`** — aggregates domain descriptors for tooling

This keeps core decoupled from the aggregation layer. Any leftover runtime `ERRORS` or `ERROR_REGISTRY` global maps can be removed.

**Ownership rule:** No package outside `@seqlok/core` may define new core domains (IDs 1–9). Extensions must live in their own packages with IDs in the 200–255 range.

---

## Adding a New Error Code

Follow this checklist to keep the registry clean and consistent:

1. **Pick the correct domain** (`env`, `backing`, `binding`, `spec`, `plan`, `handoff`, `introspect`, `internal`, or a new extension domain).

2. **Define a detail type** in that domain's `codes/*.ts` file:
   ```ts
   export interface FooBarDetails extends ErrorDetails {
     where: string;
     someField: number;
     // ...domain-specific fields
   }
   ```

3. **Add an entry to the domain descriptor map** with:
   - `message` — human-readable template
   - `severity` — `"info"`, `"warning"`, or `"error"`
   - `recoverable` — can the caller continue?
   - `boundarySafe` — safe to send details across trust boundaries?

4. **Add the entry to `CodeToPayload`** using the concrete detail type:
   ```ts
   "domain.fooBar": FooBarDetails;
   ```

5. **Expose a helper** — either `createXxxError("codeName", details)` or a domain-local `throwFooBar(...)` helper.

6. **Add at least one unit test** that:
   - Throws the error
   - Asserts `code`, `numericCode`, `severity`, and a key detail field

**New domains** must use IDs in `200–255` and live in their own packages.

**Deprecation rule:** Never reuse numeric codes. To deprecate a code, keep it in the manifest with `"deprecated": true` rather than removing it. This ensures native enums remain stable.

---

## Native Port Expectations

Native bindings are expected to:

1. **Consume `error-manifest.v1.json`** from `@seqlok/introspect` as the single source of truth.

2. **Generate an enum** from the manifest:
   ```cpp
   enum class seqlok_error_code : std::uint32_t {
     env_unsupported             = 0x01'0001,
     env_coop_coep_required      = 0x01'0002,
     backing_alloc_failed        = 0x02'0001,
     backing_alloc_undersized    = 0x02'0002,
     // ...
   };
   ```

3. **Provide decode helpers**:
   ```cpp
   std::optional<seqlok_error_code> decode(std::uint32_t numeric);
   
   constexpr std::uint8_t domain_id(std::uint32_t code) {
     return (code >> 24) & 0xff;
   }
   
   constexpr std::uint32_t local_ordinal(std::uint32_t code) {
     return code & 0x00ff'ffff;
   }
   ```

4. **Handle unknown codes gracefully**:
   - `domainId != 0` → forward as "opaque but structured"
   - `domainId == 0` → treat as "legacy / unknown"

The manifest is the single source of truth; the table in this document mirrors it.

---

## Invariants (Enforced by Tests)

These invariants are enforced by tests in `@seqlok/introspect` and must remain green for any release:

- Every `ErrorCode` string appears exactly once across all domain maps.
- Every domain's entries produce unique `localOrdinal`s within that domain.
- Every `numericCode` is globally unique.
- Numeric codes are never reused — deprecated codes remain in the manifest.
- For each `CodeToPayload[C]`, at least one call site constructs an object assignable to that detail type.
- `encodeNumeric` / `decodeNumeric` round-trip correctly for all registered codes.
- No code uses generic `ErrorDetails` in `CodeToPayload` when a specific detail type exists.

---

## Worked Example: `backing.allocUndersized`

End-to-end walkthrough of a single error code:

### 1. Trigger

`mapPackedBacking` finds `sab.byteLength < expectedBytes`.

### 2. Throw (JS)

```ts
throw createBackingError("allocUndersized", {
  where: "backing.mapPackedBacking",
  plane: "all",
  requestedBytes: 65536,
  allocatedBytes: 32768,
});
```

### 3. Envelope

```json
{
  "code": "backing.allocUndersized",
  "numericCode": 33554434,
  "message": "Backing buffer undersized",
  "details": {
    "where": "backing.mapPackedBacking",
    "plane": "all",
    "requestedBytes": 65536,
    "allocatedBytes": 32768
  },
  "severity": "error",
  "recoverable": false,
  "boundarySafe": true
}
```

### 4. Numeric Breakdown

- Domain `backing` → ID `2`
- Local ordinal → `2` (second code in backing)
- Numeric: `(2 << 24) | 2` = `0x02_0002` = `33554434`

### 5. Native Handling (C++)

```cpp
void handle_error(std::uint32_t code) {
  if (auto err = decode(code)) {
    switch (*err) {
      case seqlok_error_code::backing_alloc_undersized:
        // Log details, stop engine
        break;
      // ...
    }
  }
}
```

The numeric code travels cleanly across the JS↔native boundary without string parsing.

---

## Summary Checklist

### Immediate Fixes

- [ ] Fix `allocateSharedPartitioned` throw bug
- [ ] Add `where` to `throwEnvUnsupported`
- [ ] Rename `allocUndersized` fields to match detail type
- [ ] Update `CodeToPayload` with specific primitives detail types

### Design Decisions

- [ ] Decide fate of unused codes (wire or remove)
- [ ] Narrow `PlanFailedDetails["reason"]` to closed union

### Infrastructure

- [ ] Implement `error-manifest.v1.json` generation in `@seqlok/introspect`
- [ ] Add invariant tests (unique codes, round-trip encoding, detail type coverage)
- [ ] Write ADR for numeric code scheme (this document, formalized)

Once complete, the error system is ready for native ports to import the domain table and implement type-safe error handling.
