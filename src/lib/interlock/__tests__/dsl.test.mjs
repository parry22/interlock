// Unit tests for the success-criteria DSL — the logic that decides whether a
// workflow pays out or refunds. Run: npm run test:dsl
//
// Uses Node's built-in test runner against the compiled TS via tsx.

import test from "node:test";
import assert from "node:assert/strict";

import { evaluate, jsonPointer, encodeCriteriaBytes, decodeCriteriaBytes } from "../dsl.ts";

test("exact match passes and fails correctly", () => {
  const c = { type: "exact", path: "/status", value: "closed" };
  assert.equal(evaluate(c, { status: "closed" }).result, true);
  assert.equal(evaluate(c, { status: "open" }).result, false);
});

test("numeric_threshold respects the operator", () => {
  const c = { type: "numeric_threshold", path: "/amount", op: "<=", value: 100 };
  assert.equal(evaluate(c, { amount: 47.5 }).result, true);
  assert.equal(evaluate(c, { amount: 100 }).result, true);
  assert.equal(evaluate(c, { amount: 100.01 }).result, false);
});

test("regex match", () => {
  const c = { type: "regex", path: "/id", pattern: "^TKT-\\d+$" };
  assert.equal(evaluate(c, { id: "TKT-123" }).result, true);
  assert.equal(evaluate(c, { id: "bad" }).result, false);
});

test("all_of requires every child; any_of requires one", () => {
  const both = {
    type: "all_of",
    criteria: [
      { type: "exact", path: "/status", value: "closed" },
      { type: "numeric_threshold", path: "/amount", op: "<=", value: 100 },
    ],
  };
  assert.equal(evaluate(both, { status: "closed", amount: 50 }).result, true);
  assert.equal(evaluate(both, { status: "closed", amount: 200 }).result, false);

  const either = {
    type: "any_of",
    criteria: [
      { type: "exact", path: "/status", value: "closed" },
      { type: "exact", path: "/status", value: "resolved" },
    ],
  };
  assert.equal(evaluate(either, { status: "resolved" }).result, true);
  assert.equal(evaluate(either, { status: "pending" }).result, false);
});

test("not inverts", () => {
  const c = { type: "not", criterion: { type: "exact", path: "/flag", value: true } };
  assert.equal(evaluate(c, { flag: false }).result, true);
  assert.equal(evaluate(c, { flag: true }).result, false);
});

test("missing path fails rather than throwing", () => {
  const c = { type: "exact", path: "/missing", value: "x" };
  assert.equal(evaluate(c, { other: 1 }).result, false);
});

test("json pointer resolves nested paths (RFC 6901)", () => {
  assert.equal(jsonPointer({ a: { b: [10, 20] } }, "/a/b/1"), 20);
});

test("criteria bytes round-trip", () => {
  const c = { type: "exact", path: "/x", value: "y" };
  assert.deepEqual(decodeCriteriaBytes(encodeCriteriaBytes(c)), c);
});

// Guards the settlement invariant that motivated the DSL: a failed outcome
// must NOT satisfy the criteria (so it takes the refund branch, not payout).
test("a bad outcome does not accidentally pass", () => {
  const c = {
    type: "all_of",
    criteria: [
      { type: "exact", path: "/ticket_status", value: "closed" },
      { type: "numeric_threshold", path: "/refund_amount", op: "<=", value: 100 },
    ],
  };
  const badOutcome = { ticket_status: "open", refund_amount: 9999 };
  assert.equal(evaluate(c, badOutcome).result, false);
});
