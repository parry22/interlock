import { DocsLayout, Code, Callout } from "@/components/DocsLayout";
import Link from "next/link";

export const metadata = { title: "Authentication — Interlock Docs" };

export default function DocsAuthentication() {
  return (
    <DocsLayout>
      <div className="docs-body">
        <div className="mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>
            Getting Started
          </span>
        </div>
        <h1>Authentication</h1>
        <p className="mt-3" style={{ color: "#a3a3a3", fontSize: 15 }}>
          All API requests authenticate with a secret API key passed as a Bearer token.
        </p>

        <h2>API keys</h2>
        <p>
          Interlock uses secret API keys for authentication. Each key is scoped to an
          environment — live or test. Keys can be created, rotated, and revoked from
          <strong> Dashboard → Developer → API Keys</strong>.
        </p>
        <table>
          <thead>
            <tr>
              <th>Prefix</th>
              <th>Environment</th>
              <th>Charges</th>
              <th>Settlement</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>sk_live_</code></td>
              <td>Live / production</td>
              <td>Real</td>
              <td>Avalanche mainnet</td>
            </tr>
            <tr>
              <td><code>sk_test_</code></td>
              <td>Test / development</td>
              <td>Simulated</td>
              <td>Avalanche Fuji</td>
            </tr>
          </tbody>
        </table>
        <p>
          Include the key as a <code>Bearer</code> token in the <code>Authorization</code> header
          of every request:
        </p>
        <Code lang="bash">{`curl https://api.interlock.dev/v1/workflows \\
  -H "Authorization: Bearer sk_test_abc123..."`}
        </Code>

        <Callout type="warning">
          Never expose your secret key in client-side code, public repositories, or logs.
          If a key is compromised, revoke it immediately from the dashboard and issue a
          new one.
        </Callout>

        <h2>Key management</h2>
        <p>
          Best practices for managing API keys:
        </p>
        <ul>
          <li>Store keys in environment variables or a secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault).</li>
          <li>Create separate keys per service or deployment environment.</li>
          <li>Set a descriptive name when creating a key so you can identify it later.</li>
          <li>Rotate keys periodically — the dashboard shows each key's <em>last used</em> timestamp to help identify stale keys.</li>
          <li>Revoke keys that are no longer in use.</li>
        </ul>

        <h2>Rate limits</h2>
        <p>
          Sensitive endpoints are rate-limited. Exceeding a limit returns a
          <code> 429 Too Many Requests</code> response with a <code>Retry-After</code>{" "}
          header. Current early-access limits (per IP, per minute):
        </p>
        <table>
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Requests / minute</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Start a workflow</td>
              <td>20</td>
            </tr>
            <tr>
              <td>Verify an outcome</td>
              <td>30</td>
            </tr>
            <tr>
              <td>Fund wallet / faucet</td>
              <td>5</td>
            </tr>
          </tbody>
        </table>
        <Code lang="bash">{`# When you exceed a limit you get a 429 with:
{ "error": "rate limit exceeded", "retryAfterSeconds": 42 }
# plus a Retry-After header.`}
        </Code>
        <p>
          During early access, limits are per-endpoint (for example, starting a
          workflow is capped at 20 requests/minute per IP) rather than per-plan.
          Back off and retry after the <code>Retry-After</code> interval on a{" "}
          <code>429</code>.
        </p>

        <h2>Request timeouts</h2>
        <p>
          The API enforces a <strong>30-second timeout</strong> on all requests. Long-running
          workflow operations are handled asynchronously — <code>workflows.create()</code>
          returns immediately with the workflow ID and quoted price, while execution
          proceeds in the background and results are delivered via webhooks.
        </p>

        <h2>TLS</h2>
        <p>
          All API traffic must use HTTPS. Requests over plain HTTP are rejected with a
          redirect. The minimum TLS version is 1.2; TLS 1.3 is preferred.
        </p>

        <hr />
        <div className="flex items-center justify-between">
          <Link href="/docs/quickstart" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M8 5H2M5 8L2 5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Quickstart
          </Link>
          <Link href="/docs/workflows" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            Workflows
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </DocsLayout>
  );
}
