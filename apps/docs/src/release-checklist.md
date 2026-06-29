# Release Checklist

Run these checks before publishing `@seqlok/core`.

```sh
pnpm install
pnpm format
pnpm lint
pnpm test:types
pnpm test
pnpm build
pnpm docs:build
pnpm test:pack
```

## Package Checks

- `packages/core/package.json` is named `@seqlok/core`.
- `private` is absent from `packages/core/package.json`.
- `license`, `repository`, `keywords`, `publishConfig`, `sideEffects`, `exports`, and `files` are correct.
- `pnpm -F @seqlok/core pack` includes only release files.
- The packed package installs in a fresh consumer.
- The installed package has no `workspace:*` runtime dependencies.

## API Checks

- Nested authored specs flatten to canonical dot keys.
- Plain canonical object specs compile equivalently.
- Anonymous ids are deterministic.
- Expanded param and meter kinds are covered by tests.
- Binding factories return structured `binding.invalidArgs` errors for invalid call shapes.

## Publish Steps

```sh
pnpm -F @seqlok/core pack
pnpm -F @seqlok/core publish --access public --dry-run
pnpm -F @seqlok/core publish --access public
```
