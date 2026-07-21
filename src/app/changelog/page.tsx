import { LandingNav } from "@/components/LandingNav";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Changelog — Interlock",
  description: "Product updates, new features, and improvements to Interlock.",
};

const RELEASES = [
  {
    version: "v1.4.2",
    date: "May 21, 2026",
    tag: "Patch",
    tagColor: "#808080",
    changes: [
      { type: "fix",  text: "Criteria evaluation trace now correctly records nested all_of / any_of results when inner criteria short-circuit." },
      { type: "fix",  text: "Walrus upload retry logic no longer silently drops the proof blob on transient network errors." },
      { type: "fix",  text: "Webhook signature verification correctly rejects replayed events older than 5 minutes." },
      { type: "perf", text: "Reduced median quote generation latency by 18% by caching product config lookups in-process." },
    ],
  },
  {
    version: "v1.4.0",
    date: "May 14, 2026",
    tag: "Minor",
    tagColor: "#3064FF",
    changes: [
      { type: "new",  text: "Hybrid pricing model now supports a configurable base fee cap — the base is charged up to a ceiling you define, preventing overcharging on low-cost workflows." },
      { type: "new",  text: "Workflow list endpoint now accepts cursor-based pagination via the after parameter. Previous page-based pagination remains supported but is deprecated." },
      { type: "new",  text: "Added dispute.resolved event type to webhooks. Includes resolution outcome (operator / customer / partial) and settlement adjustment amount." },
      { type: "new",  text: "Node.js SDK adds listAutoPaging() on workflows and quotes — transparently follows cursors across all pages." },
      { type: "fix",  text: "numeric_threshold criterion now correctly handles floating-point comparisons at boundaries (e.g. 0.9 >= 0.9 no longer fails due to float precision)." },
      { type: "fix",  text: "Dashboard margin waterfall no longer double-counts platform fee in the net margin calculation." },
    ],
  },
  {
    version: "v1.3.1",
    date: "Apr 30, 2026",
    tag: "Patch",
    tagColor: "#808080",
    changes: [
      { type: "fix",  text: "Fixed a race condition where concurrent workflow completions on the same customer account could produce duplicate settlement records." },
      { type: "fix",  text: "API key last-used timestamps now update correctly on test key requests." },
      { type: "fix",  text: "Customer margin sparklines in the dashboard now correctly reflect the trailing 4-week window rather than the trailing 30-day calendar window." },
    ],
  },
  {
    version: "v1.3.0",
    date: "Apr 22, 2026",
    tag: "Minor",
    tagColor: "#3064FF",
    changes: [
      { type: "new",  text: "Margin guardrails are now configurable per product — set a margin floor and a response action (alert, reroute, or pause) independently for each product ID in your account." },
      { type: "new",  text: "Python SDK released. Supports all workflow, quote, and webhook operations. Install with pip install interlock." },
      { type: "new",  text: "Added cost breakdown to the workflow.completed webhook payload. The billed.breakdown object now arrives in the event body, removing the need for a subsequent fetch call." },
      { type: "new",  text: "Real-time cost tracking now surfaces intermediate cost accumulation at 5-second intervals during long-running workflows. Access via the new workflows.stream() SDK method." },
      { type: "perf", text: "Avalanche transaction confirmation now uses parallel witness collection, reducing median settlement finality from 4.2s to 1.8s." },
      { type: "change", text: "The disputed workflow event is renamed from workflow.disputed to dispute.raised for consistency with dispute.resolved. The old name continues to fire but is deprecated and will be removed in v2.0." },
    ],
  },
  {
    version: "v1.2.0",
    date: "Apr 7, 2026",
    tag: "Minor",
    tagColor: "#3064FF",
    changes: [
      { type: "new",  text: "Success fee pricing model is now available. Configure a quoted amount that is only charged when success criteria are met. Previously only available in private beta." },
      { type: "new",  text: "json_schema criterion type added. Validate workflow outcomes against a full JSON Schema (Draft 7) definition." },
      { type: "new",  text: "Dispute window is now configurable per account. Default remains 1 hour in production. Enterprise accounts can request up to 72 hours." },
      { type: "fix",  text: "Workflow payloads larger than 64KB no longer silently truncate. Payloads up to 1MB are now supported." },
    ],
  },
  {
    version: "v1.1.0",
    date: "Mar 18, 2026",
    tag: "Minor",
    tagColor: "#3064FF",
    changes: [
      { type: "new",  text: "Capped pricing model is now generally available. Set a price ceiling with a markup percentage applied to actual cost." },
      { type: "new",  text: "Walrus blob retention is now configurable. Default remains 5 epochs; accounts can set up to 52 epochs (~1 year on mainnet) via account settings." },
      { type: "new",  text: "Webhook delivery history is now available in the dashboard with per-delivery status, latency, and response body." },
      { type: "new",  text: "Boolean composition criteria (all_of, any_of, not) now support arbitrary nesting depth." },
      { type: "fix",  text: "regex criterion no longer throws an uncaught exception on malformed patterns — it now evaluates as false with an error reason in the trace." },
    ],
  },
  {
    version: "v1.0.0",
    date: "Mar 1, 2026",
    tag: "Launch",
    tagColor: "#22c55e",
    changes: [
      { type: "new",  text: "General availability of Interlock on Avalanche Fuji. Fixed and hybrid pricing models available at launch." },
      { type: "new",  text: "Node.js SDK v1.0.0 released. Supports workflows.create(), workflows.fetch(), workflows.list(), and webhooks.construct()." },
      { type: "new",  text: "On-chain settlement via the Interlock Solidity contract. Every settled workflow produces a transaction record with ECDSA attestation." },
      { type: "new",  text: "Walrus-backed execution attestation. Outcome, trace, and proof blobs stored immutably per workflow." },
      { type: "new",  text: "Dashboard available with real-time margin tracking, customer profitability view, and developer settings." },
    ],
  },
];

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:    { label: "New",     color: "#3064FF", bg: "rgba(48,100,255,0.1)"  },
  fix:    { label: "Fix",     color: "#22c55e", bg: "rgba(34,197,94,0.1)"   },
  perf:   { label: "Perf",    color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  change: { label: "Changed", color: "#e0900a", bg: "rgba(224,144,10,0.1)"  },
};

export default function ChangelogPage() {
  return (
    <div className="min-h-full flex flex-col bg-black text-white">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30, 60, 180, 0.07) 0%, transparent 70%)",
        }}
      />

      <LandingNav />

      <div className="relative z-10 w-full flex-1 pt-32 pb-24 px-5">
        <div className="max-w-[720px] mx-auto">

          {/* Header */}
          <div className="mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>
              Product
            </span>
          </div>
          <h1 className="font-semibold tracking-tight" style={{ fontSize: "clamp(28px, 3.8vw, 42px)", lineHeight: 1.12 }}>
            Changelog
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed max-w-[520px]" style={{ color: "#808080" }}>
            New features, fixes, and improvements to Interlock. Subscribe to release
            notifications from Dashboard → Settings.
          </p>

          {/* Divider */}
          <div className="mt-8 mb-2" style={{ borderTop: "1px solid #1a1a1a" }} />

          {/* Releases */}
          <div className="flex flex-col gap-0">
            {RELEASES.map((release, i) => (
              <div
                key={release.version}
                className="flex flex-col gap-4 py-10"
                style={{ borderTop: i === 0 ? "none" : "1px solid #141414" }}
              >
                {/* Release header */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[15px] font-semibold text-white">{release.version}</span>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      color: release.tagColor,
                      background: `${release.tagColor}15`,
                      border: `1px solid ${release.tagColor}25`,
                    }}
                  >
                    {release.tag}
                  </span>
                  <span className="text-[12px]" style={{ color: "#5a5a5a" }}>{release.date}</span>
                </div>

                {/* Changes */}
                <div className="flex flex-col gap-3">
                  {release.changes.map((change, j) => {
                    const cfg = TYPE_CONFIG[change.type] || TYPE_CONFIG.new;
                    return (
                      <div key={j} className="flex gap-3 items-start">
                        <span
                          className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5"
                          style={{ background: cfg.bg, color: cfg.color, minWidth: 42, textAlign: "center" }}
                        >
                          {cfg.label}
                        </span>
                        <p className="text-[14px] leading-relaxed" style={{ color: "#808080" }}>
                          {change.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}
