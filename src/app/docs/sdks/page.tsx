import { DocsLayout, Code, Callout } from "@/components/DocsLayout";
import Link from "next/link";

export const metadata = { title: "SDKs — Interlock Docs" };

export default function DocsSDKs() {
  return (
    <DocsLayout>
      <div className="docs-body">
        <div className="mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>
            Developer
          </span>
        </div>
        <h1>SDKs</h1>
        <p className="mt-3" style={{ color: "#a3a3a3", fontSize: 15 }}>
          Interlock provides official SDKs for Node.js and Python, plus full cURL
          examples for direct API integration.
        </p>

        <h2>Node.js</h2>

        <h3>Install</h3>
        <Code lang="bash">npm install @interlock/sdk</Code>

        <h3>Initialise</h3>
        <Code lang="javascript">{`import Interlock from "@interlock/sdk";

const client = new Interlock({
  apiKey:  process.env.INTERLOCK_API_KEY,  // sk_live_... or sk_test_...
  timeout: 30_000,                       // ms, default 30s
});`}
        </Code>

        <h3>Workflows</h3>
        <Code lang="javascript">{`// Create
const wf = await client.workflows.create({
  product:    "ticket_resolution_v2",
  customerId: "cus_acme_prod_01",
  payload:    { ticketId: "TKT-8821" },
});

// Fetch
const wf = await client.workflows.fetch("wf_e4rgffg44fg4g44");

// List (paginated)
const page = await client.workflows.list({ status: "Settled", limit: 25 });
for (const wf of page.data) {
  console.log(wf.id, wf.margin.achieved);
}

// Auto-paginate all
for await (const wf of client.workflows.listAutoPaging({ status: "Settled" })) {
  console.log(wf.id);
}`}
        </Code>

        <h3>Webhooks</h3>
        <Code lang="javascript">{`// Verify and parse an incoming webhook
const event = client.webhooks.construct(
  rawBody,                            // Buffer or string
  req.headers["interlock-signature"],   // Signature header
  process.env.WEBHOOK_SECRET          // Your endpoint secret
);

console.log(event.type);             // "workflow.completed"
console.log(event.data.workflowId);  // "wf_e4rgffg44fg4g44"`}
        </Code>

        <h2>Python</h2>

        <h3>Install</h3>
        <Code lang="bash">pip install interlock</Code>

        <h3>Initialise</h3>
        <Code lang="python">{`import interlock
import os

client = interlock.Interlock(api_key=os.environ["INTERLOCK_API_KEY"])`}
        </Code>

        <h3>Workflows</h3>
        <Code lang="python">{`# Create
wf = client.workflows.create(
    product="ticket_resolution_v2",
    customer_id="cus_acme_prod_01",
    payload={"ticket_id": "TKT-8821"},
)

print(wf.id)              # wf_e4rgffg44fg4g44
print(wf.quoted.amount)   # 0.12

# Fetch
wf = client.workflows.fetch("wf_e4rgffg44fg4g44")

# List
page = client.workflows.list(status="Settled", limit=25)
for wf in page.data:
    print(wf.id, wf.margin.achieved)

# Auto-paginate
for wf in client.workflows.list_auto_paging(status="Settled"):
    print(wf.id)`}
        </Code>

        <h3>Webhooks</h3>
        <Code lang="python">{`from flask import Flask, request

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
    except interlock.SignatureVerificationError:
        return "Bad signature", 400

    if event.type == "workflow.completed":
        print("Settled:", event.data.workflow_id)
        print("Margin:", event.data.margin.achieved)

    return {"received": True}`}
        </Code>

        <h2>cURL</h2>
        <p>
          All endpoints are accessible via plain HTTP. Use cURL for quick
          exploration or in environments without a supported SDK.
        </p>

        <h3>Create a workflow</h3>
        <Code lang="bash">{`curl https://api.interlock.dev/v1/workflows \\
  -X POST \\
  -H "Authorization: Bearer $INTERLOCK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "product": "ticket_resolution_v2",
    "customerId": "cus_acme_prod_01",
    "payload": { "ticketId": "TKT-8821" }
  }'`}
        </Code>

        <h3>List workflows</h3>
        <Code lang="bash">{`curl "https://api.interlock.dev/v1/workflows?status=Settled&limit=10" \\
  -H "Authorization: Bearer $INTERLOCK_API_KEY"`}
        </Code>

        <h3>Fetch a workflow</h3>
        <Code lang="bash">{`curl https://api.interlock.dev/v1/workflows/wf_e4rgffg44fg4g44 \\
  -H "Authorization: Bearer $INTERLOCK_API_KEY"`}
        </Code>

        <Callout type="tip">
          Set <code>INTERLOCK_API_KEY</code> as a shell variable to avoid repeating
          it across cURL commands: <code>export INTERLOCK_API_KEY=sk_test_...</code>
        </Callout>

        <h2>Error handling</h2>
        <p>
          All SDKs throw typed errors. Catch them specifically for robust error handling:
        </p>
        <Code lang="javascript">{`import Interlock, { APIError, AuthenticationError, RateLimitError } from "@interlock/sdk";

try {
  const wf = await client.workflows.create({ ... });
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.error("Invalid API key");
  } else if (err instanceof RateLimitError) {
    const retryAfter = err.headers["retry-after"];
    console.error(\`Rate limited. Retry after \${retryAfter}s.\`);
  } else if (err instanceof APIError) {
    console.error(\`API error \${err.status}: \${err.message}\`);
  } else {
    throw err;
  }
}`}
        </Code>

        <hr />
        <div className="flex items-center justify-between">
          <Link href="/docs/settlement" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M8 5H2M5 8L2 5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Settlement
          </Link>
          <Link href="/docs/webhooks" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            Webhooks
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </DocsLayout>
  );
}
