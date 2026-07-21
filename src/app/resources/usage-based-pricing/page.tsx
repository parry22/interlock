import { BlogLayout } from "@/components/BlogLayout";

export const metadata = {
  title: "Usage-Based Pricing — Interlock",
  description: "Why usage-based pricing is the only model that makes sense for AI products — and how to implement it without killing adoption.",
};

export default function UsageBasedPricingPage() {
  return (
    <BlogLayout
      category="Resources"
      title="Why Usage-Based Pricing Is the Only Model That Scales for AI"
      readTime="9 min read"
      date="May 2026"
    >
      <p>
        The history of software pricing is a history of abstraction. Seat-based pricing
        abstracted away from actual usage. Tiered feature plans abstracted away from
        individual value delivery. Both models worked because software costs were roughly
        fixed — a user was a user, regardless of what they did.
      </p>
      <p>
        AI breaks this assumption entirely. And companies that try to apply flat-rate pricing
        logic to AI products will discover the same lesson, at varying speeds and varying cost
        levels: when your cost basis is variable by orders of magnitude, your pricing model
        has to be variable too.
      </p>

      <h2>The Cost Variability Problem</h2>
      <p>
        With traditional SaaS, a power user might make more API calls or store more data. The
        per-user cost curve has some slope, but it is manageable. With AI, the curve is not
        manageable in a flat-rate model. A user who runs simple, single-turn queries costs
        fundamentally less to serve than one who runs complex multi-step agent workflows. The
        gap can be 100x or more — and both users may be on the same plan, paying the same
        monthly fee.
      </p>
      <p>
        Flat-rate pricing in this environment has a predictable consequence: your most engaged,
        most active users are your least profitable ones. The product experience you are most
        proud of — the complex, high-value workflows that heavy users rely on — is the one
        that is silently destroying your margins.
      </p>
      <p>
        Usage-based pricing, where customers pay for what they actually consume, is the
        structural solution to this problem. It aligns your revenue with your costs. It creates
        a sustainable economics for both you and your customers. And it scales without the
        inherent tension that flat-rate pricing creates between growth and profitability.
      </p>

      <h2>Choosing the Right Usage Metric</h2>
      <p>
        The hardest problem in usage-based pricing is choosing what to charge for. The
        wrong choice creates friction, confusion, or misaligned incentives. The options fall
        roughly into five categories:
      </p>
      <ul>
        <li>
          <strong>Tokens</strong> — direct but opaque. Your costs are token-denominated, but
          customers do not think in tokens and cannot predict their bills. Chilling effect on
          adoption.
        </li>
        <li>
          <strong>API calls</strong> — too coarse. A one-call classification and a ten-call
          research agent look identical. You cannot price them the same.
        </li>
        <li>
          <strong>Tasks</strong> — better. A task is a natural unit of user intent. Customers
          understand "I ran 200 tasks this month." But tasks vary in complexity, which requires
          either task typing or a credit system to resolve.
        </li>
        <li>
          <strong>Credits</strong> — flexible and scalable. Credits can be calibrated to actual
          compute cost and translated into natural-language units for customers. A standard task
          costs 1 credit. A complex agent run costs 15. Customers buy credits in blocks. This is
          the most common model for mature AI products.
        </li>
        <li>
          <strong>Outcomes</strong> — ideal but difficult. Charging for results aligns incentives
          perfectly, but requires a reliable, auditable outcome signal. Feasible in narrow
          verticals with clear success criteria.
        </li>
      </ul>
      <p>
        Most teams land on a credit or task-based model, with credits mapped to underlying
        compute cost and packaged into tiers that customers can reason about without needing
        to understand the infrastructure behind them.
      </p>

      <h2>The Commitment Trap</h2>
      <p>
        The most common objection to usage-based pricing from product teams is the commitment
        trap: customers are hesitant to expand usage because they fear unpredictable bills.
        This is a real concern. Unpredictable costs are a genuine barrier to adoption,
        particularly in enterprise contexts where procurement cycles require budget certainty.
      </p>
      <p>
        The solution is not to revert to flat rates. It is to make usage transparent and
        controllable. Customers should be able to see exactly what they are spending, in real
        time, at the task level. They should be able to set hard spend caps and receive alerts
        before those caps are reached. They should be able to forecast their usage based on
        historical data.
      </p>
      <p>
        This gives the budget predictability that enterprise customers need, without sacrificing
        the cost alignment that your margins require. Transparency eliminates the commitment
        trap more effectively than flat rates do — and without the structural damage to your
        unit economics.
      </p>

      <h2>Designing Usage Tiers That Actually Work</h2>
      <p>
        Even within a usage-based model, packaging and tier design matter significantly.
        Raw consumption billing with no structure creates decision fatigue and makes upsell
        conversations harder. Good usage-based tier design follows several principles:
      </p>
      <ul>
        <li>
          Anchor to a natural starting point that matches the median new customer's monthly
          usage — not a number you invented in a spreadsheet.
        </li>
        <li>
          Create clear upgrade triggers: overage pricing that makes the next tier obviously
          better value rather than a tax on success.
        </li>
        <li>
          Separate base capacity from premium capability. Simple tasks and advanced agent
          workflows should be priced differently, not just metered differently.
        </li>
        <li>
          Reflect your actual cost curve. Tiers should be spaced in proportion to the underlying
          cost distribution, not arbitrary multiples.
        </li>
        <li>
          Version your tiers with usage data. Your cost distribution in month six will be
          different from month one. Tier design should evolve with it.
        </li>
      </ul>

      <h2>The Data Prerequisite</h2>
      <p>
        You cannot design a functional usage-based pricing model without per-task cost data.
        This is the prerequisite that most teams skip. They design the pricing model based on
        infrastructure estimates, launch the product, and then reprice reactively when the
        margins do not materialise.
      </p>

      <blockquote>
        <p>
          The right order is: instrument first, price second. Know exactly what every
          workflow costs to run, across every customer segment, before you decide what
          to charge for it.
        </p>
      </blockquote>

      <p>
        This means building cost instrumentation before you launch pricing changes, running at
        least 60–90 days of real usage through the instrumentation layer, and building a cost
        distribution per workflow type and per customer segment before you set a single price.
      </p>
      <p>
        Usage-based pricing is not just a revenue strategy. It is an operational discipline —
        one that forces you to understand your product's economics well enough to stake your
        business on them. Companies that treat it as a billing configuration will get billing
        results. Companies that treat it as a strategic function will build pricing models
        that compound over time.
      </p>
    </BlogLayout>
  );
}
