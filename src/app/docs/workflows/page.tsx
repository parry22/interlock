import { DocsLayout, Code, Callout, MethodBadge } from "@/components/DocsLayout";
import Link from "next/link";

export const metadata = { title: "Workflows — Interlock Docs" };

export default function DocsWorkflows() {
  return (
    <DocsLayout>
      <div className="docs-body">
        <div className="mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>
            Core Concepts
          </span>
        </div>
        <h1>Workflows</h1>
        <p className="mt-3" style={{ color: "#a3a3a3", fontSize: 15 }}>
          A workflow is the atomic unit of execution in Interlock. Every AI task
          — a ticket resolution, a document summary, a pricing decision — runs
          as a workflow with a quoted price, real-time cost tracking, and
          on-chain settlement.
        </p>

        <h2>Workflow object</h2>
        <Code lang="json">{`{
  "id": "wf_e4rgffg44fg4g44",
  "status": "Settled",
  "product": "ticket_resolution_v2",
  "customerId": "cus_acme_prod_01",
  "payload": {
    "ticketId": "TKT-8821",
    "subject": "Can't export data to CSV"
  },
  "quoted": {
    "amount": 0.12,
    "currency": "USD",
    "model": "fixed"
  },
  "billed": {
    "amount": 0.034,
    "breakdown": {
      "model":   0.021,
      "tools":   0.008,
      "compute": 0.005,
      "human":   0.000
    }
  },
  "margin": {
    "achieved": 0.717,
    "floor":    0.40
  },
  "settlement": {
    "txId":    "BjRVtMx3k9...sui",
    "blobId":  "GzPQ...walrus",
    "settledAt": "2026-05-21T14:32:10Z"
  },
  "createdAt": "2026-05-21T14:31:54Z"
}`}
        </Code>

        <h2>Lifecycle states</h2>
        <p>A workflow moves through the following states:</p>
        <table>
          <thead>
            <tr>
              <th>State</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Quoted", "Workflow created. Price agreed. Awaiting execution."],
              ["Executing", "Agent is running. Costs are being tracked in real time."],
              ["Settled", "Execution complete. Outcome validated. Settlement written on-chain."],
              ["Disputed", "A party has raised a dispute within the dispute window."],
              ["Refunded", "Dispute resolved in the customer's favour. Payment reversed."],
            ].map(([s, d]) => (
              <tr key={s}>
                <td><code>{s}</code></td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Create a workflow</h2>
        <div className="endpoint">
          <MethodBadge method="POST" />
          <span>/v1/workflows</span>
        </div>
        <p>Creates a new workflow and returns an upfront quote.</p>
        <Code lang="javascript">{`const workflow = await client.workflows.create({
  product:    "ticket_resolution_v2",  // Your product identifier
  customerId: "cus_acme_prod_01",      // Customer in your system
  payload:    { ticketId: "TKT-8821", subject: "Export issue" },
});

// workflow.id            → "wf_e4rgffg44fg4g44"
// workflow.quoted.amount → 0.12  (USD, before execution)`}
        </Code>

        <h3>Request parameters</h3>
        <table>
          <thead>
            <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
          </thead>
          <tbody>
            {[
              ["product",    "string",  "Yes", "Product identifier. Must match a configured product in your account."],
              ["customerId", "string",  "Yes", "Your customer's identifier. Used for cost attribution and reporting."],
              ["payload",    "object",  "Yes", "Input data for the AI task. Shape is defined by the product config."],
              ["metadata",   "object",  "No",  "Arbitrary key-value pairs attached to the workflow for your own use."],
            ].map(([p, t, r, d]) => (
              <tr key={p}>
                <td><code>{p}</code></td><td>{t}</td><td>{r}</td><td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>List workflows</h2>
        <div className="endpoint">
          <MethodBadge method="GET" />
          <span>/v1/workflows</span>
        </div>
        <Code lang="javascript">{`const workflows = await client.workflows.list({
  status: "Settled",   // Optional: filter by state
  limit:  25,          // Optional: 1–100, default 20
  after:  "wf_abc...", // Optional: cursor for pagination
});

// workflows.data  → array of workflow objects
// workflows.next  → cursor for next page (null if last page)`}
        </Code>

        <h2>Fetch a workflow</h2>
        <div className="endpoint">
          <MethodBadge method="GET" />
          <span>/v1/workflows/:id</span>
        </div>
        <Code lang="javascript">{`const workflow = await client.workflows.fetch("wf_e4rgffg44fg4g44");
console.log(workflow.status);           // "Settled"
console.log(workflow.margin.achieved);  // 0.717`}
        </Code>

        <h2>Cost tracking</h2>
        <p>
          Interlock breaks down the cost of every workflow across four layers. This
          breakdown is available on the <code>billed.breakdown</code> field once
          the workflow reaches <code>Settled</code> state:
        </p>
        <table>
          <thead>
            <tr><th>Layer</th><th>What it covers</th></tr>
          </thead>
          <tbody>
            {[
              ["model",   "LLM provider token costs — input and output, across all model calls in the workflow."],
              ["tools",   "Third-party tool call fees — search APIs, data providers, external integrations."],
              ["compute", "Infrastructure overhead — embeddings, vector search, retrieval, orchestration."],
              ["human",   "Human-in-the-loop costs — review, escalation, approval steps."],
            ].map(([l, d]) => (
              <tr key={l}><td><code>{l}</code></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>

        <Callout type="info">
          The <code>margin.floor</code> field reflects the minimum acceptable margin
          configured for this product. If a workflow's achieved margin drops below
          the floor, a guardrail alert fires — or execution is paused, depending on
          your configuration.
        </Callout>

        <h2>Workflow events</h2>
        <p>
          Interlock emits events at each lifecycle transition. Subscribe to them via
          webhooks — see <Link href="/docs/webhooks" style={{ color: "#3064FF" }}>Webhooks</Link>.
        </p>
        <table>
          <thead>
            <tr><th>Event</th><th>Fired when</th></tr>
          </thead>
          <tbody>
            {[
              ["workflow.started",   "Execution begins — status moves to Executing."],
              ["workflow.completed", "Outcome validated and settlement written on-chain."],
              ["workflow.failed",    "Execution failed without a settleable outcome."],
              ["dispute.raised",     "A dispute is opened within the dispute window."],
              ["dispute.resolved",   "A dispute is resolved (for or against)."],
            ].map(([e, d]) => (
              <tr key={e}><td><code>{e}</code></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>

        <hr />
        <div className="flex items-center justify-between">
          <Link href="/docs/authentication" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M8 5H2M5 8L2 5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Authentication
          </Link>
          <Link href="/docs/quotes" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            Quotes & Pricing
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </DocsLayout>
  );
}
