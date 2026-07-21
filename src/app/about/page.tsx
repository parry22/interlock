import { BlogLayout } from "@/components/BlogLayout";

export const metadata = {
  title: "About — Interlock",
  description: "We built Interlock because AI teams deserve to know what they're selling before they sell it.",
};

export default function AboutPage() {
  return (
    <BlogLayout
      category="Company"
      title="We Built the Infrastructure That AI Billing Was Missing"
      readTime="6 min read"
      date="May 2026"
    >
      <p>
        Every major infrastructure shift in software history has produced the same
        pattern: a new primitive becomes economically significant, and the tooling to
        safely transact around it lags years behind. We saw this with cloud compute,
        with usage-based SaaS, and with payments. We are watching it happen again with
        AI — and this time the stakes are higher, because the cost surface is more
        complex and the trust requirements are more demanding.
      </p>
      <p>
        Interlock exists to close that gap. We are building the billing and settlement
        layer that AI-native businesses need to operate with confidence — where every
        workflow is priced before it runs, every outcome is verified before a dollar
        moves, and every payment settles atomically across all parties simultaneously.
      </p>

      <h2>The Problem We Kept Seeing</h2>
      <p>
        We spent years watching AI product teams navigate the same set of compounding
        problems. Not as outside observers — as engineers and operators who built
        and shipped AI products and felt these problems from the inside.
      </p>
      <p>
        The first problem is cost opacity. AI workflows are not fixed-cost operations.
        A single agent task can involve dozens of model calls, tool invocations, retrieval
        passes, and third-party API lookups — each with its own price. The total cost of
        that task is not known at the moment a customer is charged. It is discovered later,
        in a billing statement, after the margin damage is done.
      </p>
      <p>
        The second problem is settlement friction. When an AI workflow produces a result,
        multiple parties have a legitimate claim on that revenue: the model provider, the
        tool APIs, the platform, the operator. Today, these payments are settled through
        a chain of manual invoices, batched reconciliation, and delayed transfers. The
        money moves slowly, the accounting is error-prone, and nobody has a single
        source of truth.
      </p>
      <p>
        The third problem is outcome trust. In a world where agents produce valuable
        deliverables — contracts, analyses, decisions, code — there is no standard way
        to prove what was produced, when it was produced, or whether it met the criteria
        the customer paid for. Disputes are handled by emailing support. Evidence is
        anecdotal. Resolutions are inconsistent.
      </p>

      <blockquote>
        <p>
          These are not edge cases. They are the default operating conditions for every
          AI business that has moved past the prototype stage.
        </p>
      </blockquote>

      <h2>What We Built and Why</h2>
      <p>
        Interlock is a pricing, escrow, and settlement protocol for AI workflows. The core
        design decision was to treat every workflow as a financial transaction from the
        moment it begins — not from the moment it completes.
      </p>
      <p>
        When a customer initiates a workflow, Interlock generates a binding quote: a
        precise price, a set of success criteria, and a locked escrow. The customer
        knows what they will pay. The operator knows what they will earn. The funds are
        held on-chain before a single model call is made.
      </p>
      <p>
        When the workflow completes, a verifier evaluates the outcome against the
        success criteria defined in the quote. The evaluation is cryptographically
        attested — signed by a trusted execution environment, with the outcome, trace,
        and proof stored immutably on Walrus. No one can retroactively alter what was
        produced or what criteria were applied.
      </p>
      <p>
        Settlement is then triggered automatically. A single atomic transaction on Avalanche
        moves funds simultaneously to every recipient in the payment graph — model
        provider, tool APIs, operator, platform — with no intermediate steps, no manual
        reconciliation, and no possibility of partial payment. Either every party is
        paid in full, or no one is paid and the customer is refunded. That guarantee is
        enforced at the protocol level.
      </p>

      <h2>Why On-Chain Settlement</h2>
      <p>
        The decision to build on Avalanche was not arbitrary. Multi-party atomic settlement —
        the ability to disburse to many recipients in a single all-or-nothing transaction
        — is a hard problem in traditional payment systems. It requires trust in an
        intermediary, or a complex coordination protocol, or both.
      </p>
      <p>
        On Avalanche, a single atomic transaction can transfer to any number of
        recipients atomically. The settlement logic is a Solidity smart contract: open,
        auditable, and unable to be changed by any single party after deployment. The
        escrow is held in USDC, not a proprietary token. And every settled workflow
        produces a permanent on-chain record — a proof of payment that any party can
        verify independently.
      </p>
      <p>
        This is not about decentralisation for its own sake. It is about using the right
        tool for the job. When you need to move money to six parties simultaneously, with
        no manual intervention, and produce a tamper-proof receipt, a blockchain is not
        an exotic choice. It is the practical one.
      </p>

      <h2>Verifiable Outcomes as Infrastructure</h2>
      <p>
        The settlement layer is only useful if the outcome verification layer is trustworthy.
        We spent significant design effort on this, because it is the part most infrastructure
        providers skip.
      </p>
      <p>
        Interlock ships a success criteria DSL — a structured, machine-readable specification
        of what a workflow must produce to be considered successful. Operators define criteria
        at quote creation time: exact string matches, regular expressions, JSON schema
        validation, numeric thresholds, or boolean compositions of the above. These criteria
        are CBOR-encoded, hashed, and committed to the quote on-chain before execution begins.
        They cannot be changed after the fact.
      </p>
      <p>
        At settlement time, the verifier evaluates the actual outcome against those committed
        criteria inside a trusted execution environment. The attestation payload — including
        the workflow ID, outcome blob ID, trace, success verdict, and cost reconciliation —
        is signed by the enclave and verified by the Solidity contract before any funds move.
      </p>
      <p>
        In production, the enclave is an AWS Nitro instance with PCR measurements registered
        on-chain. The verification chain runs from the AWS root certificate, through the enclave
        attestation document, to the Solidity contract — with no trusted intermediary in the path.
        For the hackathon and early integrations, the same pipeline runs with an ECDSA dev
        key. The cryptographic structure is identical; only the trust anchor differs.
      </p>

      <h2>The Economics We Are Enabling</h2>
      <p>
        We are not building a payments product. We are building the economic infrastructure
        that makes an entirely new category of AI business model viable: outcome-based pricing.
      </p>
      <p>
        Today, AI products are priced on access — per seat, per API call, per month. This
        works when the product is a tool. It breaks down when the product is a result. If an
        agent produces a qualified sales meeting, a completed due diligence report, a working
        code migration — the economic logic of charging for that outcome is completely different
        from charging for the tokens consumed.
      </p>
      <p>
        Success fee pricing — charging only when success criteria are met — is the natural
        pricing model for outcome-based AI. But it requires infrastructure that can hold
        payment in escrow, evaluate outcomes objectively, and release or refund atomically.
        That infrastructure did not exist. Interlock is that infrastructure.
      </p>
      <p>
        Alongside success fees, we support fixed pricing for predictable workflows, capped
        pricing with markup for operators who want cost certainty, and hybrid models that
        combine a base fee with outcome-contingent components. The right model depends on
        the workflow. The platform supports all of them.
      </p>

      <h2>Where We Are Going</h2>
      <p>
        The first version of Interlock is settlement infrastructure: quotes, escrow, outcome
        verification, and atomic multi-party payment. That is the foundation — and it is
        running on Avalanche Fuji today.
      </p>
      <p>
        The layer above it is pricing intelligence: real-time cost tracking as workflows
        execute, margin guardrails that intervene before a task becomes unprofitable,
        customer-level profitability analytics, and benchmarking data drawn from the
        aggregate settlement graph. We are building this now.
      </p>
      <p>
        The layer above that is the agentic economy's financial primitive: a settlement
        protocol that any AI agent can invoke to transact with any other party — human,
        business, or machine — with cryptographic guarantees on both sides of the exchange.
      </p>
      <p>
        We are early. The category is early. But the problems are real, they are growing
        with every AI product that ships, and the teams building those products deserve
        infrastructure that is built to the same standard of correctness they hold their
        own software to.
      </p>
      <p>
        That is what we are building.
      </p>

      <h2>Get in Touch</h2>
      <p>
        If you are building AI products and recognise these problems, we would like to
        talk to you. Interlock is in early access on Avalanche Fuji. Design partners get
        direct access to the team, input into the roadmap, and settlement infrastructure
        that is production-ready from day one.
      </p>
      <p>
        Reach out via the dashboard, through our developer docs, or directly at{" "}
        <strong>team@interlock.xyz</strong>. We read everything.
      </p>
    </BlogLayout>
  );
}
