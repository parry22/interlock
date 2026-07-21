import { DocsLayout, Code, Callout } from "@/components/DocsLayout";
import Link from "next/link";

export const metadata = {
  title: "Quickstart — Interlock Docs",
};

export default function DocsQuickstart() {
  return (
    <DocsLayout>
      <div className="docs-body">

        <div className="mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>
            Getting Started
          </span>
        </div>
        <h1>Quickstart</h1>
        <p className="mt-3" style={{ color: "#a3a3a3", fontSize: 15 }}>
          Create and price your first AI workflow in under five minutes.
        </p>

        <h2>1. Install the SDK</h2>
        <p>
          Install the Interlock Node.js SDK from npm. Python and cURL are also supported —
          see <Link href="/docs/sdks" style={{ color: "#3064FF" }}>SDKs</Link>.
        </p>
        <Code lang="bash">npm install @interlock/sdk</Code>

        <h2>2. Get your API key</h2>
        <p>
          Navigate to <strong>Dashboard → Developer → API Keys</strong> and create a new
          key. Copy the secret — it will only be shown once.
        </p>
        <p>
          Store it as an environment variable. Never commit it to source control.
        </p>
        <Code lang="bash">export INTERLOCK_API_KEY=sk_test_your_key_here</Code>

        <Callout type="info">
          Use <code>sk_test_</code> keys during development. They behave identically to live
          keys but settlement is simulated against Avalanche Fuji and no real charges occur.
        </Callout>

        <h2>3. Create your first workflow</h2>
        <p>
          Call <code>workflows.create()</code> with a product identifier, a customer ID,
          and the input payload for your AI task. Interlock returns an upfront quote — the
          price agreed before execution begins.
        </p>
        <Code lang="javascript">{`import Interlock from "@interlock/sdk";

const client = new Interlock({
  apiKey: process.env.INTERLOCK_API_KEY,
});

const workflow = await client.workflows.create({
  product: "ticket_resolution_v2",
  customerId: "cus_acme_prod_01",
  payload: {
    ticketId: "TKT-8821",
    subject: "Can't export data to CSV",
    body: "When I click Export, nothing happens...",
    priority: "high",
  },
});

console.log(workflow.id);              // wf_e4rgffg44fg4g44
console.log(workflow.quoted.amount);   // 0.12
console.log(workflow.quoted.currency); // USD`}
        </Code>

        <h2>4. Execute your workflow</h2>
        <p>
          Once a workflow is created and priced, your agent or pipeline runs the
          underlying task. Interlock tracks costs in real time across all cost layers —
          model inference, tool calls, compute, and human-in-the-loop — as execution
          proceeds.
        </p>
        <p>
          When execution completes, submit the outcome:
        </p>
        <Code lang="javascript">{`// After your agent completes the task
const result = await client.workflows.complete(workflow.id, {
  outcome: {
    resolved: true,
    resolution: "Guided user to export via Settings > Data > Export CSV.",
    satisfactionScore: 4.8,
  },
});

console.log(result.status);          // "Settled"
console.log(result.margin.achieved); // 0.71  (71% margin)
console.log(result.settlement.txId); // Avalanche transaction ID`}
        </Code>

        <h2>5. Listen for events</h2>
        <p>
          Use webhooks to receive real-time notifications on workflow state changes.
          Register a webhook endpoint in <strong>Dashboard → Developer → Webhooks</strong>,
          then handle events in your server:
        </p>
        <Code lang="javascript">{`import express from "express";
const app = express();

app.post("/webhooks/interlock", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["interlock-signature"];

  let event;
  try {
    event = client.webhooks.construct(req.body, sig, process.env.WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send("Signature verification failed");
  }

  switch (event.type) {
    case "workflow.completed":
      console.log("Workflow settled:", event.data.workflowId);
      console.log("Net margin:", event.data.margin.achieved);
      break;

    case "dispute.raised":
      console.log("Dispute opened on:", event.data.workflowId);
      break;
  }

  res.json({ received: true });
});`}
        </Code>

        <Callout type="tip">
          During development, use the <strong>Test delivery</strong> button in the
          dashboard to send sample events to your local server without needing a
          production workflow.
        </Callout>

        <h2>Next steps</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          {[
            { label: "Authentication", desc: "API keys, environments, rate limits.", href: "/docs/authentication" },
            { label: "Workflows", desc: "Lifecycle states and execution model.", href: "/docs/workflows" },
            { label: "Quotes & Pricing", desc: "Pricing models and success criteria.", href: "/docs/quotes" },
            { label: "Webhooks", desc: "Events, signatures, and retries.", href: "/docs/webhooks" },
          ].map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="flex flex-col gap-1 rounded-xl p-4 transition-colors hover:border-[#2e2e2e]"
              style={{ background: "#0d0d0f", border: "1px solid #1a1a1a" }}
            >
              <span className="text-[13px] font-semibold text-white">{card.label}</span>
              <span className="text-[12px]" style={{ color: "#5a5a5a" }}>{card.desc}</span>
            </Link>
          ))}
        </div>

        <hr />

        <div className="flex items-center justify-between">
          <Link href="/docs" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M8 5H2M5 8L2 5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Introduction
          </Link>
          <Link href="/docs/authentication" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            Authentication
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

      </div>
    </DocsLayout>
  );
}
