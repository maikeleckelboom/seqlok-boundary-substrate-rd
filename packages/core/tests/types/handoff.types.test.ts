import { describe, it, expectTypeOf } from 'vitest';

import { buildHandoff } from '../../src/handoff/handoff';

import type {
  SharedBacking,
  SharedPartitionedBacking,
  WasmSharedBacking,
} from '../../src/backing/types';
import type { Plan } from '../../src/plan/types';
import type { SpecInput } from '../../src/spec/types';

describe('handoff v1 type barrier', () => {
  it('buildHandoff second parameter is exactly SharedBacking (contiguous only)', () => {
    type SecondParam = Parameters<typeof buildHandoff>[1];
    expectTypeOf<SecondParam>().toEqualTypeOf<SharedBacking>();
    expectTypeOf<SharedBacking>().toEqualTypeOf<SecondParam>();
  });

  it('runtime smoke: contiguous backing compiles and calls', () => {
    const plan = { bytesTotal: 64 } as Plan<SpecInput>;
    const shared: SharedBacking = { kind: 'shared', sab: new SharedArrayBuffer(64) };
    buildHandoff(plan, shared);
    expectTypeOf<WasmSharedBacking>().not.toEqualTypeOf<
      Parameters<typeof buildHandoff>[1]
    >();
    expectTypeOf<SharedPartitionedBacking>().not.toEqualTypeOf<
      Parameters<typeof buildHandoff>[1]
    >();
  });
});
