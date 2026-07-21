// Success criteria DSL — TypeScript evaluator for the schema defined in
// ARCHITECTURE.md §11.2.
//
// MVP supports the deterministic primitives: exact, regex, json_schema,
// numeric_threshold, all_of / any_of / not. `semantic_match` is parsed and
// rejected with UnsupportedCriterion until Phase 2 wires the multi-LLM voting
// path.
//
// `path` references use RFC 6901 JSON Pointer.

import Ajv, { type Schema } from "ajv";
import addFormats from "ajv-formats";

// === Types ===

export type ExactCriterion = { type: "exact"; path: string; value: unknown };
export type RegexCriterion = { type: "regex"; path: string; pattern: string; flags?: string };
export type JsonSchemaCriterion = { type: "json_schema"; schema: Schema };
export type NumericThresholdCriterion = {
  type: "numeric_threshold";
  path: string;
  op: "<" | "<=" | ">" | ">=" | "==" | "!=";
  value: number;
};
export type SemanticMatchCriterion = {
  type: "semantic_match";
  path: string;
  expected: string;
  threshold: number;
};
export type AllOfCriterion = { type: "all_of"; criteria: SuccessCriterion[] };
export type AnyOfCriterion = { type: "any_of"; criteria: SuccessCriterion[] };
export type NotCriterion = { type: "not"; criterion: SuccessCriterion };

export type SuccessCriterion =
  | ExactCriterion
  | RegexCriterion
  | JsonSchemaCriterion
  | NumericThresholdCriterion
  | SemanticMatchCriterion
  | AllOfCriterion
  | AnyOfCriterion
  | NotCriterion;

/** Per-criterion trace entry. Recorded in the proof blob (§11.4). */
export type EvaluationStep = {
  type: SuccessCriterion["type"];
  path?: string;
  actual?: unknown;
  matched: boolean;
  reason?: string;
};

export type EvaluationResult = {
  result: boolean;
  steps: EvaluationStep[];
};

export class UnsupportedCriterion extends Error {
  constructor(type: string) {
    super(`Unsupported criterion type for MVP: '${type}' (Phase 2 feature)`);
    this.name = "UnsupportedCriterion";
  }
}

export class InvalidCriterion extends Error {
  constructor(reason: string) {
    super(`Invalid success_criteria: ${reason}`);
    this.name = "InvalidCriterion";
  }
}

// === RFC 6901 JSON Pointer ===

/** Resolve a JSON Pointer against `doc`. Returns `undefined` if not found. */
export function jsonPointer(doc: unknown, pointer: string): unknown {
  if (pointer === "") return doc;
  if (!pointer.startsWith("/")) {
    throw new InvalidCriterion(`JSON Pointer must start with '/': ${pointer}`);
  }
  const parts = pointer
    .slice(1)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = doc;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

// === Evaluator ===

const ajv = new Ajv({ strict: false, allErrors: false });
addFormats(ajv);

/** Pure structural equality. Suitable for JSON-shaped values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const aKeys = Object.keys(ao).sort();
    const bKeys = Object.keys(bo).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k, i) => k === bKeys[i] && deepEqual(ao[k], bo[k]));
  }
  return false;
}

function evalOne(criterion: SuccessCriterion, outcome: unknown): EvaluationStep {
  switch (criterion.type) {
    case "exact": {
      const actual = jsonPointer(outcome, criterion.path);
      const matched = deepEqual(actual, criterion.value);
      return { type: "exact", path: criterion.path, actual, matched };
    }
    case "regex": {
      const actual = jsonPointer(outcome, criterion.path);
      if (typeof actual !== "string") {
        return {
          type: "regex",
          path: criterion.path,
          actual,
          matched: false,
          reason: "value at path is not a string",
        };
      }
      // Note: we use the host regex engine. For safety against catastrophic
      // backtracking, criteria should restrict pattern complexity. Phase 2
      // can switch to RE2 via WASM.
      let re: RegExp;
      try {
        re = new RegExp(criterion.pattern, criterion.flags ?? "");
      } catch (e) {
        return {
          type: "regex",
          path: criterion.path,
          actual,
          matched: false,
          reason: `invalid regex: ${(e as Error).message}`,
        };
      }
      return { type: "regex", path: criterion.path, actual, matched: re.test(actual) };
    }
    case "json_schema": {
      const validate = ajv.compile(criterion.schema as Schema);
      const matched = validate(outcome);
      return {
        type: "json_schema",
        matched: matched === true,
        reason: matched
          ? undefined
          : `schema violations: ${JSON.stringify(validate.errors ?? [])}`,
      };
    }
    case "numeric_threshold": {
      const actual = jsonPointer(outcome, criterion.path);
      const n = Number(actual);
      if (Number.isNaN(n)) {
        return {
          type: "numeric_threshold",
          path: criterion.path,
          actual,
          matched: false,
          reason: "value at path is not numeric",
        };
      }
      let matched: boolean;
      switch (criterion.op) {
        case "<":  matched = n <  criterion.value; break;
        case "<=": matched = n <= criterion.value; break;
        case ">":  matched = n >  criterion.value; break;
        case ">=": matched = n >= criterion.value; break;
        case "==": matched = n === criterion.value; break;
        case "!=": matched = n !== criterion.value; break;
      }
      return { type: "numeric_threshold", path: criterion.path, actual: n, matched };
    }
    case "semantic_match":
      throw new UnsupportedCriterion("semantic_match");
    case "all_of": {
      // Recurse via outer evaluate() so we get the full step trace.
      throw new InvalidCriterion("all_of should be unwrapped by evaluate()");
    }
    case "any_of":
      throw new InvalidCriterion("any_of should be unwrapped by evaluate()");
    case "not":
      throw new InvalidCriterion("not should be unwrapped by evaluate()");
    default: {
      const _exhaustive: never = criterion;
      throw new InvalidCriterion(`unknown criterion type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Evaluate a (possibly composite) criterion and produce a full trace. */
export function evaluate(criterion: SuccessCriterion, outcome: unknown): EvaluationResult {
  const steps: EvaluationStep[] = [];

  function recurse(c: SuccessCriterion): boolean {
    switch (c.type) {
      case "all_of": {
        let result = true;
        for (const sub of c.criteria) {
          const ok = recurse(sub);
          if (!ok) result = false;
          // Continue so we record full trace even on first failure.
        }
        steps.push({ type: "all_of", matched: result });
        return result;
      }
      case "any_of": {
        let result = false;
        for (const sub of c.criteria) {
          const ok = recurse(sub);
          if (ok) result = true;
        }
        steps.push({ type: "any_of", matched: result });
        return result;
      }
      case "not": {
        const inner = recurse(c.criterion);
        const result = !inner;
        steps.push({ type: "not", matched: result });
        return result;
      }
      default: {
        const step = evalOne(c, outcome);
        steps.push(step);
        return step.matched;
      }
    }
  }

  const result = recurse(criterion);
  return { result, steps };
}

/** Parse JSON bytes (UTF-8) → SuccessCriterion. Throws on malformed input. */
export function decodeCriteriaBytes(bytes: Uint8Array): SuccessCriterion {
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text) as SuccessCriterion;
  } catch (e) {
    throw new InvalidCriterion(`malformed JSON: ${(e as Error).message}`);
  }
}

/** Encode SuccessCriterion → UTF-8 JSON bytes for storage in Quote. */
export function encodeCriteriaBytes(c: SuccessCriterion): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(c));
}
