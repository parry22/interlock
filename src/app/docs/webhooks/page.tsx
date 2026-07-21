import { DocsLayout, Code, Callout, MethodBadge } from "@/components/DocsLayout";
import Link from "next/link";

export const metadata = { title: "Webhooks — Interlock Docs" };

export default function DocsWebhooks() {
  return (
    <DocsLayout>
      <div className="docs-body">
        <div className="mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>
            Developer
          </span>
        </div>
        <h1>Webhooks</h1>
        <p className="mt-3" style={{ color: "#a3a3a3", fontSize: 15 }}>
          Interlock sends webhook events to your server when workflow state changes,
          settlements complete, and disputes are raised or resolved.
        </p>

        <h2>Setup</h2>
        <p>
          Register a webhook endpoint in <strong>Dashboard → Developer → Webhooks</strong>.
          You can subscribe to individual event types or all events. Each endpoint
          has a unique signing secret used to verify that deliveries are genuine.
        </p>
        <p>
          Endpoints must:
        </p>
        <ul>
          <li>Accept <code>POST</code> requests with a <code>Content-Type: application/json</code> body.</li>
          <li>Respond with a <code>2xx</code> status within <strong>5 seconds</strong>.</li>
          <li>Be accessible over HTTPS (HTTP endpoints are blocked in live mode).</li>
        </ul>

        <Callout type="tip">
          Use the <strong>Test delivery</strong> button in the dashboard to send a sample
          event to your endpoint without running a real workflow. Useful during local
          development with a tool like ngrok.
        </Callout>

        <h2>Event object</h2>
        <Code lang="json">{`{
  "id":      "evt_9a2k7f3p",
  "type":    "workflow.completed",
  "created": 1716982330,
  "data": {
    "workflowId":  "wf_e4rgffg44fg4g44",
    "customerId":  "cus_acme_prod_01",
    "product":     "ticket_resolution_v2",
    "status":      "Settled",
    "margin": {
      "achieved": 0.717,
      "floor":    0.40
    },
    "settlement": {
      "txId":      "BjRVtMx3k9...sui",
      "settledAt": "2026-05-21T14:32:10Z"
    }
  }
}`}
        </Code>

        <h2>Event types</h2>
        <table>
          <thead>
            <tr><th>Event</th><th>Description</th></tr>
          </thead>
          <tbody>
            {[
              ["workflow.started",    "Workflow moved to Executing state."],
              ["workflow.completed",  "Workflow settled on-chain. Includes final margin and tx ID."],
              ["workflow.failed",     "Workflow failed without a settleable outcome."],
              ["quote.accepted",      "A quote was accepted and a workflow created against it."],
              ["quote.expired",       "A quote expired before a workflow was created."],
              ["settlement.paid",     "Payment transfer confirmed on-chain."],
              ["dispute.raised",      "A dispute was opened within the dispute window."],
              ["dispute.resolved",    "A dispute was resolved. Includes outcome (operator/customer/partial)."],
            ].map(([e, d]) => (
              <tr key={e}><td><code>{e}</code></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>

        <h2>Signature verification</h2>
        <p>
          Every delivery includes a <code>interlock-signature</code> header containing
          a HMAC-SHA256 signature of the raw request body, signed with your endpoint's
          secret. Always verify this before processing an event.
        </p>

        <h3>Node.js</h3>
        <Code lang="javascript">{`import express from "express";
const app = express();

app.post(
  "/webhooks/interlock",
  express.raw({ type: "application/json" }),
  (req, res) => {
    let event;
    try {
      event = client.webhooks.construct(
        req.body,                               // raw Buffer
        req.headers["interlock-signature"],
        process.env.WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error("Signature verification failed:", err.message);
      return res.status(400).send("Bad signature");
    }

    // Safe to process
    switch (event.type) {
      case "workflow.completed":
        await handleSettlement(event.data);
        break;
      case "dispute.raised":
        await notifyTeam(event.data);
        break;
    }

    res.json({ received: true });
  }
);`}
        </Code>

        <h3>Python</h3>
        <Code lang="python">{`from flask import Flask, request
import interlock

app = Flask(__name__)

@app.route("/webhooks/interlock", methods=["POST"])
def webhook():
    sig = request.headers.get("interlock-signature")
    try:
        event = client.webhooks.construct(
            request.data,
            sig,
            os.environ["WEBHOOK_SECRET"],
        )
    except interlock.SignatureVerificationError as e:
        return str(e), 400

    if event.type == "workflow.completed":
        handle_settlement(event.data)

    return {"received": True}`}
        </Code>

        <h3>Manual verification</h3>
        <p>If you are not using an SDK, verify the signature manually:</p>
        <Code lang="javascript">{`import crypto from "crypto";

function verifyWebhook(rawBody, signatureHeader, secret) {
  // Header format: "t=<timestamp>,v1=<signature>"
  const parts   = Object.fromEntries(signatureHeader.split(",").map(p => p.split("=")));
  const payload = \`\${parts.t}.\${rawBody}\`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (expected !== parts.v1) throw new Error("Signature mismatch");
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) {
    throw new Error("Timestamp too old (>5 min)");
  }
}`}
        </Code>

        <Callout type="warning">
          Use the raw request body — not a parsed JSON object — when computing the
          signature. JSON serialisation is not deterministic across implementations.
        </Callout>

        <h2>Retries</h2>
        <p>
          If your endpoint returns a non-2xx response or times out, Interlock retries
          delivery with exponential backoff:
        </p>
        <table>
          <thead>
            <tr><th>Attempt</th><th>Delay after previous attempt</th></tr>
          </thead>
          <tbody>
            {[["1st retry", "5 seconds"], ["2nd retry", "30 seconds"], ["3rd retry", "2 minutes"], ["4th retry", "10 minutes"], ["5th retry", "1 hour"]].map(([a, d]) => (
              <tr key={a}><td>{a}</td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>
        <p>
          After 5 failed attempts, the delivery is marked as failed. You can
          manually replay failed deliveries from Dashboard → Developer → Webhooks
          → Delivery History.
        </p>

        <h2>Idempotency</h2>
        <p>
          Webhook deliveries may be sent more than once due to retries. Each event
          has a unique <code>id</code> field. Store processed event IDs and skip
          duplicate deliveries to ensure idempotent processing.
        </p>

        <hr />
        <div className="flex items-center justify-between">
          <Link href="/docs/sdks" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M8 5H2M5 8L2 5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            SDKs
          </Link>
          <Link href="/docs" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            Back to Introduction
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </DocsLayout>
  );
}
