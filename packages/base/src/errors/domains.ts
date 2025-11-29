import type { ErrorNumericCode } from "./numeric";

/**
 * Single error code entry within a domain.
 *
 * @remarks
 * - `key` is the domain-local identifier (e.g. "unsupported")
 * - `code` is the fully-qualified string code (e.g. "env.unsupported")
 * - `numericCode` is the encoded numeric value derived from the domain id
 *   and a domain-local index.
 */
export interface DomainEntry {
  /**
   * Domain-local key used in registry maps.
   *
   * @example "unsupported" for "env.unsupported"
   */
  readonly key: string;

  /**
   * Fully qualified string code.
   *
   * @example "env.unsupported"
   */
  readonly code: string;

  /**
   * Encoded numeric error code derived from the domain id and local id.
   */
  readonly numericCode: ErrorNumericCode;
}

/**
 * Descriptor for a single error domain.
 *
 * @remarks
 * - `prefix` is the domain prefix (e.g. "env", "backing")
 * - `domainId` is the numeric high byte used by `encodeNumeric`
 * - `entries` are the concrete codes in this domain
 */
export interface DomainDescriptor {
  /**
   * Domain prefix, e.g. "env" / "backing" / "spec".
   */
  readonly prefix: string;

  /**
   * Numeric domain id (0–255).
   *
   * @remarks
   * This is the "high byte" component in the numeric encoding scheme.
   */
  readonly domainId: number;

  /**
   * Concrete error codes belonging to this domain.
   */
  readonly entries: readonly DomainEntry[];
}

/**
 * Canonical domain ID allocation for Seqlok.
 *
 * 8-bit domain IDs (0–255) with reserved ranges:
 *
 * - 0:        unknown / unregistered (fallback)
 * - 1–9:      @seqlok/base
 * - 10–49:    @seqlok/core
 * - 50–59:    @seqlok/introspect (diagnostics tooling)
 * - 60–69:    @seqlok/commands
 * - 70–79:    @seqlok/hotswap
 * - 200–254:  user / extension domains (3rd-party engines, plugins)
 * - 255:      reserved sentinel (never assign)
 */
export const DOMAIN_IDS = {
  // Reserved / fallback
  unknown: 0,

  // @seqlok/base
  internal: 1,

  // @seqlok/core (10–49)
  env: 10,
  backing: 11,
  primitives: 12,
  binding: 13,
  spec: 14,
  plan: 15,
  handoff: 16,

  // @seqlok/introspect (50–59)
  introspect: 50,

  // @seqlok/commands (60–69)
  commands: 60,

  // @seqlok/hotswap (70–79)
  hotswap: 70,

  // Reserved
  reserved: 255,
} as const;

export type DomainIdName = keyof typeof DOMAIN_IDS;
export type DomainId = (typeof DOMAIN_IDS)[DomainIdName];
