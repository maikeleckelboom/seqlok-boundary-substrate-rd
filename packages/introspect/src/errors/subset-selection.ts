import { ALL_DOMAINS, type DomainName } from "./all-domains";
import { type DomainRegistry, getRegistryForDomain } from "./registry-map";

import type { ErrorMeta, ErrorNumericCode } from "@seqlok/base";

export interface SubsetSelectionCriteria {
  /**
   * Restrict to these domain prefixes (e.g. ["env", "backing"]).
   * If omitted, all domains are considered.
   */
  readonly domains?: readonly DomainName[];

  /**
   * Restrict to this set of full error codes (e.g. ["env.sharedArrayBufferNotSupported"]).
   */
  readonly codes?: readonly string[];

  /**
   * Restrict to these severities.
   */
  readonly severities?: readonly ErrorMeta["severity"][];

  /**
   * If set, require meta.recoverable to equal this flag.
   */
  readonly recoverable?: boolean;

  /**
   * If set, require meta.boundarySafe to equal this flag.
   */
  readonly boundarySafe?: boolean;

  /**
   * If set, require the error to have at least one of these tags in meta.tags.
   */
  readonly tagsAnyOf?: readonly string[];
}

/**
 * Single error inside a filtered domain.
 */
export interface FilteredError {
  readonly key: string;
  readonly code: string;
  readonly numericCode: ErrorNumericCode;
  readonly message: string;
  readonly meta: ErrorMeta;
}

/**
 * Domain + its filtered errors.
 */
export interface FilteredDomain {
  readonly prefix: DomainName;
  readonly domainId: number;
  readonly errors: readonly FilteredError[];
}

/**
 * Result of a subset selection.
 */
export interface ErrorSubset {
  readonly criteria: SubsetSelectionCriteria;
  readonly domains: readonly FilteredDomain[];
}

function matchesCriteria(
  error: FilteredError,
  criteria: SubsetSelectionCriteria,
): boolean {
  const { codes, severities, recoverable, boundarySafe, tagsAnyOf } = criteria;
  const { code, meta } = error;

  if (codes !== undefined && codes.length > 0 && !codes.includes(code)) {
    return false;
  }

  if (
    severities !== undefined &&
    severities.length > 0 &&
    !severities.includes(meta.severity)
  ) {
    return false;
  }

  if (typeof recoverable === "boolean" && meta.recoverable !== recoverable) {
    return false;
  }

  if (typeof boundarySafe === "boolean" && meta.boundarySafe !== boundarySafe) {
    return false;
  }

  if (tagsAnyOf !== undefined && tagsAnyOf.length > 0) {
    const tags = meta.tags ?? [];
    const hasAnyTag = tags.some((tag) => tagsAnyOf.includes(tag));
    if (!hasAnyTag) {
      return false;
    }
  }

  return true;
}

/**
 * Named presets so callers do not have to spell out criteria each time.
 */
export const PRESET_SUBSETS: Record<string, SubsetSelectionCriteria> = {
  /**
   * Full registry: all domains, all severities.
   */
  all: {},

  /**
   * Portable core set: the domains that matter for host/runtime integration.
   * (Excludes introspect-only meta domains if you want a leaner native surface.)
   */
  corePortable: {
    domains: [
      "env",
      "backing",
      "primitives",
      "binding",
      "spec",
      "plan",
      "handoff",
    ],
  },

  /**
   * Only fatal errors across all domains.
   */
  fatalOnly: {
    severities: ["fatal"],
  },
};

/**
 * Compute a filtered view of the error universe.
 */
export function selectErrorSubset(
  criteria: SubsetSelectionCriteria,
): ErrorSubset {
  const domains: FilteredDomain[] = [];

  for (const descriptor of ALL_DOMAINS) {
    const prefix = descriptor.prefix;

    if (criteria.domains !== undefined && !criteria.domains.includes(prefix)) {
      continue;
    }

    const registry: DomainRegistry = getRegistryForDomain(prefix);
    const errors: FilteredError[] = [];

    for (const entry of descriptor.entries) {
      const registryEntry = registry[entry.key];

      if (!registryEntry) {
        // Invariant violation: descriptor entry without registry entry.
        // This is a bug in the registry wiring, so fail loudly.
        throw new Error(
          `Missing registry entry for ${prefix}.${entry.key} (${entry.code})`,
        );
      }

      const candidate: FilteredError = {
        key: entry.key,
        code: registryEntry.code,
        numericCode: entry.numericCode,
        message: registryEntry.message,
        meta: registryEntry.meta,
      };

      if (matchesCriteria(candidate, criteria)) {
        errors.push(candidate);
      }
    }

    if (errors.length > 0) {
      domains.push({
        prefix,
        domainId: descriptor.domainId,
        errors,
      });
    }
  }

  return {
    criteria,
    domains,
  };
}
