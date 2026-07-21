"use client";

// Two-layer rendering of an agent's workflow:
//   1) Process diagram — visual steps with kind icons + cost notes
//   2) Structured spec — the criteria DSL + pricing model, expandable
//
// Lets a client compare agents at a glance (top) and audit the formal spec
// when they want to (bottom).

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Brain01Icon,
  ToolsIcon,
  UserMultipleIcon,
  CodeIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";

export type WorkflowStep = {
  kind: "model_call" | "tool_call" | "human_review" | "compute";
  label: string;
  provider?: string;
  costNote?: string;
};

export type WorkflowSpec = { steps: WorkflowStep[] };

const STEP_ICONS = {
  model_call: Brain01Icon,
  tool_call: ToolsIcon,
  human_review: UserMultipleIcon,
  compute: CodeIcon,
} as const;
const STEP_COLOR = {
  model_call: "#60a5fa",
  tool_call: "#fbbf24",
  human_review: "#a78bfa",
  compute: "#4ade80",
} as const;
const STEP_LABEL = {
  model_call: "Model",
  tool_call: "Tool",
  human_review: "Human",
  compute: "Compute",
} as const;

export function AgentWorkflowView({
  spec,
  criteriaTemplate,
  pricingModel,
  priceBaseUnits,
}: {
  spec: WorkflowSpec;
  criteriaTemplate: unknown;
  pricingModel: string;
  priceBaseUnits: number;
}) {
  const [specOpen, setSpecOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {/* Process diagram */}
      <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl px-4 py-4">
        <span className="text-[10px] uppercase tracking-wider text-[#5a5a5a] font-semibold">
          Process
        </span>
        <div className="flex flex-col mt-2 gap-2">
          {spec.steps.length === 0 ? (
            <span className="text-[12px] text-[#5a5a5a] italic">No steps declared.</span>
          ) : (
            spec.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `${STEP_COLOR[s.kind]}1a`, color: STEP_COLOR[s.kind] }}
                >
                  <HugeiconsIcon icon={STEP_ICONS[s.kind]} size={11} color="currentColor" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] text-white font-medium">
                      {i + 1}. {s.label}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider"
                      style={{ background: `${STEP_COLOR[s.kind]}1a`, color: STEP_COLOR[s.kind] }}
                    >
                      {STEP_LABEL[s.kind]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px]">
                    {s.provider && (
                      <span className="text-[#a3a3a3] font-mono">{s.provider}</span>
                    )}
                    {s.provider && s.costNote && <span className="text-[#3a3a3a]">·</span>}
                    {s.costNote && <span className="text-[#5a5a5a]">{s.costNote}</span>}
                  </div>
                </div>
                {i < spec.steps.length - 1 && (
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={11}
                    color="#3a3a3a"
                    strokeWidth={1.5}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-[#5a5a5a] font-semibold">
            Pricing
          </span>
          <p className="text-[13px] text-white font-medium mt-0.5">
            {(priceBaseUnits / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC
            <span className="text-[11px] text-[#5a5a5a] ml-2">
              · {pricingModel === "fixed" ? "Fixed per workflow" : pricingModel}
            </span>
          </p>
        </div>
      </div>

      {/* Structured spec — expandable */}
      <button
        onClick={() => setSpecOpen((o) => !o)}
        className="bg-[#171718] border border-[#1e1e1e] rounded-2xl px-4 py-3 flex items-center justify-between hover:border-[#2a2a2a] transition-colors text-left"
      >
        <div>
          <span className="text-[10px] uppercase tracking-wider text-[#5a5a5a] font-semibold">
            Structured spec
          </span>
          <p className="text-[12px] text-[#a3a3a3] mt-0.5">
            Success-criteria DSL the on-chain Quote enforces
          </p>
        </div>
        <HugeiconsIcon
          icon={specOpen ? ArrowDown01Icon : ArrowRight01Icon}
          size={13}
          color="#5a5a5a"
          strokeWidth={1.5}
        />
      </button>
      {specOpen && (
        <pre className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-2xl px-4 py-3 text-[11px] font-mono text-[#a3a3a3] overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(criteriaTemplate, null, 2)}
        </pre>
      )}
    </div>
  );
}
