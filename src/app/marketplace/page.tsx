"use client";

// Hire-an-agent page. Client types a task in plain English, we rank candidate
// agents from the marketplace, and the client picks one to hire. The hire
// button reuses the same CreateWorkflowDrawer flow as agent detail — the
// resulting workflow is tagged via workflow_agent_links so the agent's
// track record updates on settle.

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  StoreIcon,
  SearchIcon,
  CheckmarkCircleIcon,
  AlertDiamondIcon,
  Brain01Icon,
  ToolsIcon,
  UserMultipleIcon,
  CodeIcon,
  PlayCircleIcon,
} from "@hugeicons/core-free-icons";

import { CreateWorkflowDrawer } from "@/components/CreateWorkflowDrawer";

type WorkflowStep = {
  kind: "model_call" | "tool_call" | "human_review" | "compute";
  label: string;
  provider?: string;
  costNote?: string;
};

type AgentResult = {
  id: number;
  slug: string;
  name: string;
  description: string;
  taskTags: string[];
  workflowSpec: { steps: WorkflowStep[] };
  criteriaTemplate: unknown;
  exampleOutcome?: Record<string, unknown>;
  priceBaseUnits: number;
  pricingModel: string;
  track: {
    settledCount: number;
    refundedCount: number;
    disputeCount: number;
    totalRevenue: number;
    totalSettled: number;
  };
};

type Match = {
  agent: AgentResult;
  score: { total: number; tagHits: string[]; descHits: number };
};

const KIND_ICON = {
  model_call: Brain01Icon,
  tool_call: ToolsIcon,
  human_review: UserMultipleIcon,
  compute: CodeIcon,
} as const;
const KIND_COLOR = {
  model_call: "#60a5fa",
  tool_call: "#fbbf24",
  human_review: "#a78bfa",
  compute: "#4ade80",
} as const;

export default function MarketplacePage() {
  const [task, setTask] = useState("");
  const [candidates, setCandidates] = useState<Match[] | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hireTarget, setHireTarget] = useState<AgentResult | null>(null);

  async function match() {
    setError(null);
    if (task.trim().length < 5) {
      setError("Describe your task in at least a few words.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/agents/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const j = (await r.json()) as { candidates?: Match[]; tokens?: string[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setCandidates(j.candidates ?? []);
      setTokens(j.tokens ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-5">
      <div>
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={StoreIcon} size={18} color="#3064FF" strokeWidth={1.5} />
          <h1 className="text-white text-[20px] font-semibold tracking-tight">Hire an agent</h1>
        </div>
        <p className="text-[#5a5a5a] text-[12px] mt-0.5">
          Describe what you need done. Interlock matches your task to registered agents and shows you each one&apos;s workflow, price, and track record side-by-side.
        </p>
      </div>

      {/* Task input */}
      <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl px-5 py-4 flex flex-col gap-3">
        <span className="text-[10px] uppercase tracking-wider text-[#5a5a5a] font-semibold">
          What do you need done?
        </span>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="e.g. Close customer refund tickets under $100 for our Shopify store"
          rows={3}
          className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] outline-none focus:border-[#2a2a2a] resize-none"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={match}
            disabled={busy || !task.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] disabled:opacity-50 text-white transition-colors"
          >
            <HugeiconsIcon icon={SearchIcon} size={13} color="currentColor" strokeWidth={1.5} />
            {busy ? "Matching…" : "Find agents"}
          </button>
          <Link
            href="/agents"
            className="px-3 py-2 rounded-full text-[12px] text-[#a3a3a3] hover:text-white transition-colors"
          >
            Browse all agents →
          </Link>
        </div>
        {error && (
          <p className="text-[11px] text-[#f87171]">{error}</p>
        )}
      </div>

      {/* Results */}
      {candidates !== null && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-[#5a5a5a]">
              {candidates.length === 0 ? "No matches —" : `${candidates.length} match${candidates.length === 1 ? "" : "es"} found ·`}
            </span>
            <span className="text-[11px] text-[#a3a3a3]">extracted keywords:</span>
            {tokens.map((t) => (
              <span
                key={t}
                className="text-[10px] px-2 py-0.5 rounded-full bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3]"
              >
                {t}
              </span>
            ))}
          </div>

          {candidates.length === 0 ? (
            <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl py-10 px-6 text-center">
              <p className="text-[#a3a3a3] text-[13px]">
                No registered agent matches this task yet.
              </p>
              <Link href="/agents/new" className="text-[12px] text-[#60a5fa] hover:text-[#93c5fd] mt-2 inline-block">
                Register an agent for it →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {candidates.map(({ agent, score }, i) => (
                <CandidateCard
                  key={agent.id}
                  agent={agent}
                  rank={i + 1}
                  score={score}
                  onHire={() => setHireTarget(agent)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {hireTarget && (
        <CreateWorkflowDrawer
          open={true}
          onClose={() => setHireTarget(null)}
          prefill={{
            agentId: hireTarget.id,
            agentName: hireTarget.name,
            priceBaseUnits: hireTarget.priceBaseUnits,
            criteriaTemplate: hireTarget.criteriaTemplate,
            exampleOutcome: hireTarget.exampleOutcome,
          }}
        />
      )}
    </div>
  );
}

function CandidateCard({
  agent,
  rank,
  score,
  onHire,
}: {
  agent: AgentResult;
  rank: number;
  score: { total: number; tagHits: string[] };
  onHire: () => void;
}) {
  const totalRuns = agent.track.settledCount + agent.track.refundedCount;
  const disputeRate =
    totalRuns === 0 ? null : Math.round((agent.track.disputeCount / totalRuns) * 100);
  return (
    <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[#5a5a5a] font-semibold">
          #{rank} match · score {score.total}
        </span>
        <span className="text-[12px] font-mono text-white">
          {(agent.priceBaseUnits / 1e6).toFixed(2)} USDC
        </span>
      </div>

      <Link href={`/agents/${agent.slug}`}>
        <h3 className="text-[15px] font-semibold text-white hover:text-[#60a5fa] transition-colors">
          {agent.name}
        </h3>
      </Link>

      <p className="text-[12px] text-[#a3a3a3] leading-relaxed line-clamp-3">
        {agent.description}
      </p>

      <div className="flex items-center gap-1.5 flex-wrap">
        {agent.taskTags.map((t) => (
          <span
            key={t}
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              score.tagHits.includes(t.toLowerCase())
                ? "bg-[#3064FF]/15 text-[#60a5fa] border border-[#3064FF]/40"
                : "bg-[#1e1e1e] border border-[#272727] text-[#5a5a5a]"
            }`}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-dashed border-[#1e1e1e]">
        {agent.workflowSpec.steps.slice(0, 4).map((s, i) => (
          <div
            key={i}
            title={s.label}
            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${KIND_COLOR[s.kind]}1a`, color: KIND_COLOR[s.kind] }}
          >
            <HugeiconsIcon icon={KIND_ICON[s.kind]} size={10} color="currentColor" strokeWidth={1.5} />
          </div>
        ))}
        {agent.workflowSpec.steps.length > 4 && (
          <span className="text-[10px] text-[#5a5a5a]">+{agent.workflowSpec.steps.length - 4}</span>
        )}
        <span className="text-[10px] text-[#5a5a5a] ml-auto">
          {agent.workflowSpec.steps.length} steps
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px] text-[#5a5a5a]">
        <span className="flex items-center gap-1.5">
          <HugeiconsIcon icon={CheckmarkCircleIcon} size={11} color="#4ade80" strokeWidth={1.5} />
          {agent.track.settledCount} settled
        </span>
        {disputeRate !== null && (
          <span className="flex items-center gap-1.5">
            <HugeiconsIcon icon={AlertDiamondIcon} size={11} color={disputeRate > 10 ? "#f87171" : "#a3a3a3"} strokeWidth={1.5} />
            {disputeRate}% disputed
          </span>
        )}
      </div>

      <button
        onClick={onHire}
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] text-white transition-colors"
      >
        <HugeiconsIcon icon={PlayCircleIcon} size={12} color="currentColor" strokeWidth={1.5} />
        Hire
      </button>
    </div>
  );
}
