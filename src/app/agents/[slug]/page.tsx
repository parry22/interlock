"use client";

// Agent detail page. The Hire button opens the existing
// CreateWorkflowDrawer pre-populated with this agent's criteria + price +
// agentId — so the resulting workflow is tagged on workflow_agent_links and
// counts toward the agent's track record.

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  CheckmarkCircleIcon,
  AlertDiamondIcon,
  WorkflowCircleIcon,
  PlayCircleIcon,
} from "@hugeicons/core-free-icons";

import { AgentWorkflowView, type WorkflowSpec } from "@/components/AgentWorkflowView";
import { CreateWorkflowDrawer } from "@/components/CreateWorkflowDrawer";

type AgentDetail = {
  id: number;
  ownerAddress: string;
  slug: string;
  name: string;
  description: string;
  taskTags: string[];
  workflowSpec: WorkflowSpec;
  criteriaTemplate: unknown;
  exampleOutcome?: Record<string, unknown>;
  pricingModel: string;
  priceBaseUnits: number;
  status: string;
  createdAtMs: number;
  track: {
    settledCount: number;
    refundedCount: number;
    disputeCount: number;
    totalRevenue: number;
    totalSettled: number;
  };
};

type RecentWorkflow = {
  link: { workflowId: string; createdAtMs: number };
  workflow: { id: string; status: number; statusName: string; totalRevenue: number; updatedAtMs: number } | null;
};

export default function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [workflows, setWorkflows] = useState<RecentWorkflow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hireOpen, setHireOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/agents/${slug}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { agent: AgentDetail; workflows: RecentWorkflow[] };
        if (cancelled) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAgent(j.agent);
        setWorkflows(j.workflows);
      } catch (e) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (error) {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-6 gap-4">
        <button
          onClick={() => router.push("/agents")}
          className="self-start flex items-center gap-1.5 text-[12px] text-[#5a5a5a] hover:text-white"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={11} color="currentColor" strokeWidth={1.5} />
          Back to agents
        </button>
        <div className="bg-[#3a1818] border border-[#ef4444] rounded-2xl px-4 py-3">
          <p className="text-[13px] font-medium text-[#f87171]">Agent not found</p>
          <p className="text-[11px] text-[#fca5a5] mt-1 font-mono">{error}</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-6 gap-4">
        <span className="text-[#5a5a5a] text-[13px]">Loading…</span>
      </div>
    );
  }

  const totalRuns = agent.track.settledCount + agent.track.refundedCount;
  const disputeRate =
    totalRuns === 0 ? null : Math.round((agent.track.disputeCount / totalRuns) * 100);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-5">
      <button
        onClick={() => router.push("/agents")}
        className="self-start flex items-center gap-1.5 text-[12px] text-[#5a5a5a] hover:text-white"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={11} color="currentColor" strokeWidth={1.5} />
        Back to agents
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-65">
          <h1 className="text-white text-[24px] font-semibold tracking-tight">{agent.name}</h1>
          <p className="text-[#a3a3a3] text-[13px] mt-1 max-w-2xl leading-relaxed">{agent.description}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-3">
            {agent.taskTags.map((t) => (
              <span
                key={t}
                className="text-[10px] px-2 py-0.5 rounded-full bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3]"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/agents/${agent.slug}/outcome`}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[14px] font-medium bg-[#161616] border border-[#272727] text-[#d4d4d4] hover:text-white transition-colors"
          >
            Define outcome
          </Link>
          <button
            onClick={() => setHireOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[14px] font-medium bg-[#3064FF] hover:bg-[#2050d0] text-white transition-colors"
          >
            <HugeiconsIcon icon={PlayCircleIcon} size={14} color="currentColor" strokeWidth={1.5} />
            Hire this agent
          </button>
        </div>
      </div>

      {/* Track record strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Settled" value={String(agent.track.settledCount)} color="#4ade80" icon={CheckmarkCircleIcon} />
        <Stat label="Refunded" value={String(agent.track.refundedCount)} color="#a3a3a3" icon={CheckmarkCircleIcon} />
        <Stat
          label="Dispute rate"
          value={disputeRate === null ? "—" : `${disputeRate}%`}
          color={disputeRate !== null && disputeRate > 10 ? "#f87171" : "#a3a3a3"}
          icon={AlertDiamondIcon}
        />
        <Stat
          label="GMV (USDC)"
          value={(agent.track.totalRevenue / 1e6).toFixed(3)}
          color="#60a5fa"
          icon={WorkflowCircleIcon}
        />
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AgentWorkflowView
            spec={agent.workflowSpec}
            criteriaTemplate={agent.criteriaTemplate}
            pricingModel={agent.pricingModel}
            priceBaseUnits={agent.priceBaseUnits}
          />
        </div>

        {/* Recent runs */}
        <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl px-4 py-4 flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[#5a5a5a] font-semibold">
            Recent runs
          </span>
          {workflows.length === 0 ? (
            <p className="text-[12px] text-[#5a5a5a] italic mt-2">No runs yet — be the first to hire this agent.</p>
          ) : (
            <div className="flex flex-col gap-1 mt-1">
              {workflows.map((w) => (
                <Link
                  key={w.link.workflowId}
                  href={`/workflows/${w.link.workflowId}`}
                  className="flex items-center justify-between gap-2 py-1.5 hover:bg-[#1e1e1e] rounded px-2 -mx-2 transition-colors"
                >
                  <span className="font-mono text-[11px] text-[#a3a3a3] truncate">
                    {w.link.workflowId.slice(0, 8)}…{w.link.workflowId.slice(-4)}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: w.workflow?.status === 3 ? "#4ade80" : "#a3a3a3" }}
                  >
                    {w.workflow?.statusName ?? "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateWorkflowDrawer
        open={hireOpen}
        onClose={() => setHireOpen(false)}
        prefill={{
          agentId: agent.id,
          agentName: agent.name,
          priceBaseUnits: agent.priceBaseUnits,
          criteriaTemplate: agent.criteriaTemplate,
          exampleOutcome: agent.exampleOutcome,
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
}) {
  return (
    <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl px-4 py-3">
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={icon} size={11} color={color} strokeWidth={1.5} />
        <span className="text-[10px] uppercase tracking-wider text-[#5a5a5a] font-semibold">{label}</span>
      </div>
      <p className="text-[20px] font-semibold text-white mt-1">{value}</p>
    </div>
  );
}
