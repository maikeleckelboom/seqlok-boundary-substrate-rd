/**
 * @fileoverview
 * JSON Schema (draft 2020-12) for the error registry export.
 *
 * @remarks
 * This schema describes the JSON shape produced by
 * `ErrorRegistry.exportSchema()` in @seqlok/introspect.
 * It is intentionally:
 *
 * - Structural, not data-driven: it does not bake in the current set of
 *   domains or codes, only the container format.
 * - Stable across languages: Rust / C++ / TS can all target this contract.
 * - Strict: `additionalProperties: false` where reasonable.
 */

import type { ErrorSeverity } from "@seqlok/base";

/**
 * Runtime shape of the registry export.
 *
 * This should mirror the implementation in your registry module.
 */
export interface RegistryStats {
  readonly totalDomains: number;
  readonly totalCodes: number;
  readonly domainCounts: Readonly<Record<string, number>>;
  readonly severityCounts: Readonly<Record<ErrorSeverity, number>>;
}

export interface ErrorMetaSchema {
  readonly severity: ErrorSeverity;
  readonly recoverable: boolean;
  readonly boundarySafe: boolean;
  readonly docsUrl?: string;
  readonly tags?: readonly string[];
  readonly domainHint?: string;
}

export interface ErrorCodeSchema {
  readonly code: string;
  readonly message: string;
  readonly numericCode: number;
  readonly domain: string;
  readonly key: string;
  readonly meta: ErrorMetaSchema;
}

export interface DomainSchema {
  readonly prefix: string;
  readonly domainId: number;
  readonly codes: readonly ErrorCodeSchema[];
}

export interface ErrorRegistrySchema {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly generator: "seqlok-introspect";
  readonly domainIds: Readonly<Record<string, number>>;
  readonly domains: readonly DomainSchema[];
  readonly allCodes: readonly ErrorCodeSchema[];
  readonly stats: RegistryStats;
}

/**
 * Minimal structural type for a JSON Schema document.
 *
 * We keep this intentionally loose; consumers that care can
 * re-typecheck the value or feed it to a schema validator.
 */
export interface JsonSchemaDocument {
  readonly $schema: string;
  readonly $id: string;
  readonly title: string;
  readonly description: string;
  readonly type: "object";
  readonly additionalProperties: boolean | Record<string, never>;
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly $defs?: Record<string, unknown>;
}

/**
 * Canonical JSON Schema for `ErrorRegistrySchema`.
 *
 * This is static: it does not depend on the current set of domains
 * or codes; it only describes the container format.
 */
export const ERROR_REGISTRY_JSON_SCHEMA: JsonSchemaDocument = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://seqlok.dev/schemas/error-registry.schema.json",
  title: "Seqlok Error Registry",
  description:
    "JSON Schema for the ErrorRegistrySchema export produced by @seqlok/introspect.",
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: {
      type: "integer",
      const: 1,
      description:
        "Schema version for this export format. Increment on breaking changes.",
    },
    generatedAt: {
      type: "string",
      format: "date-time",
      description: "ISO 8601 timestamp when the registry export was generated.",
    },
    generator: {
      type: "string",
      const: "seqlok-introspect",
      description: "Tool that generated this registry export.",
    },
    domainIds: {
      type: "object",
      description:
        "Mapping from domain prefix (e.g. 'backing', 'spec') to numeric domain ID.",
      additionalProperties: false,
      patternProperties: {
        // Domain prefixes like "env", "backing", "primitives"
        "^[a-z][a-z0-9]*$": {
          type: "integer",
          minimum: 0,
          maximum: 255,
        },
      },
    },
    domains: {
      type: "array",
      description: "All error domains registered in the system.",
      items: { $ref: "#/$defs/DomainSchema" },
      minItems: 1,
    },
    allCodes: {
      type: "array",
      description:
        "Flattened list of all error codes across all domains (convenience view).",
      items: { $ref: "#/$defs/ErrorCodeSchema" },
      minItems: 1,
    },
    stats: {
      $ref: "#/$defs/RegistryStats",
    },
  },
  required: [
    "schemaVersion",
    "generatedAt",
    "generator",
    "domainIds",
    "domains",
    "allCodes",
    "stats",
  ],
  $defs: {
    RegistryStats: {
      type: "object",
      description: "Aggregate statistics about the error registry.",
      additionalProperties: false,
      properties: {
        totalDomains: {
          type: "integer",
          minimum: 1,
        },
        totalCodes: {
          type: "integer",
          minimum: 1,
        },
        domainCounts: {
          type: "object",
          description: "Error count per domain prefix.",
          additionalProperties: false,
          patternProperties: {
            "^[a-z][a-z0-9]*$": {
              type: "integer",
              minimum: 0,
            },
          },
        },
        severityCounts: {
          type: "object",
          description: "Error count grouped by severity.",
          additionalProperties: false,
          properties: {
            warning: { type: "integer", minimum: 0 },
            error: { type: "integer", minimum: 0 },
            fatal: { type: "integer", minimum: 0 },
          },
          required: ["warning", "error", "fatal"],
        },
      },
      required: [
        "totalDomains",
        "totalCodes",
        "domainCounts",
        "severityCounts",
      ],
    },

    DomainSchema: {
      type: "object",
      description: "A single error domain with its codes.",
      additionalProperties: false,
      properties: {
        prefix: {
          type: "string",
          pattern: "^[a-z][a-z0-9]*$",
          minLength: 1,
          maxLength: 32,
          description:
            "Domain prefix used in fully-qualified error codes (e.g. 'backing').",
        },
        domainId: {
          type: "integer",
          minimum: 0,
          maximum: 255,
          description:
            "Numeric domain ID used in the error code encoding scheme.",
        },
        codes: {
          type: "array",
          description: "All error codes belonging to this domain.",
          items: { $ref: "#/$defs/ErrorCodeSchema" },
          minItems: 1,
        },
      },
      required: ["prefix", "domainId", "codes"],
    },

    ErrorCodeSchema: {
      type: "object",
      description: "A single error code with its metadata.",
      additionalProperties: false,
      properties: {
        code: {
          type: "string",
          pattern: "^[a-z][a-z0-9]*\\.[a-zA-Z][a-zA-Z0-9]*$",
          minLength: 3,
          description:
            "Fully-qualified error code in the format 'domain.key' (e.g. 'backing.allocFailed').",
        },
        message: {
          type: "string",
          minLength: 1,
          maxLength: 256,
        },
        numericCode: {
          type: "integer",
          minimum: 1,
          maximum: 4_294_967_295,
          description:
            "32-bit numeric error code encoding (domainId << 24) | localId.",
        },
        domain: {
          type: "string",
          pattern: "^[a-z][a-z0-9]*$",
          minLength: 1,
          maxLength: 32,
          description: "Domain prefix extracted from the code.",
        },
        key: {
          type: "string",
          pattern: "^[a-zA-Z][a-zA-Z0-9]*$",
          minLength: 1,
          maxLength: 64,
          description: "Local key within the domain (e.g. 'allocFailed').",
        },
        meta: {
          $ref: "#/$defs/ErrorMeta",
        },
      },
      required: ["code", "message", "numericCode", "domain", "key", "meta"],
    },

    ErrorMeta: {
      type: "object",
      description: "Metadata describing an error code's semantics.",
      additionalProperties: false,
      properties: {
        severity: {
          type: "string",
          enum: ["warning", "error", "fatal"],
        },
        recoverable: {
          type: "boolean",
        },
        boundarySafe: {
          type: "boolean",
        },
        docsUrl: {
          type: "string",
          format: "uri",
        },
        tags: {
          type: "array",
          items: {
            type: "string",
            pattern: "^[a-z][a-z0-9-]*$",
            minLength: 1,
            maxLength: 32,
          },
          uniqueItems: true,
        },
        domainHint: {
          type: "string",
          pattern: "^[a-z][a-z0-9]*$",
        },
      },
      required: ["severity", "recoverable", "boundarySafe"],
    },
  },
};

/**
 * Export the error registry JSON Schema as a JSON string.
 */
export function exportErrorRegistryJsonSchema(pretty = true): string {
  return pretty
    ? JSON.stringify(ERROR_REGISTRY_JSON_SCHEMA, null, 2)
    : JSON.stringify(ERROR_REGISTRY_JSON_SCHEMA);
}
