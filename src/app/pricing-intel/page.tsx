import { HugeiconsIcon } from "@hugeicons/react";
import {
  PresentationBarChartIcon,
  AnalyticsUpIcon,
  ChartLineData01Icon,
  GlobalEditingIcon,
} from "@hugeicons/core-free-icons";

// Placeholder until Phase 2 ships the pricing intelligence layer.
// See ARCHITECTURE.md §9.2 — this feature needs a corpus of cross-tenant
// pricing data we don't have at hackathon scale.

const FEATURES = [
  {
    title: "Market price benchmarks",
    body: "Aggregate anonymized quote / settlement data across customers to surface per-category pricing distributions. p25 / p50 / p75 per task type.",
    icon: ChartLineData01Icon,
  },
  {
    title: "Margin guidance per workflow",
    body: "For each new quote, predict the most likely cost band based on similar past workflows. Highlight likely loss-makers before the customer signs.",
    icon: AnalyticsUpIcon,
  },
  {
    title: "Competitor pricing telemetry",
    body: "Voluntary tier where customers opt in to share aggregated competitor rate-card data and get access to the same in return.",
    icon: GlobalEditingIcon,
  },
];

export default function PricingIntelPage() {
  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-6">
      <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-6 py-8 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase"
            style={{ background: "rgba(48,100,255,0.1)", color: "#3064FF" }}
          >
            Phase 2
          </span>
          <span className="text-[#5a5a5a] text-[12px]">Out of MVP scope</span>
        </div>
        <div className="flex items-start gap-3">
          <HugeiconsIcon icon={PresentationBarChartIcon} size={24} color="#3064FF" strokeWidth={1.5} />
          <div>
            <h1 className="text-white text-[22px] font-semibold tracking-tight">
              Pricing Intelligence
            </h1>
            <p className="text-[#a3a3a3] text-[13px] mt-1 max-w-150">
              Cross-tenant pricing benchmarks + margin guidance. Requires a corpus of
              real customer pricing data we&apos;ll build up post-MVP. Hidden from the
              sidebar until then.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-5 py-4 flex flex-col gap-2"
          >
            <HugeiconsIcon icon={f.icon} size={16} color="#5a5a5a" strokeWidth={1.5} />
            <span className="text-white text-[14px] font-semibold mt-1">{f.title}</span>
            <p className="text-[#a3a3a3] text-[12px] leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>

      <p className="text-[#5a5a5a] text-[12px]">
        See <code className="font-mono text-[#a3a3a3]">ARCHITECTURE.md §9.2</code> for the
        full deferral list.
      </p>
    </div>
  );
}
