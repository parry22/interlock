"use client";

// Agent marketplace listing.
//
// Each card surfaces the three signals a client uses to compare agents:
// pricing, workflow shape (compact summary), and track record (settled
// workflows + dispute rate). Click a card to see the full process diagram.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  StoreIcon,
  SearchIcon,
  AddCircleIcon,
  CheckmarkCircleIcon,
  AlertDiamondIcon,
  Brain01Icon,
  ToolsIcon,
  UserMultipleIcon,
  CodeIcon,
} from "@hugeicons/core-free-icons";

type WorkflowStep = {
  kind: "model_call" | "tool_call" | "human_review" | "compute";
  label: string;
  provider?: string;
  costNote?: string;
};

type AgentListing = {
  id: number;
  ownerAddress: string;
  slug: string;
  name: string;
  description: string;
  taskTags: string[];
  workflowSpec: { steps: WorkflowStep[] };
  pricingModel: string;
  priceBaseUnits: number;
  status: string;
  track: {
    settledCount: number;
    refundedCount: number;
    disputeCount: number;
    totalRevenue: number;
    totalSettled: number;
  };
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

export default function AgentsPage() {
  const router = useRouter();
  const [list, setList] = useState<AgentListing[]>([]);
  const [tags, setTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (tag) params.set("tag", tag);
        if (q.trim()) params.set("q", q.trim());
        const r = await fetch(`/api/agents?${params}`);
        const j = (await r.json()) as { agents: AgentListing[]; tags: Array<{ tag: string; count: number }> };
        if (cancelled) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setList(j.agents);
        setTags(j.tags);
      } catch {
        // ignore
      } finally {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tag, q]);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={StoreIcon} size={18} color="#3064FF" strokeWidth={1.5} />
            <h1 className="text-white text-[20px] font-semibold tracking-tight">Browse agents</h1>
          </div>
          <p className="text-[#5a5a5a] text-[12px] mt-0.5">
            {list.length} active {list.length === 1 ? "agent" : "agents"} · every settlement verified on-chain
          </p>
        </div>
        <button
          onClick={() => router.push("/agents/new")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] text-white transition-colors"
        >
          <HugeiconsIcon icon={AddCircleIcon} size={13} color="currentColor" strokeWidth={1.5} />
          Register your agent
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-[#171718] border border-[#1e1e1e] rounded-full px-3 py-2 max-w-md flex-1 min-w-65">
          <HugeiconsIcon icon={SearchIcon} size={13} color="#5a5a5a" strokeWidth={1.5} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search agents…"
            className="flex-1 bg-transparent text-[13px] text-[#d4d4d4] outline-none placeholder:text-[#3a3a3a]"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setTag(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              tag === null ? "bg-[#3064FF] text-white" : "bg-[#171718] border border-[#1e1e1e] text-[#a3a3a3] hover:text-white"
            }`}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t.tag}
              onClick={() => setTag(t.tag === tag ? null : t.tag)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                tag === t.tag ? "bg-[#3064FF] text-white" : "bg-[#171718] border border-[#1e1e1e] text-[#a3a3a3] hover:text-white"
              }`}
            >
              {t.tag} <span className="text-[#5a5a5a]">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-[#5a5a5a] text-[13px]">Loading agents…</div>
      ) : list.length === 0 ? (
        <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl py-16 px-6 text-center">
          <p className="text-[#a3a3a3] text-[14px]">No agents match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentListing }) {
  const totalRuns = agent.track.settledCount + agent.track.refundedCount;
  const disputeRate =
    totalRuns === 0 ? null : Math.round((agent.track.disputeCount / totalRuns) * 100);
  return (
    <Link
      href={`/agents/${agent.slug}`}
      className="bg-[#171718] border border-[#1e1e1e] rounded-2xl p-5 hover:border-[#2a2a2a] transition-colors flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-white">{agent.name}</h3>
          <p className="text-[11px] text-[#5a5a5a] mt-0.5">{agent.taskTags.slice(0, 3).join(" · ")}</p>
        </div>
        <span className="text-[12px] font-mono text-white whitespace-nowrap">
          {(agent.priceBaseUnits / 1e6).toFixed(2)} USDC
        </span>
      </div>

      <p className="text-[12px] text-[#a3a3a3] leading-relaxed line-clamp-2">
        {agent.description}
      </p>

      {/* Compact workflow */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {agent.workflowSpec.steps.slice(0, 5).map((s, i) => (
          <div
            key={i}
            title={s.label}
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: `${KIND_COLOR[s.kind]}1a`, color: KIND_COLOR[s.kind] }}
          >
            <HugeiconsIcon icon={KIND_ICON[s.kind]} size={11} color="currentColor" strokeWidth={1.5} />
          </div>
        ))}
        {agent.workflowSpec.steps.length > 5 && (
          <span className="text-[10px] text-[#5a5a5a]">+{agent.workflowSpec.steps.length - 5}</span>
        )}
      </div>

      {/* Track record */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-dashed border-[#1e1e1e]">
        <div className="flex items-center gap-1.5 text-[11px] text-[#5a5a5a]">
          <HugeiconsIcon icon={CheckmarkCircleIcon} size={11} color="#4ade80" strokeWidth={1.5} />
          {agent.track.settledCount} settled
        </div>
        {disputeRate !== null ? (
          <div className="flex items-center gap-1.5 text-[11px] text-[#5a5a5a]">
            <HugeiconsIcon icon={AlertDiamondIcon} size={11} color={disputeRate > 10 ? "#f87171" : "#a3a3a3"} strokeWidth={1.5} />
            {disputeRate}% dispute rate
          </div>
        ) : (
          <span className="text-[11px] text-[#5a5a5a]">New listing</span>
        )}
      </div>
    </Link>
  );
}
