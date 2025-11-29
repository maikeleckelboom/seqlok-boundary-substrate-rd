# Error Domain ID Allocation

This document defines the domain ID allocation for Seqlok error codes.
Domain IDs are **ABI-stable as of v1.0** and must not be reused or reassigned.

## Allocation

We allocate the following domain id ranges for v1:

- 0: reserved for "unknown" or "unset"
- 1: env
- 2: backing
- 3: primitives
- 4: binding
- 5: spec
- 6: plan
- 7: handoff
- 8: introspect
- 9: internal

- 20: commands
- 30: hotswap
- 40: integration
- 50: playground

- 200–255: reserved for extensions and third-party domains
