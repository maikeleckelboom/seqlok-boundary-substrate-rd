# Internals

Implementation notes that must stay in sync with the code.

This folder is **not** user-facing API documentation. It is guidance for maintainers hacking on seqlock internals,
coherence behavior, and diagnostics. If you change these areas in code, you should read and update the corresponding
internal docs.

---

## Internal docs

- [coherence-implementation-checklist.md](./coherence-implementation-checklist.md)
  Checklist for touching seqlock primitives, snapshot behavior, and coherence invariants.

- [coherence-semantics-policy.md](./coherence-semantics-policy.md)
  Policy-level description of what "coherent" means across controller/processor/observer bindings.

- [diagnostics-seqlock-budgets-binding-level-contract.md](./diagnostics-seqlock-budgets-binding-level-contract.md)
  Contract between bindings and diagnostics: counters, budgets, and how/when they are updated.

When modifying primitives, bindings, or diagnostics, treat this folder as the source of truth for invariants and
expected behavior.

---
