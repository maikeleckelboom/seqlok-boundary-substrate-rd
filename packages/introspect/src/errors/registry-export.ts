import {
  selectErrorSubset,
  type ErrorSubset,
  type SubsetSelectionCriteria,
} from "./subset-selection";

import type { DomainName } from "./all-domains";
import type { ErrorMeta, ErrorNumericCode } from "@seqlok/base";

/**
 * Error descriptor as it appears in the exported JSON.
 */
export interface ExportedError {
  readonly key: string;
  readonly code: string;
  readonly numericCode: ErrorNumericCode;
  readonly message: string;
  readonly meta: ErrorMeta;
}

/**
 * Domain entry in the exported JSON.
 */
export interface ExportedDomain {
  readonly prefix: DomainName;
  readonly domainId: number;
  readonly errors: readonly ExportedError[];
}

/**
 * Top-level JSON document for the error registry.
 *
 * This is what your JSON Schema should describe.
 */
export interface ErrorRegistryJson {
  readonly version: 1;
  readonly domains: readonly ExportedDomain[];
}

/**
 * Convert an ErrorSubset into the canonical JSON document.
 */
export function buildErrorRegistryJson(
  criteria: SubsetSelectionCriteria,
): ErrorRegistryJson {
  const subset: ErrorSubset = selectErrorSubset(criteria);

  const domains: ExportedDomain[] = subset.domains.map((domain) => ({
    prefix: domain.prefix,
    domainId: domain.domainId,
    errors: domain.errors.map((error) => ({
      key: error.key,
      code: error.code,
      numericCode: error.numericCode,
      message: error.message,
      meta: error.meta,
    })),
  }));

  return {
    version: 1,
    domains,
  };
}

/**
 * Convenience alias for "give me the full, unfiltered registry".
 */
export function buildFullErrorRegistryJson(): ErrorRegistryJson {
  return buildErrorRegistryJson({});
}
