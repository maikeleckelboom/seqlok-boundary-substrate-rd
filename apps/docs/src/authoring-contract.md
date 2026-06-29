# Authored AST vs Runtime Contract

The authored AST is the human-facing input. The runtime contract is the canonical spec returned by `defineSpec()`.

## Authored AST

Nested namespaces keep specs readable:

```ts
const spec = defineSpec(({ param, meter }) => ({
  params: {
    engine: {
      enabled: param.bool(),
      frame: param.u32({ min: 0, max: 0xffffffff }),
    },
  },
  meters: {
    engine: {
      state: meter.enum(["idle", "running"]),
    },
  },
}));
```

## Canonical Runtime

The returned spec is flat and deterministic. Canonical runtime keys for the example above are:

- `engine.enabled`
- `engine.frame`
- `engine.state`

Processor read views expose nested aliases for authored namespaces:

```ts
params.engine.enabled;
params.engine.frame;
```

Anonymous specs receive deterministic `anon_<hash>` ids derived from canonical contents. Equivalent authored and plain canonical specs compile to the same runtime shape.

## Conflict Rules

A leaf and namespace cannot claim the same canonical dot key. For example, `params.engine` as a leaf conflicts with `params.engine.frame` as a descendant. This prevents ambiguous runtime memory layout.
