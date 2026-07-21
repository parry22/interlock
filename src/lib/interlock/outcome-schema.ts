// Per-agent outcome field schema — the grounding substrate for the guided,
// natural-language outcome-definition flow.
//
// Interlock has no external SaaS "connectors"; the analog of a connector's
// canonical event schema is the shape of the OUTCOME JSON a given agent
// produces for a run. Every agent already declares an `exampleOutcome` (a real
// sample of a successful run) and a `criteriaTemplate`. We treat the union of
// the fields those two reference as the authoritative catalog of fields that
// actually exist for that agent.
//
// Two callers depend on this:
//   1. The LLM parser (outcome-nl.ts) is handed this catalog as grounding so it
//      can only build conditions over fields that exist — it can never invent a
//      field. See `validateCriterionAgainstSchema`, which enforces that even if
//      the model ignores the instruction.
//   2. Schema-drift detection re-runs `validateCriterionAgainstSchema` for a
//      SAVED definition against the CURRENT schema, flagging any condition that
//      references a field the agent no longer produces.

import type { SuccessCriterion } from "./dsl";

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "object"
  | "array"
  | "unknown";

export type OutcomeField = {
  /** RFC 6901 JSON Pointer, e.g. "/ticket_status" or "/order/total". */
  pointer: string;
  /** Leaf label for display, e.g. "ticket_status". */
  name: string;
  type: FieldType;
  /** Sample value from the agent's declared exampleOutcome, when known. */
  example?: unknown;
  /** True when the field was only inferred from the criteria template (no
   *  example value on file) — the LLM should still treat it as real. */
  fromTemplateOnly?: boolean;
};

export type AgentOutcomeSchema = {
  agentId: number;
  agentSlug: string;
  agentName: string;
  /** Flattened leaf + container fields, in declaration order. */
  fields: OutcomeField[];
  /** The raw declared sample, used as the default "sample data" to test against. */
  exampleOutcome: Record<string, unknown>;
};

/** Minimal shape this module needs from an agent row. */
export type AgentLike = {
  id: number;
  slug: string;
  name: string;
  exampleOutcome: Record<string, unknown>;
  criteriaTemplate: unknown;
};

// === RFC 6901 pointer helpers ===

function encodeSegment(seg: string): string {
  return seg.replace(/~/g, "~0").replace(/\//g, "~1");
}

function typeOf(v: unknown): FieldType {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  switch (typeof v) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    case "object": return "object";
    default: return "unknown";
  }
}

/** Flatten a JSON value into pointer/type/example fields. Recurses into plain
 *  objects; arrays are surfaced as a single field (indexing into arrays is a
 *  power-user/advanced-view concern, not something the NL flow offers). */
function flatten(value: unknown, prefix: string, out: OutcomeField[]): void {
  const t = typeOf(value);
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const pointer = `${prefix}/${encodeSegment(key)}`;
      const childType = typeOf(obj[key]);
      // Record the field itself...
      out.push({ pointer, name: key, type: childType, example: obj[key] });
      // ...then recurse so nested leaves are individually addressable.
      if (childType === "object") flatten(obj[key], pointer, out);
    }
  }
}

// === Schema derivation ===

/** Build the field catalog for an agent from its declared example outcome,
 *  augmented with any field the criteria template references but the example
 *  omits (so an optional-but-real field is still offered). */
export function deriveOutcomeSchema(agent: AgentLike): AgentOutcomeSchema {
  const example = agent.exampleOutcome ?? {};
  const fields: OutcomeField[] = [];
  flatten(example, "", fields);

  // Merge in pointers referenced by the criteria template that the example
  // didn't surface. These are real (the agent chose to gate payment on them)
  // even if the sample happens not to include them.
  const known = new Set(fields.map((f) => f.pointer));
  for (const pointer of collectReferencedPointers(agent.criteriaTemplate as SuccessCriterion)) {
    if (pointer && pointer.startsWith("/") && !known.has(pointer)) {
      known.add(pointer);
      const name = pointer.split("/").pop() ?? pointer;
      fields.push({ pointer, name, type: "unknown", fromTemplateOnly: true });
    }
  }

  return {
    agentId: agent.id,
    agentSlug: agent.slug,
    agentName: agent.name,
    fields,
    exampleOutcome: example,
  };
}

// === Reference walking + validation (hallucination + drift guard) ===

/** Collect every JSON-Pointer `path` a (possibly composite) criterion reads.
 *  Guards against cycles/garbage from untrusted input. json_schema criteria
 *  reference the whole document, not a single field, so they contribute no
 *  pointer (and are treated as always schema-valid). */
export function collectReferencedPointers(criterion: unknown, depth = 0): string[] {
  if (!criterion || typeof criterion !== "object" || depth > 64) return [];
  const c = criterion as Record<string, unknown>;
  switch (c.type) {
    case "exact":
    case "regex":
    case "numeric_threshold":
    case "semantic_match":
      return typeof c.path === "string" ? [c.path] : [];
    case "all_of":
    case "any_of":
      return Array.isArray(c.criteria)
        ? c.criteria.flatMap((sub) => collectReferencedPointers(sub, depth + 1))
        : [];
    case "not":
      return collectReferencedPointers(c.criterion, depth + 1);
    default:
      return [];
  }
}

export type SchemaValidation = {
  ok: boolean;
  /** Referenced pointers that are NOT in the agent's field catalog. A non-empty
   *  list means either the LLM invented a field (reject before saving) or the
   *  schema drifted out from under a saved definition (flag for review). */
  invalidPointers: string[];
  /** Criterion types the deterministic verifier can't execute (e.g.
   *  semantic_match). Surfaced so the flow never saves an unverifiable def. */
  unsupportedTypes: string[];
};

const DETERMINISTIC_TYPES = new Set([
  "exact",
  "regex",
  "json_schema",
  "numeric_threshold",
  "all_of",
  "any_of",
  "not",
]);

function collectTypes(criterion: unknown, out: Set<string>, depth = 0): void {
  if (!criterion || typeof criterion !== "object" || depth > 64) return;
  const c = criterion as Record<string, unknown>;
  if (typeof c.type === "string") out.add(c.type);
  if (Array.isArray(c.criteria)) c.criteria.forEach((s) => collectTypes(s, out, depth + 1));
  if (c.criterion) collectTypes(c.criterion, out, depth + 1);
}

/** Validate a criterion against the agent's field catalog. Used both to reject
 *  a freshly-parsed definition that references a nonexistent field, and to
 *  detect drift when a provider's schema later changes. */
export function validateCriterionAgainstSchema(
  criterion: SuccessCriterion,
  schema: AgentOutcomeSchema,
): SchemaValidation {
  const known = new Set(schema.fields.map((f) => f.pointer));
  const referenced = collectReferencedPointers(criterion);
  const invalidPointers = [...new Set(referenced.filter((p) => !known.has(p)))];

  const types = new Set<string>();
  collectTypes(criterion, types);
  const unsupportedTypes = [...types].filter((t) => !DETERMINISTIC_TYPES.has(t));

  return {
    ok: invalidPointers.length === 0 && unsupportedTypes.length === 0,
    invalidPointers,
    unsupportedTypes,
  };
}
