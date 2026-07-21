import { DocsLayout, Callout } from "@/components/DocsLayout";
import Link from "next/link";

export const metadata = {
  title: "Introduction — Interlock Docs",
  description: "Interlock documentation — AI workflow pricing, quotes, settlement, and margin intelligence.",
};

export default function DocsIntroduction() {
  return (
    <DocsLayout>
      <div className="docs-body">

        <div className="mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>
            Getting Started
          </span>
        </div>
        <h1>Introduction</h1>
        <p className="mt-3" style={{ color: "#a3a3a3", fontSize: 16 }}>
          Interlock is an AI workflow pricing and settlement platform. It gives your team
          real-time cost intelligence on every AI task before it runs, and immutable
          on-chain proof of every execution and payment after it completes.
        </p>

        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-8"
        >
          {[
            { label: "Quickstart", desc: "Create and price your first workflow in minutes.", href: "/docs/quickstart" },
            { label: "Workflows", desc: "Understand lifecycle states, events, and execution.", href: "/docs/workflows" },
            { label: "SDKs", desc: "Node.js, Python, and cURL reference.", href: "/docs/sdks" },
          ].map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="flex flex-col gap-1.5 rounded-xl p-4 transition-colors hover:border-[#2e2e2e]"
              style={{ background: "#0d0d0f", border: "1px solid #1a1a1a" }}
            >
              <span className="text-[13px] font-semibold text-white">{card.label}</span>
              <span className="text-[12px] leading-relaxed" style={{ color: "#5a5a5a" }}>{card.desc}</span>
            </Link>
          ))}
        </div>

        <h2>What is Interlock?</h2>
        <p>
          Most AI products are priced before their costs are understood. Developers ship
          features, users push edge cases, and margin quietly disappears. Interlock solves this
          by making every AI workflow's economics visible and enforceable — before, during,
          and after execution.
        </p>
        <p>
          The platform has three layers:
        </p>
        <ul>
          <li>
            <strong>Quotes</strong> — a pricing contract issued before execution. Define the
            price, the cost ceiling, and the success criteria the outcome must satisfy.
          </li>
          <li>
            <strong>Workflows</strong> — the execution unit. A workflow runs against a quote,
            tracks costs across all layers in real time, and validates the outcome against
            your defined criteria.
          </li>
          <li>
            <strong>Settlement</strong> — on-chain settlement via the Avalanche blockchain with
            outcome attestation stored on Walrus. Every completed workflow produces an
            immutable record of what ran, what it cost, and how payment was split.
          </li>
        </ul>

        <h2>How it works</h2>
        <p>
          The standard execution flow has four steps:
        </p>
        <ol>
          <li>
            <strong>Create a workflow</strong> — call <code>workflows.create()</code> with a
            product ID, customer ID, and input payload. Interlock generates a quote and returns
            the upfront price.
          </li>
          <li>
            <strong>Execute</strong> — your agent or pipeline runs. Interlock tracks model
            inference costs, tool call fees, compute overhead, and human-in-the-loop costs
            in real time as execution proceeds.
          </li>
          <li>
            <strong>Validate</strong> — when execution completes, the outcome is evaluated
            against the success criteria defined in the quote. Criteria can be exact value
            matches, JSON schema assertions, numeric thresholds, or boolean compositions of
            the above.
          </li>
          <li>
            <strong>Settle</strong> — costs are reconciled, payment splits are calculated,
            and the result is written to the Avalanche blockchain with a Walrus attestation blob.
            A dispute window opens; after it closes, the settlement is final.
          </li>
        </ol>

        <h2>Key concepts</h2>

        <h3>Workflows</h3>
        <p>
          A workflow is the atomic unit of work in Interlock. It has a lifecycle: <code>Quoted</code> →{" "}
          <code>Executing</code> → <code>Settled</code> (or <code>Disputed</code> /
          <code>Refunded</code>). Workflow IDs follow the pattern <code>wf_*</code>.
          See <Link href="/docs/workflows" className="transition-colors hover:text-white" style={{ color: "#3064FF" }}>Workflows</Link>.
        </p>

        <h3>Quotes</h3>
        <p>
          A quote is a pricing contract tied to a product and a set of success criteria.
          It specifies the pricing model (fixed, capped, success-fee, or hybrid), the
          quoted amount, and the conditions that define a successful outcome. Quote IDs
          follow the pattern <code>qt_*</code>.
          See <Link href="/docs/quotes" className="transition-colors hover:text-white" style={{ color: "#3064FF" }}>Quotes & Pricing</Link>.
        </p>

        <h3>Success criteria</h3>
        <p>
          Success criteria are deterministic validators applied to the workflow's output.
          They determine whether the outcome counts as a success — which affects whether
          success-fee or hybrid pricing applies.
          See <Link href="/docs/success-criteria" className="transition-colors hover:text-white" style={{ color: "#3064FF" }}>Success Criteria</Link>.
        </p>

        <h3>Settlement & attestation</h3>
        <p>
          Every settled workflow produces an on-chain record on the Avalanche blockchain.
          The execution trace and proof are stored as Walrus blobs. The settlement
          record includes the reconciled cost breakdown, payment splits, platform fee,
          and a cryptographic signature from the Interlock signer.
          See <Link href="/docs/settlement" className="transition-colors hover:text-white" style={{ color: "#3064FF" }}>Settlement</Link>.
        </p>

        <h2>Environments</h2>
        <p>
          Interlock has two environments. Use test keys during development — no real
          charges are made and settlement calls are simulated.
        </p>
        <table>
          <thead>
            <tr>
              <th>Environment</th>
              <th>API key prefix</th>
              <th>Base URL</th>
              <th>Settlement</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Live</strong></td>
              <td><code>sk_live_</code></td>
              <td><code>api.interlock.dev/v1</code></td>
              <td>Avalanche mainnet</td>
            </tr>
            <tr>
              <td><strong>Test</strong></td>
              <td><code>sk_test_</code></td>
              <td><code>api.interlock.dev/v1</code></td>
              <td>Avalanche Fuji testnet</td>
            </tr>
          </tbody>
        </table>

        <Callout type="info">
          The same API base URL serves both environments. The key prefix determines
          which environment your request targets.
        </Callout>

        <h2>API versioning</h2>
        <p>
          The current stable API version is <strong>v1</strong>. The version is expressed
          in the base path (<code>/v1/</code>). Breaking changes will be introduced under
          a new version path with advance notice and a deprecation window of at least 90 days.
        </p>
        <p>
          Non-breaking additions — new optional fields, new event types, new endpoints —
          may be made at any time without a version bump.
        </p>

        <hr />

        <div className="flex items-center justify-between">
          <span style={{ color: "#3a3a3a", fontSize: 13 }}>Next</span>
          <Link
            href="/docs/quickstart"
            className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:text-white"
            style={{ color: "#3064FF" }}
          >
            Quickstart
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

      </div>
    </DocsLayout>
  );
}
