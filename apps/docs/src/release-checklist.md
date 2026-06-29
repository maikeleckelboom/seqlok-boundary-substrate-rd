# Release Checklist

Run these checks before publishing `@exclave/boundary`.

```sh
pnpm install
pnpm format
pnpm lint
pnpm test:types
pnpm test
pnpm build
pnpm run docs
pnpm docs:build
pnpm test:pack
pnpm --filter @exclave/boundary pack
```

## Package Checks

- `packages/core/package.json` is named `@exclave/boundary`.
- `private` is absent from `packages/core/package.json`.
- `license`, `repository`, `keywords`, `publishConfig`, `sideEffects`, `exports`, and `files` are correct.
- `pnpm --filter @exclave/boundary pack` includes only release files.
- The packed package installs in a fresh consumer.
- The installed package has no `workspace:*` runtime dependencies.

## API Checks

- Nested authored specs flatten to canonical dot keys.
- Plain canonical object specs compile equivalently.
- Anonymous ids are deterministic.
- Expanded param and meter kinds are covered by tests.
- Binding factories return structured errors for invalid call shapes.
- `BoundaryError` narrowing works for unknown catches.

## Documentation Review

- Install and quickstart import `@exclave/boundary`.
- Twoslash examples compile against workspace source or built declarations.
- Blog and concept pages describe the current API, not the old prototype branch.
- Audio examples are framed as the clearest first use case, not the only domain.
- Migration pages use `Seqlok` only as historical context and `seqlock` only as the primitive term.

## Publish Steps

```sh
pnpm --filter @exclave/boundary pack
pnpm --filter @exclave/boundary publish --access public --dry-run
pnpm --filter @exclave/boundary publish --access public
```
