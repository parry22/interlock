"use client";

import { RequestAccessButton } from "@/components/RequestAccessButton";

/* ─────────────────────────────────────────────────────────────────
   FeatureSplitSection
   Two alternating rows: [text | card] then [card | text]
   ───────────────────────────────────────────────────────────────── */

/* Gradient-border pill — consistent with all section badges */
function OutlineBadge({ label }: { label: string }) {
  return (
    <div className="inline-flex w-fit rounded-full p-[1px]" style={{ background: "linear-gradient(135deg, #1a1a1a, #2e2e2e)" }}>
      <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#111113]">
        <span className="text-[#3064FF] text-[13px] font-medium">{label}</span>
      </div>
    </div>
  );
}

/* Gradient-border pill with a "New" chip embedded at the start */
function NewOutlineBadge({ label }: { label: string }) {
  return (
    <div className="inline-flex w-fit rounded-full p-[1px]" style={{ background: "linear-gradient(135deg, #1a1a1a, #2e2e2e)" }}>
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#111113]">
        <span
          className="text-[10px] font-bold text-white leading-none px-1.5 py-[3px] rounded-full"
          style={{ background: "#3064FF" }}
        >
          New
        </span>
        <span className="text-[#3064FF] text-[13px] font-medium">{label}</span>
      </div>
    </div>
  );
}

function CtaButton() {
  return (
    <div className="mt-2 self-start">
      <RequestAccessButton size="sm" />
    </div>
  );
}

function ImageCard({ src }: { src?: string }) {
  return (
    <div
      className="w-full rounded-[20px] overflow-hidden"
      style={{ background: "#0f0f11", border: "1px solid #1e1e1e", minHeight: src ? undefined : 360 }}
    >
      {src
        ? <img src={src} alt="" className="w-full h-auto block" />
        : <div className="min-h-[360px] lg:min-h-[400px]" />
      }
    </div>
  );
}

export function FeatureSplitSection() {
  return (
    <div className="relative z-10 w-full bg-black">

      {/* ── Row 1: Text LEFT  |  Card RIGHT ────────────────────── */}
      <div id="use-cases" className="max-w-[1200px] mx-auto px-5 pt-20 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

          {/* Text */}
          <div className="flex flex-col gap-5">
            <div>
              <OutlineBadge label="Live Quotes" />
            </div>
            <h2
              className="font-bold text-white leading-[1.14] tracking-tight"
              style={{ fontSize: "clamp(28px, 3.2vw, 40px)" }}
            >
              Price Work Before<br />Execution
            </h2>
            <p
              className="text-[16px] leading-relaxed max-w-[480px]"
              style={{ color: "#808080" }}
            >
              Estimate the true cost of every AI task before it runs, including
              model usage, tool calls, retries, and human fallback. Give agents
              a profitable quote upfront instead of relying on flat pricing or
              post-hoc billing.
            </p>
            <CtaButton />
          </div>

          {/* Card */}
          <ImageCard src="/frame162.png" />
        </div>
      </div>

      {/* ── Row 2: Card LEFT  |  Text RIGHT ────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-5 pt-12 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

          {/* Card — on mobile, push below text (order-2 → order-1 on lg) */}
          <div className="order-2 lg:order-1">
            <ImageCard src="/frame163.png" />
          </div>

          {/* Text */}
          <div className="flex flex-col gap-5 order-1 lg:order-2">
            <div>
              <NewOutlineBadge label="Profit Control" />
            </div>
            <h2
              className="font-bold text-white leading-[1.14] tracking-tight"
              style={{ fontSize: "clamp(28px, 3.2vw, 40px)" }}
            >
              Protect Margin<br />In Real Time
            </h2>
            <p
              className="text-[16px] leading-relaxed max-w-[480px]"
              style={{ color: "#808080" }}
            >
              Track execution spend as the workflow runs and catch cost spikes
              before they hurt your margins. Set budget limits, margin floors,
              and escalation rules so agents can stop, reroute, or ask for
              approval when a task starts going underwater.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
