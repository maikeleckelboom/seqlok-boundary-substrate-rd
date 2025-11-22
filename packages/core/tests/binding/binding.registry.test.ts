import { beforeEach, describe, expect, it } from 'vitest';

import {
  claimBinding,
  clearBindingRegistry,
  getBindingState,
  noteBinding,
  releaseBinding,
} from '../../src/binding/common/registry';

import type { Backing } from '../../src/backing/types';

/**
 * Creates a minimal Backing stub for registry identity testing.
 * The registry relies on object identity, so full structural compliance is not required.
 */
function backingStub(label: string): Backing {
  return {
    kind: 'shared',
    sab: new SharedArrayBuffer(8),
    label,
  } as unknown as Backing;
}

/**
 * Tests for the binding registry which manages shared state between controllers and processors.
 * Verifies role-based access control and lifecycle management of bindings.
 */
describe('Binding Registry: Global State Management', () => {
  beforeEach(() => {
    clearBindingRegistry();
  });

  it('manages role lifecycle with note/release operations', () => {
    const backing = backingStub('lifecycle-test');

    expect(getBindingState(backing)).toBeUndefined();

    // Add controller role
    noteBinding(backing, 'controller');
    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: false },
    });

    // Add processor role (dual binding)
    noteBinding(backing, 'processor');
    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: true },
    });

    // Release controller
    releaseBinding(backing, 'controller');
    expect(getBindingState(backing)).toEqual({
      roles: { controller: false, processor: true },
    });

    // Release processor (last role) -> entry cleanup
    releaseBinding(backing, 'processor');
    expect(getBindingState(backing)).toBeUndefined();
  });

  it('enforces role exclusivity while allowing cross-role bindings', () => {
    const backing = backingStub('exclusivity-test');

    // First claim should succeed
    claimBinding(backing, 'controller');

    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: false },
    });

    // Duplicate claim should fail
    expect(() => {
      claimBinding(backing, 'controller');
    }).toThrow(/exclusive binding already exists/i);

    // State remains unchanged after failed claim
    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: false },
    });

    // Cross-role binding is allowed
    claimBinding(backing, 'processor');

    expect(getBindingState(backing)).toEqual({
      roles: { controller: true, processor: true },
    });
  });

  it('gracefully handles idempotent releases and unknown backings', () => {
    const backing = backingStub('idempotency-test');

    // Release on non-existent binding is safe
    releaseBinding(backing, 'controller');
    expect(getBindingState(backing)).toBeUndefined();

    // Set up test state
    noteBinding(backing, 'processor');
    expect(getBindingState(backing)).toEqual({
      roles: { controller: false, processor: true },
    });

    // First release removes the role
    releaseBinding(backing, 'processor');
    expect(getBindingState(backing)).toBeUndefined();

    // Additional releases are no-ops
    releaseBinding(backing, 'processor');
    expect(getBindingState(backing)).toBeUndefined();
  });
});
