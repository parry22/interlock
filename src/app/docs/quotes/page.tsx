import { DocsLayout, Code, Callout } from "@/components/DocsLayout";
import Link from "next/link";

export const metadata = { title: "Quotes & Pricing — Interlock Docs" };

export default function DocsQuotes() {
  return (
    <DocsLayout>
      <div className="docs-body">
        <div className="mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>
            Core Concepts
          </span>
        </div>
        <h1>Quotes & Pricing</h1>
        <p className="mt-3" style={{ color: "#a3a3a3", fontSize: 15 }}>
          A quote is a pricing contract issued before a workflow executes. It defines
          the model, the agreed price, the success criteria, and the terms under which
          payment is made.
        </p>

        <h2>Quote object</h2>
        <Code lang="json">{`{
  "id": "qt_7f3g9k2m1p",
  "status": "Active",
  "version": "1.0",
  "product": "ticket_resolution_v2",
  "customerId": "cus_acme_prod_01",
  "pricing": {
    "model": "fixed",
    "amount": 0.12,
    "currency": "USD"
  },
  "successCriteria": {
    "type": "all_of",
    "criteria": [
      { "type": "exact", "path": "/resolved", "value": true },
      { "type": "numeric_threshold", "path": "/satisfactionScore", "op": ">=", "value": 4.0 }
    ]
  },
  "conditions": {
    "sla": "30s",
    "marginFloor": 0.40,
    "disputeWindowSeconds": 3600
  },
  "expiresAt": "2026-05-22T14:31:54Z",
  "createdAt": "2026-05-21T14:31:54Z"
}`}
        </Code>

        <h2>Pricing models</h2>
        <p>
          Interlock supports four pricing models. The model determines how the final
          charged amount relates to the execution outcome.
        </p>

        <h3>Fixed</h3>
        <p>
          The customer is charged a flat fee regardless of actual execution cost or
          outcome. Revenue is fully predictable. Risk is carried by the operator —
          if cost exceeds the fixed price, margin is negative.
        </p>
        <Code lang="json">{`{
  "model": "fixed",
  "amount": 0.20,
  "currency": "USD"
}`}
        </Code>

        <h3>Capped</h3>
        <p>
          Charge is limited to a ceiling price. If actual cost is below the cap, the
          customer is charged actual cost plus a markup. If cost exceeds the cap, the
          operator absorbs the difference. Suitable for variable-length workflows where
          you want to give customers a worst-case ceiling.
        </p>
        <Code lang="json">{`{
  "model": "capped",
  "cap": 0.50,
  "markupPct": 30,
  "currency": "USD"
}`}
        </Code>

        <h3>Success fee</h3>
        <p>
          Charge only applies when the outcome satisfies the defined success criteria.
          If the workflow fails or the outcome does not meet criteria, the customer
          is not charged. Aligns incentives strongly but transfers outcome risk to
          the operator.
        </p>
        <Code lang="json">{`{
  "model": "success_fee",
  "amount": 0.40,
  "currency": "USD"
}`}
        </Code>

        <h3>Hybrid</h3>
        <p>
          A base fee is charged regardless of outcome, plus a success bonus when
          criteria are met. Balances risk sharing between operator and customer.
          The most flexible model for complex, high-value workflows.
        </p>
        <Code lang="json">{`{
  "model": "hybrid",
  "baseFee": 0.05,
  "successBonus": 0.30,
  "currency": "USD"
}`}
        </Code>

        <h2>Success criteria</h2>
        <p>
          Success criteria are deterministic validators applied to the workflow's output
          JSON. They define what a successful outcome looks like. Criteria use JSON
          Pointer paths (RFC 6901) to reference fields in the outcome object.
        </p>

        <h3>exact</h3>
        <p>Checks that a field equals an exact value.</p>
        <Code lang="json">{`{ "type": "exact", "path": "/resolved", "value": true }`}
        </Code>

        <h3>numeric_threshold</h3>
        <p>Compares a numeric field against a threshold. Supported operators: <code>&lt;</code>, <code>&lt;=</code>, <code>&gt;</code>, <code>&gt;=</code>, <code>==</code>, <code>!=</code>.</p>
        <Code lang="json">{`{ "type": "numeric_threshold", "path": "/satisfactionScore", "op": ">=", "value": 4.0 }`}
        </Code>

        <h3>regex</h3>
        <p>Matches a string field against a regular expression.</p>
        <Code lang="json">{`{ "type": "regex", "path": "/resolution", "pattern": "(?i)(resolved|fixed|completed)" }`}
        </Code>

        <h3>json_schema</h3>
        <p>Validates the outcome against a JSON Schema.</p>
        <Code lang="json">{`{
  "type": "json_schema",
  "schema": {
    "type": "object",
    "required": ["resolved", "resolution"],
    "properties": {
      "resolved":   { "type": "boolean" },
      "resolution": { "type": "string", "minLength": 20 }
    }
  }
}`}
        </Code>

        <h3>Boolean composition</h3>
        <p>Combine multiple criteria with <code>all_of</code>, <code>any_of</code>, or <code>not</code>.</p>
        <Code lang="json">{`{
  "type": "all_of",
  "criteria": [
    { "type": "exact", "path": "/resolved", "value": true },
    {
      "type": "any_of",
      "criteria": [
        { "type": "numeric_threshold", "path": "/satisfactionScore", "op": ">=", "value": 4.0 },
        { "type": "exact", "path": "/escalated", "value": false }
      ]
    }
  ]
}`}
        </Code>

        <Callout type="info">
          Criteria evaluation produces a full trace — each step is recorded with a
          matched/not-matched flag and a reason string. The trace is included in the
          settlement attestation blob stored on Walrus.
        </Callout>

        <h2>Quote conditions</h2>
        <p>
          The <code>conditions</code> block sets operational parameters for the workflow:
        </p>
        <table>
          <thead>
            <tr><th>Field</th><th>Description</th></tr>
          </thead>
          <tbody>
            {[
              ["sla", "Maximum allowed execution time. Workflow is flagged if this is exceeded."],
              ["marginFloor", "Minimum acceptable margin ratio (0–1). Guardrail triggers if achieved margin drops below this."],
              ["disputeWindowSeconds", "How long after settlement a dispute can be raised. Default: 3600s in production."],
            ].map(([f, d]) => (
              <tr key={f}><td><code>{f}</code></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>

        <hr />
        <div className="flex items-center justify-between">
          <Link href="/docs/workflows" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M8 5H2M5 8L2 5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Workflows
          </Link>
          <Link href="/docs/success-criteria" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            Success Criteria
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </DocsLayout>
  );
}
