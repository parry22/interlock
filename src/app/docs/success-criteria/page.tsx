import { DocsLayout, Code, Callout } from "@/components/DocsLayout";
import Link from "next/link";

export const metadata = { title: "Success Criteria — Interlock Docs" };

export default function DocsSuccessCriteria() {
  return (
    <DocsLayout>
      <div className="docs-body">
        <div className="mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>
            Core Concepts
          </span>
        </div>
        <h1>Success Criteria</h1>
        <p className="mt-3" style={{ color: "#a3a3a3", fontSize: 15 }}>
          Success criteria are deterministic validators that determine whether a
          workflow outcome is considered successful. They gate payment under
          success-fee and hybrid pricing models, and their evaluation trace is
          recorded in the settlement attestation.
        </p>

        <h2>How evaluation works</h2>
        <p>
          When a workflow completes, Interlock evaluates the outcome object against the
          criteria defined in the quote. The evaluation engine uses RFC 6901 JSON Pointer
          paths to resolve field references within the outcome. Every step produces a
          trace entry — a record of which criterion was evaluated, what value was
          found, and whether it matched.
        </p>
        <p>
          The full evaluation trace is included in the settlement attestation blob
          stored on Walrus, providing an immutable audit record.
        </p>

        <h2>Criterion types</h2>

        <h3>exact</h3>
        <p>
          Strict equality check. The field at <code>path</code> must equal <code>value</code>.
          Supports strings, numbers, and booleans.
        </p>
        <Code lang="json">{`{ "type": "exact", "path": "/status", "value": "resolved" }`}
        </Code>

        <h3>numeric_threshold</h3>
        <p>
          Compares a numeric field against a threshold using one of six operators.
        </p>
        <Code lang="json">{`// Supported ops: "<" | "<=" | ">" | ">=" | "==" | "!="
{ "type": "numeric_threshold", "path": "/confidence", "op": ">=", "value": 0.85 }`}
        </Code>

        <h3>regex</h3>
        <p>
          Tests a string field against a regular expression. The pattern uses the host
          regex engine. Avoid patterns with catastrophic backtracking in production criteria.
        </p>
        <Code lang="json">{`{
  "type": "regex",
  "path": "/summary",
  "pattern": "(?i)(resolved|fixed|closed|completed)"
}`}
        </Code>

        <h3>json_schema</h3>
        <p>
          Validates the outcome (or a sub-path of it) against a JSON Schema (Draft 7).
          Uses AJV internally. Schema errors are included in the evaluation trace.
        </p>
        <Code lang="json">{`{
  "type": "json_schema",
  "schema": {
    "type": "object",
    "required": ["resolved", "summary", "confidence"],
    "properties": {
      "resolved":   { "type": "boolean" },
      "summary":    { "type": "string", "minLength": 10 },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
    },
    "additionalProperties": false
  }
}`}
        </Code>

        <h2>Boolean composition</h2>
        <p>
          Criteria can be composed into logical trees using <code>all_of</code>,
          <code> any_of</code>, and <code>not</code>.
        </p>

        <h3>all_of</h3>
        <p>All child criteria must match.</p>
        <Code lang="json">{`{
  "type": "all_of",
  "criteria": [
    { "type": "exact", "path": "/resolved", "value": true },
    { "type": "numeric_threshold", "path": "/confidence", "op": ">=", "value": 0.9 }
  ]
}`}
        </Code>

        <h3>any_of</h3>
        <p>At least one child criterion must match.</p>
        <Code lang="json">{`{
  "type": "any_of",
  "criteria": [
    { "type": "exact", "path": "/tier", "value": "gold" },
    { "type": "numeric_threshold", "path": "/lifetimeValue", "op": ">", "value": 10000 }
  ]
}`}
        </Code>

        <h3>not</h3>
        <p>Inverts a criterion. Matches if the child criterion does not match.</p>
        <Code lang="json">{`{
  "type": "not",
  "criterion": { "type": "exact", "path": "/escalated", "value": true }
}`}
        </Code>

        <h2>Evaluation trace</h2>
        <p>
          Every evaluation produces a structured trace. This is returned in the
          workflow response under <code>settlement.criteriaTrace</code> and stored
          in the Walrus attestation blob.
        </p>
        <Code lang="json">{`{
  "matched": true,
  "trace": [
    {
      "criterion": { "type": "exact", "path": "/resolved", "value": true },
      "resolved":  true,
      "matched":   true,
      "reason":    "Field /resolved equals true"
    },
    {
      "criterion": { "type": "numeric_threshold", "path": "/confidence", "op": ">=", "value": 0.9 },
      "resolved":  0.94,
      "matched":   true,
      "reason":    "0.94 >= 0.9"
    }
  ]
}`}
        </Code>

        <Callout type="warning">
          If a <code>path</code> does not exist in the outcome object, the criterion
          evaluates as <code>false</code> with reason <code>"Path not found"</code>.
          Always validate your outcome schema against your criteria during development.
        </Callout>

        <h2>Testing criteria</h2>
        <p>
          Use the <strong>Criteria Tester</strong> in Dashboard → Developer to evaluate
          a criteria tree against a sample outcome JSON without creating a workflow.
          This is the fastest way to validate complex compositions before deploying
          them to a product configuration.
        </p>

        <hr />
        <div className="flex items-center justify-between">
          <Link href="/docs/quotes" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M8 5H2M5 8L2 5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Quotes & Pricing
          </Link>
          <Link href="/docs/settlement" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            Settlement
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </DocsLayout>
  );
}
