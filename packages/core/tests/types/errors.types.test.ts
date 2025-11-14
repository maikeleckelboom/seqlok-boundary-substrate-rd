import type {
  ErrorPayload,
  TypedArrayName,
  HandoffSpecHashMismatchDetails,
} from '../../src/errors';

describe('errors: payload shapes', () => {
  it('binding.snapshotIntoTypeMismatch payload', () => {
    type P = ErrorPayload<'binding.snapshotIntoTypeMismatch'>;
    interface Required {
      readonly key: string;
      readonly expectedType: TypedArrayName;
      readonly receivedType: string;
      readonly expectedLength: number;
      readonly receivedLength: number;
    }
    expectTypeOf<P>().toExtend<Required>();
  });

  it('binding.snapshotIntoLengthMismatch payload', () => {
    type P = ErrorPayload<'binding.snapshotIntoLengthMismatch'>;
    interface Required {
      readonly key: string;
      readonly expectedType: TypedArrayName;
      readonly receivedType: string;
      readonly expectedLength: number;
      readonly receivedLength: number;
    }
    expectTypeOf<P>().toExtend<Required>();
  });

  it('handoff.specHashMismatch payload', () => {
    type P = ErrorPayload<'handoff.specHashMismatch'>;
    // P should be the strongly-typed payload for this code
    // (we only care that it’s assignable to the published detail type)
    expectTypeOf<P>().toExtend<HandoffSpecHashMismatchDetails>();
  });
});
