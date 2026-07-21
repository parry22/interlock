import { DocsLayout, Code, Callout } from "@/components/DocsLayout";
import Link from "next/link";

export const metadata = { title: "Settlement — Interlock Docs" };

export default function DocsSettlement() {
  return (
    <DocsLayout>
      <div className="docs-body">
        <div className="mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>
            Core Concepts
          </span>
        </div>
        <h1>Settlement</h1>
        <p className="mt-3" style={{ color: "#a3a3a3", fontSize: 15 }}>
          Every completed workflow is settled on the Avalanche blockchain. Settlement
          produces an immutable record of the execution, cost breakdown, payment splits,
          and outcome proof — accessible to all parties at any time.
        </p>

        <h2>Settlement flow</h2>
        <ol>
          <li>
            <strong>Outcome validation</strong> — success criteria are evaluated against the
            workflow's output. The result (success or failure) determines which pricing model
            branch applies.
          </li>
          <li>
            <strong>Cost reconciliation</strong> — actual costs across all four layers (model,
            tools, compute, human) are reconciled against the quoted price to produce the
            final margin.
          </li>
          <li>
            <strong>Attestation construction</strong> — an attestation payload is built
            containing the workflow ID, outcome flag, cost items, and payment splits.
            It is signed with the Interlock ECDSA signer key.
          </li>
          <li>
            <strong>Walrus upload</strong> — the outcome blob, execution trace, and proof
            blob are uploaded to Walrus decentralised storage. Each upload returns a
            Walrus blob ID used to reference the data on-chain.
          </li>
          <li>
            <strong>On-chain submission</strong> — the signed attestation is submitted to
            the Interlock Solidity contract. The transaction is confirmed and an Avalanche
            transaction ID is returned.
          </li>
          <li>
            <strong>Dispute window</strong> — after settlement, a configurable window opens
            during which any party can raise a dispute. Default is 1 hour in production.
            After the window closes, settlement is final and irreversible.
          </li>
        </ol>

        <h2>Attestation payload</h2>
        <Code lang="json">{`{
  "workflowId": "wf_e4rgffg44fg4g44",
  "outcomeSuccess": true,
  "outcomeBlobId": "GzPQ9r...walrus",
  "traceBlobId":   "HxRT2m...walrus",
  "proofBlobId":   "KwBN4p...walrus",
  "costItems": [
    { "provider": "openai",  "category": "model",   "units": 14820, "amount": 0.0213 },
    { "provider": "serper",  "category": "tools",   "units": 3,     "amount": 0.0060 },
    { "provider": "interlock", "category": "compute", "units": 1,     "amount": 0.0048 }
  ],
  "paymentSplits": [
    { "recipient": "0xacme...", "amount": 0.086, "role": "operator" },
    { "recipient": "0xwos...",  "amount": 0.014, "role": "platform" }
  ],
  "platformFee": 0.014,
  "nonce": "a3f9b812",
  "timestamp": 1716982330
}`}
        </Code>

        <h2>Walrus storage</h2>
        <p>
          Execution evidence is stored on Walrus, a decentralised storage network
          built on Avalanche. Three blobs are uploaded per settlement:
        </p>
        <table>
          <thead>
            <tr><th>Blob</th><th>Contents</th><th>Retention</th></tr>
          </thead>
          <tbody>
            {[
              ["outcomeBlobId",  "The raw outcome JSON returned by your agent.", "5 epochs (~10 weeks on testnet)"],
              ["traceBlobId",    "Full criteria evaluation trace — every step with matched/not-matched reason.", "5 epochs"],
              ["proofBlobId",    "Cryptographic proof of execution integrity.", "5 epochs"],
            ].map(([b, c, r]) => (
              <tr key={b}><td><code>{b}</code></td><td>{c}</td><td>{r}</td></tr>
            ))}
          </tbody>
        </table>

        <Callout type="info">
          Blob retention defaults to 5 epochs. On Avalanche mainnet, one epoch is approximately
          24 hours, giving ~5 days of default retention. For longer-term storage, configure
          a higher epoch count in your account settings.
        </Callout>

        <p>
          Blobs are retrievable directly from any Walrus aggregator endpoint using
          the blob ID:
        </p>
        <Code lang="bash">{`curl https://aggregator.walrus-testnet.walrus.space/v1/<blob_id>`}
        </Code>

        <h2>On-chain verification</h2>
        <p>
          The settlement is verifiable on-chain using the Avalanche transaction ID returned
          in <code>workflow.settlement.txId</code>. The Interlock Solidity contract records:
        </p>
        <ul>
          <li>Workflow ID and operator address</li>
          <li>Outcome success flag and blob references</li>
          <li>Payment split amounts and recipient addresses</li>
          <li>Platform fee and timestamp</li>
          <li>Ed25519 signature from the Interlock signer public key</li>
        </ul>

        <h2>Disputes</h2>
        <p>
          Any party can raise a dispute within the dispute window by calling
          <code> client.disputes.create(workflowId, reason)</code>. Active disputes
          pause any pending payouts. The dispute is resolved by the Interlock
          arbitration process, which reviews the execution trace and on-chain evidence.
        </p>
        <p>
          Dispute outcomes:
        </p>
        <table>
          <thead>
            <tr><th>Outcome</th><th>Workflow status</th><th>Payment</th></tr>
          </thead>
          <tbody>
            <tr><td>Resolved for operator</td><td><code>Settled</code></td><td>Operator receives full payment</td></tr>
            <tr><td>Resolved for customer</td><td><code>Refunded</code></td><td>Customer receives full refund</td></tr>
            <tr><td>Partial resolution</td><td><code>Settled</code></td><td>Proportional split as determined</td></tr>
          </tbody>
        </table>

        <hr />
        <div className="flex items-center justify-between">
          <Link href="/docs/success-criteria" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M8 5H2M5 8L2 5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Success Criteria
          </Link>
          <Link href="/docs/sdks" className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white" style={{ color: "#3064FF" }}>
            SDKs
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </DocsLayout>
  );
}
