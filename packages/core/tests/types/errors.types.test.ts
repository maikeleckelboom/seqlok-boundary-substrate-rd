import { describe, it, expectTypeOf } from 'vitest';

import type { ErrorPayload, TypedArrayName } from '../../src/errors/registry';

describe('errors: payload shapes', () => {
  it('params.intoTypeMismatch payload', () => {
    type P = ErrorPayload<'params.intoTypeMismatch'>;
    expectTypeOf<P>().toEqualTypeOf<{
      readonly key: string;
      readonly expectedType: TypedArrayName;
      readonly receivedType: string;
      readonly cause?: unknown;
    }>();
  });

  it('meters.intoLengthMismatch payload', () => {
    type P = ErrorPayload<'meters.intoLengthMismatch'>;
    expectTypeOf<P>().toEqualTypeOf<{
      readonly key: string;
      readonly expectedLength: number;
      readonly receivedLength: number;
      readonly cause?: unknown;
    }>();
  });

  it('handoff.hashMismatch payload', () => {
    type P = ErrorPayload<'handoff.hashMismatch'>;
    expectTypeOf<P>().toEqualTypeOf<{
      readonly localHash: string;
      readonly remoteHash: string;
      readonly diff?: string;
      readonly cause?: unknown;
    }>();
  });
});
