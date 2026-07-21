// Unit tests for the guided outcome-definition core — the deterministic,
// LLM-free logic: schema grounding, the hallucination/drift guard, compile,
// decompile, English summary, and grounded templates.
//
// Run: npm test

import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveOutcomeSchema,
  collectReferencedPointers,
  validateCriterionAgainstSchema,
} from "../outcome-schema.ts";
import {
  compileCriterion,
  decomposeCriterion,
  buildDefinition,
  summarizeDefinition,
} from "../outcome-nl.ts";
import { starterTemplatesForAgent } from "../outcome-templates.ts";
import { evaluate } from "../dsl.ts";

const AGENT = {
  id: 1,
  slug: "support-refund",
  name: "Support Refund Bot",
  exampleOutcome: { ticket_status: "closed", refund_amount: 47.5, meta: { region: "us" } },
  criteriaTemplate: {
    type: "all_of",
    criteria: [
      { type: "exact", path: "/ticket_status", value: "closed" },
      { type: "exact", path: "/priority", value: "normal" }, // NOT in example → template-only
    ],
  },
};

test("deriveOutcomeSchema flattens the example and merges template-only fields", () => {
  const schema = deriveOutcomeSchema(AGENT);
  const pointers = schema.fields.map((f) => f.pointer);
  assert.ok(pointers.includes("/ticket_status"));
  assert.ok(pointers.includes("/refund_amount"));
  assert.ok(pointers.includes("/meta")); // container surfaced
  assert.ok(pointers.includes("/meta/region")); // nested leaf addressable
  assert.ok(pointers.includes("/priority")); // pulled in from the criteria template
  const priority = schema.fields.find((f) => f.pointer === "/priority");
  assert.equal(priority.fromTemplateOnly, true);
});

test("collectReferencedPointers walks composite criteria", () => {
  const c = {
    type: "all_of",
    criteria: [
      { type: "exact", path: "/a", value: 1 },
      { type: "not", criterion: { type: "numeric_threshold", path: "/b", op: ">", value: 2 } },
    ],
  };
  assert.deepEqual(collectReferencedPointers(c).sort(), ["/a", "/b"]);
});

test("validateCriterionAgainstSchema is the hallucination/drift guard", () => {
  const schema = deriveOutcomeSchema(AGENT);
  const good = { type: "exact", path: "/ticket_status", value: "closed" };
  assert.equal(validateCriterionAgainstSchema(good, schema).ok, true);

  const bad = { type: "exact", path: "/sentiment_score", value: "good" };
  const v = validateCriterionAgainstSchema(bad, schema);
  assert.equal(v.ok, false);
  assert.deepEqual(v.invalidPointers, ["/sentiment_score"]);

  const unsupported = { type: "semantic_match", path: "/ticket_status", expected: "x", threshold: 0.8 };
  const u = validateCriterionAgainstSchema(unsupported, schema);
  assert.equal(u.ok, false);
  assert.deepEqual(u.unsupportedTypes, ["semantic_match"]);
});

test("compileCriterion maps operators and folds reversal as a NOT", () => {
  const single = compileCriterion([{ pointer: "/ticket_status", operator: "equals", value: "closed", description: "" }], null);
  assert.deepEqual(single, { type: "exact", path: "/ticket_status", value: "closed" });

  const composed = compileCriterion(
    [
      { pointer: "/ticket_status", operator: "equals", value: "closed", description: "" },
      { pointer: "/refund_amount", operator: "less_or_equal", value: 100, description: "" },
    ],
    { pointer: "/reopened", operator: "equals", value: true, description: "" },
  );
  assert.equal(composed.type, "all_of");
  assert.equal(composed.criteria.length, 3);
  assert.deepEqual(composed.criteria[1], { type: "numeric_threshold", path: "/refund_amount", op: "<=", value: 100 });
  assert.deepEqual(composed.criteria[2], { type: "not", criterion: { type: "exact", path: "/reopened", value: true } });
});

test("compileCriterion rejects a numeric operator with a non-numeric value", () => {
  assert.throws(
    () => compileCriterion([{ pointer: "/refund_amount", operator: "greater_than", value: "lots", description: "" }], null),
    /numeric value/,
  );
});

test("decomposeCriterion round-trips the shapes the guided view supports", () => {
  const criterion = {
    type: "all_of",
    criteria: [
      { type: "exact", path: "/ticket_status", value: "closed" },
      { type: "not", criterion: { type: "exact", path: "/reopened", value: true } },
      { type: "numeric_threshold", path: "/refund_amount", op: "<=", value: 100 },
    ],
  };
  const conditions = decomposeCriterion(criterion);
  assert.equal(conditions.length, 3);
  assert.deepEqual(conditions[0], { pointer: "/ticket_status", operator: "equals", value: "closed", description: "" });
  assert.deepEqual(conditions[1], { pointer: "/reopened", operator: "not_equals", value: true, description: "" });
  assert.deepEqual(conditions[2], { pointer: "/refund_amount", operator: "less_or_equal", value: 100, description: "" });

  // Shapes it can't represent → null (advanced view handles those).
  assert.equal(decomposeCriterion({ type: "json_schema", schema: {} }), null);
});

test("summarizeDefinition renders faithful plain English with reversal + window", () => {
  const def = buildDefinition({
    triggerEvent: "hired",
    conditions: [{ pointer: "/hire_status", operator: "equals", value: "hired", description: "" }],
    reversal: { pointer: "/termination_status", operator: "equals", value: "terminated", description: "" },
    verificationWindowSeconds: 90 * 86400,
  });
  const summary = summarizeDefinition(def);
  assert.match(summary, /You'll be paid when/);
  assert.match(summary, /hire_status is “hired”/);
  assert.match(summary, /within 90 days/);
});

test("starter templates only ever reference real fields", () => {
  const agent = {
    id: 2,
    slug: "recruiter",
    name: "Recruiter",
    exampleOutcome: { hire_status: "hired", employment_state: "active", salary: 90000 },
    criteriaTemplate: {},
  };
  const schema = deriveOutcomeSchema(agent);
  const templates = starterTemplatesForAgent(schema);
  assert.ok(templates.length > 0);
  for (const t of templates) {
    // Every template's compiled criterion must validate against the schema.
    assert.equal(validateCriterionAgainstSchema(t.definition.criterion, schema).ok, true, `template ${t.id} referenced an unknown field`);
    // And its criterion must be executable by the real verifier.
    assert.doesNotThrow(() => evaluate(t.definition.criterion, agent.exampleOutcome));
  }
});
