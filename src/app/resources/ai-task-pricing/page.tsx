import { BlogLayout } from "@/components/BlogLayout";

export const metadata = {
  title: "AI Task Pricing — Interlock",
  description: "The hidden economics of AI tasks and why per-task cost instrumentation is the foundation of a sustainable AI business.",
};

export default function AiTaskPricingPage() {
  return (
    <BlogLayout
      category="Resources"
      title="The Hidden Economics of AI Tasks"
      readTime="8 min read"
      date="May 2026"
    >
      <p>
        Modern AI products are built on a convenient assumption: that compute costs are
        predictable. They are not. Every time a user triggers an AI workflow — summarising a
        document, generating a contract, routing a support ticket — the cost of that operation
        varies. It varies by model, by token count, by latency tier, by orchestration overhead.
        And in most companies, nobody is tracking any of it.
      </p>
      <p>
        This is the AI task pricing problem. And until you solve it, you cannot build an AI
        product with defensible margins.
      </p>

      <h2>What Is an AI Task?</h2>
      <p>
        An AI task is any discrete unit of work performed by a language model or AI pipeline in
        response to a user action or system trigger. It might be:
      </p>
      <ul>
        <li>A single model inference call — "classify this support ticket"</li>
        <li>A multi-step agent chain — "research this company and draft a proposal"</li>
        <li>A retrieval-augmented generation pass over a document corpus</li>
        <li>A batch processing run over structured user data</li>
      </ul>
      <p>
        Each has a different cost profile. A simple classification call might cost $0.0003. A
        multi-step research agent with tool calls and web search might run $0.40 or more. The
        difference is three orders of magnitude — and if your pricing model does not reflect
        this, you are flying blind.
      </p>

      <h2>The Four Cost Layers</h2>
      <p>
        AI task costs break down into four layers, each of which must be tracked
        independently before you can reason about total task economics.
      </p>

      <h3>1. Model Inference</h3>
      <p>
        Token input and output costs from your LLM provider. This is the most visible and most
        variable cost. Input tokens and output tokens are priced differently — output tokens are
        almost always more expensive, and complex tasks generate far more output. Switching models
        mid-product can change your cost basis by 5–10x overnight.
      </p>

      <h3>2. Compute and Infrastructure</h3>
      <p>
        The cost of running your own embedding models, vector databases, retrieval systems, and
        API gateways. Often underestimated because it is baked into shared infrastructure budgets
        rather than attributed per task.
      </p>

      <h3>3. Orchestration Overhead</h3>
      <p>
        Coordination costs for multi-step workflows: retries, routing logic, context management,
        memory reads and writes. These add up significantly in agentic systems where a single
        user-visible task may involve dozens of internal operations.
      </p>

      <h3>4. Third-Party Tool Calls</h3>
      <p>
        Search APIs, data enrichment providers, external integrations that your agents invoke.
        These costs are real, often material, and almost universally ignored in initial pricing models.
      </p>

      <h2>The Margin Trap</h2>
      <p>
        Here is what happens in practice. A company ships an AI feature. Internal testing
        estimates average cost at $0.05 per task. The feature is priced at $0.20 — a 75% margin.
        The launch goes well. Then power users start using the feature in ways the team never
        modelled. Their sessions are longer. Their queries are more complex. Their tasks involve
        more tool calls and larger context windows. Actual cost climbs to $0.18 per task. The
        margin collapses to 10%. The feature that was supposed to drive revenue is now a liability.
      </p>

      <blockquote>
        <p>
          This is not a hypothetical. It is the default outcome when AI task economics are not
          tracked at the individual task level.
        </p>
      </blockquote>

      <p>
        The problem compounds because the customers doing the most damage are often your most
        engaged, most vocal users — the ones driving word-of-mouth and case studies. By the time
        the economics become visible in aggregate reporting, the damage is structural.
      </p>

      <h2>What Good AI Task Pricing Looks Like</h2>
      <p>
        Mature AI task pricing is not about charging more. It is about understanding what you are
        selling. Every AI feature is a product with a cost structure. The companies that treat it
        that way will build sustainable businesses. The ones that do not will bleed margin until
        they cannot anymore.
      </p>
      <p>The foundation requires five things:</p>
      <ul>
        <li>
          <strong>Per-task cost instrumentation</strong> — every task logs its actual spend
          across all four cost layers, in real time, before any billing aggregation occurs.
        </li>
        <li>
          <strong>Customer-level cost visibility</strong> — aggregate task costs per customer,
          so you can distinguish profitable accounts from structurally expensive ones.
        </li>
        <li>
          <strong>Workflow-level breakdown</strong> — cost by feature, not just in aggregate.
          Knowing that you spent $12,000 on AI this month tells you nothing. Knowing that one
          workflow accounts for 60% of that spend tells you exactly where to look.
        </li>
        <li>
          <strong>Dynamic price modelling</strong> — pricing decisions informed by observed
          cost distributions, not estimates. Set prices after you have real cost data, not before.
        </li>
        <li>
          <strong>Margin floor enforcement</strong> — automatic alerts or workflow modifications
          when a task breaches your minimum acceptable margin threshold, before the cost is
          fully incurred.
        </li>
      </ul>

      <h2>The Instrumentation Prerequisite</h2>
      <p>
        None of the above is possible without instrumentation. Not analytics dashboards, not
        monthly cost reports — instrumentation: the practice of recording the actual cost of
        every task, attributed to the specific workflow, user, and operation that incurred it,
        at the moment it occurs.
      </p>
      <p>
        This is the foundational investment that most AI product teams defer. They intend to add
        it later. Later, for most of them, arrives as a margin crisis.
      </p>
      <p>
        The companies that instrument first and price second are the ones that still have healthy
        margins twelve months after launch. The ones that do it the other way around spend those
        twelve months repricing, re-architecturing, and explaining to investors why the unit
        economics that looked compelling in the pitch deck no longer apply.
      </p>
      <p>
        AI task pricing is not a finance function. It is an engineering discipline. Build it into
        the product from the start.
      </p>
    </BlogLayout>
  );
}
