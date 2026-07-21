import { BlogLayout } from "@/components/BlogLayout";

export const metadata = {
  title: "Agent Economics — Interlock",
  description: "The economics of AI agents are unlike anything you have priced before. How to build agent systems that are both powerful and commercially sustainable.",
};

export default function AgentEconomicsPage() {
  return (
    <BlogLayout
      category="Resources"
      title="The Economics of AI Agents Are Unlike Anything You Have Priced Before"
      readTime="10 min read"
      date="May 2026"
    >
      <p>
        Software that runs for six hours and makes 200 tool calls. Agents that spawn
        sub-agents. Workflows that loop, backtrack, and retry until they reach a satisfactory
        answer. This is the new operational reality of AI products — and it requires a
        fundamentally different approach to pricing, cost management, and commercial design.
      </p>
      <p>
        Traditional software economics do not apply here. Neither do the early models developed
        for single-turn LLM products. Agent economics is a distinct discipline, and the
        companies that treat it seriously from the start are the ones that will survive the
        transition from AI demos to AI businesses.
      </p>

      <h2>What Makes Agents Different</h2>
      <p>
        Classical AI products have bounded, relatively predictable cost structures. A user
        submits a query. The model responds. The cost is proportional to input plus output
        tokens. Variation exists but is limited by the single-turn structure.
      </p>
      <p>
        Agentic systems break all of these constraints simultaneously. Agents are autonomous —
        they make decisions, execute tool calls, retrieve data, generate intermediate reasoning,
        and loop until a goal is reached. Every step incurs cost. The total cost of a single
        agent run can range from $0.01 to $10 or more, and the same agent processing the same
        request can produce the same final output at either extreme depending on path length,
        tool call efficiency, model selection, and how many dead ends it explores before
        converging.
      </p>
      <p>
        This is the defining challenge of agent economics: cost is path-dependent. You cannot
        predict the cost of an agent run from the input alone. You can only observe it, measure
        it, and build the governance structures to contain it.
      </p>

      <h2>The Full Cost Stack of an Agent Run</h2>
      <p>
        A typical agent run involves cost at each of the following layers. Missing any one of
        them produces a cost model that is structurally incomplete.
      </p>
      <ul>
        <li>
          <strong>Planning and goal decomposition</strong> — the initial reasoning pass where
          the agent breaks down the goal into a task plan. Often expensive because it requires
          large context windows and complex chain-of-thought generation.
        </li>
        <li>
          <strong>Tool calls</strong> — each external invocation adds latency and cost. Web
          search, database queries, API requests, code execution. Third-party tool call fees
          are a real line item that most agent cost models omit entirely.
        </li>
        <li>
          <strong>Intermediate reasoning</strong> — scratchpad generation, chain-of-thought
          processing, and candidate evaluation steps. Agents that reason explicitly before
          acting incur token costs that are invisible to users but very visible to your
          infrastructure bill.
        </li>
        <li>
          <strong>Retrieval</strong> — vector search and RAG passes to pull relevant context.
          Each retrieval pass involves embedding calls, storage I/O, and context window
          population — all of which scale with the number of retrieval steps in the workflow.
        </li>
        <li>
          <strong>Sub-agent spawning</strong> — parallel or sequential sub-agents multiply
          cost by the number of spawned instances. An orchestrator that creates five specialist
          workers runs at 5x the base cost of a single-agent architecture, plus the overhead of
          coordinating results.
        </li>
        <li>
          <strong>Retry and error recovery</strong> — agents that encounter tool errors, invalid
          outputs, or failed validations retry with corrected inputs. Every retry runs another
          partial path through the workflow at full cost. Long retry chains are one of the most
          common sources of unexpected cost spikes in production agent systems.
        </li>
      </ul>

      <h2>Pricing Models for Agentic Work</h2>
      <p>
        Standard per-token or per-call pricing fits single-turn LLM products. It does not
        fit agents. The mismatch is structural: the unit of value in an agent product is
        not a token or a call — it is a completed goal. The three pricing models that work
        for agents each approach this problem differently.
      </p>

      <h3>Outcome-Based Pricing</h3>
      <p>
        Charge for the result, not the process. A completed research report. A resolved customer
        support ticket. A qualified sales lead. This model creates the cleanest customer
        experience and the strongest alignment between your revenue and the value you deliver.
        It also requires a reliable, auditable definition of "done" and a mechanism to detect
        goal completion — requirements that limit its applicability to verticals with
        well-defined success criteria.
      </p>

      <h3>Budget-Based Execution</h3>
      <p>
        Customers allocate a credit budget to an agent run. The agent optimises within that
        budget, making explicit tradeoffs between thoroughness and cost. When the budget is
        exhausted, the agent surfaces what it has — a partial result with a clear explanation
        of what would require additional budget to complete. This model is increasingly common
        in research-style and analysis workflows, and it gives customers genuine cost control
        without requiring you to predict run costs in advance.
      </p>

      <h3>Tiered Capability Pricing</h3>
      <p>
        Different agent tiers with different cost profiles and capability levels. A standard
        tier uses smaller, faster models with limited tool access and bounded run time. A
        premium tier uses frontier models with full tool access, extended memory, and
        multi-agent architecture. Customers choose the tier based on task complexity. Simple
        operations never incur the cost of the full capability stack; complex operations get
        the resources they require.
      </p>

      <h2>The Multi-Agent Attribution Problem</h2>
      <p>
        As AI systems mature, single-agent architectures give way to networks of specialised
        agents working in coordination. An orchestrator delegates subtasks to workers. Workers
        spawn sub-agents for specific operations. Sub-agents make tool calls to external
        services. At the end of a run, the final output is the product of dozens of
        independent agents, each of which incurred its own cost.
      </p>
      <p>
        In these systems, cost attribution becomes a significant challenge. Every agent
        invocation — from the top-level orchestrator to the deepest sub-agent — must be tagged
        with a common trace ID and attributed to a clear cost owner. Without end-to-end tracing,
        you know the total cost of a run but not its composition. You cannot optimise what you
        cannot see.
      </p>

      <blockquote>
        <p>
          The goal of agent cost tracing is not just accounting. It is understanding which
          architectural decisions are expensive and which are not — so you can make
          intelligent tradeoffs between capability and cost.
        </p>
      </blockquote>

      <h2>Budget Governance for Long-Running Agents</h2>
      <p>
        Agents that run for hours or days require a governance model that single-turn products
        do not need. The operational questions are not difficult to articulate, but most teams
        do not answer them before they ship:
      </p>
      <ul>
        <li>
          What is the maximum acceptable spend for a single agent run, per workflow type?
        </li>
        <li>
          At what spend threshold should the agent pause and escalate to a human operator
          before continuing?
        </li>
        <li>
          What is the agent's behaviour when it exhausts its budget — hard stop, partial
          delivery, or automatic escalation?
        </li>
        <li>
          How does the agent communicate cost status to users during execution, not just
          at the end?
        </li>
        <li>
          When a long-running agent is cancelled mid-run, how is the partial cost attributed
          and communicated?
        </li>
      </ul>
      <p>
        These are not edge cases. They are the standard operating conditions for production
        agent systems at any meaningful scale. Teams that answer them in advance build products
        that customers trust. Teams that do not build products that surprise customers with
        large bills — and then lose those customers permanently.
      </p>

      <h2>The Long View</h2>
      <p>
        Agent economics will become more complex, not less, as agent capabilities improve and
        agent-to-agent coordination becomes standard. The products that will compound value
        over the next several years are the ones built on a foundation of genuine cost
        intelligence — not estimates, not aggregates, but per-run, per-step, per-tool-call
        attribution with real-time governance.
      </p>
      <p>
        The demos are already impressive. The economics are where the next generation of
        AI companies will be built or broken. Companies that treat agent economics as a
        first-class discipline — instrumenting every run, enforcing every budget guardrail,
        and continuously calibrating their cost models against observed reality — will be the
        ones that are still growing two years from now.
      </p>
    </BlogLayout>
  );
}
