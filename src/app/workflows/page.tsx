"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SearchIcon,
  ArrowDownIcon,
  EyeIcon,
  CopyIcon,
  RefreshIcon,
  AlertDiamondIcon,
  FilterIcon,
  CalendarIcon,
  PlayCircleIcon,
} from "@hugeicons/core-free-icons";
import { LifecycleDemoDrawer } from "@/components/LifecycleDemoDrawer";
import { CreateWorkflowDrawer, type CreateWorkflowPrefill } from "@/components/CreateWorkflowDrawer";
import { DisputeModal } from "@/components/DisputeModal";

type Status = "Settled" | "Executing" | "Verified" | "Quoted" | "Disputed" | "Refunded";
type DateRange = "Last 7 Days" | "Last 30 Days" | "Last 90 Days" | "All Time";

type Workflow = {
  id: string;
  customer: string;
  priceQuoted: string;
  costBilled: string;
  margin: string;
  positive: boolean;
  status: Status;
  time: string;
};

const statusConfig: Record<Status, { bg: string; color: string }> = {
  Settled:   { bg: "rgba(74,  222, 128, 0.1)", color: "#4ade80" },
  Verified:  { bg: "rgba(96,  165, 250, 0.1)", color: "#60a5fa" },
  Executing: { bg: "rgba(245, 158,  11, 0.1)", color: "#f59e0b" },
  Quoted:    { bg: "rgba(34,  211, 238, 0.1)", color: "#22d3ee" },
  Disputed:  { bg: "rgba(248, 113, 113, 0.1)", color: "#f87171" },
  Refunded:  { bg: "rgba(107, 107, 107, 0.1)", color: "#6b6b6b" },
};

const ALL_STATUSES: Array<Status | "All"> = [
  "All", "Settled", "Verified", "Executing", "Quoted", "Disputed", "Refunded",
];

const DATE_RANGES: DateRange[] = [
  "Last 7 Days", "Last 30 Days", "Last 90 Days", "All Time",
];

/** Shape returned by /api/sui/workflows. Mirrors WorkflowSummary in queries.ts. */
type ApiWorkflow = {
  id: string;
  customer: string;
  status: Status;
  statusEnum: number;
  totalRevenue: number;
  totalCost: number;
  margin: number;
  escrowBalance: number;
  updatedAtMs: number;
};

function formatSuiAmount(baseUnits: number): string {
  if (!baseUnits) return "0 USDC";
  return `${(baseUnits / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC`;
}

function relTime(ts: number): string {
  if (!ts) return "—";
  const d = Date.now() - ts;
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  return `${Math.floor(h / 24)} day(s) ago`;
}

function toRow(w: ApiWorkflow): Workflow {
  const inFlight = w.statusEnum !== 3 && w.statusEnum !== 5;
  const priceQuoted = inFlight ? formatSuiAmount(w.escrowBalance) : formatSuiAmount(w.totalRevenue);
  const costBilled = w.statusEnum === 3 ? formatSuiAmount(w.totalCost) : "—";
  let marginStr = "—";
  let positive = false;
  if (w.statusEnum === 3 && w.totalRevenue > 0) {
    const pct = (w.margin / w.totalRevenue) * 100;
    positive = pct >= 0;
    marginStr = `${positive ? "+" : ""}${pct.toFixed(1)}%`;
  }
  return {
    id: w.id,
    customer: w.customer,
    priceQuoted,
    costBilled,
    margin: marginStr,
    positive,
    status: w.status,
    time: relTime(w.updatedAtMs),
  };
}

/* Fixed-position tooltip — escapes any overflow:hidden ancestor */
function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <div
        className="relative"
        onMouseEnter={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setCoords({ x: r.left + r.width / 2, y: r.top });
        }}
        onMouseLeave={() => setCoords(null)}
      >
        {children}
      </div>
      {coords && (
        <div
          className="pointer-events-none fixed z-9999 -translate-x-1/2 -translate-y-full px-2 py-1 bg-[#1e1e1e] border border-[#2a2a2a] rounded-md text-[11px] text-[#a3a3a3] whitespace-nowrap"
          style={{ left: coords.x, top: coords.y - 8 }}
        >
          {label}
        </div>
      )}
    </>
  );
}

/* Reusable pill dropdown */
function PillDropdown<T extends string>({
  value,
  options,
  onChange,
  renderOption,
  renderValue,
  mobileIcon,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  renderOption?: (v: T) => React.ReactNode;
  renderValue?: (v: T) => React.ReactNode;
  mobileIcon?: React.ComponentProps<typeof HugeiconsIcon>["icon"];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-2 border rounded-full text-[13px] transition-colors ${
          open
            ? "bg-[#1e1e1e] border-[#3a3a3a] text-[#d4d4d4]"
            : "bg-[#171718] border-[#1e1e1e] text-[#a3a3a3] hover:border-[#2a2a2a]"
        }`}
      >
        {mobileIcon ? (
          <>
            <span className="md:hidden"><HugeiconsIcon icon={mobileIcon} size={13} color="currentColor" strokeWidth={1.5} /></span>
            <span className="hidden md:inline-flex items-center gap-1.5">{renderValue ? renderValue(value) : value}</span>
          </>
        ) : (
          renderValue ? renderValue(value) : value
        )}
        <HugeiconsIcon
          icon={ArrowDownIcon}
          size={12}
          color="#5a5a5a"
          strokeWidth={2}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 bg-[#1a1a1a] border border-[#272727] rounded-xl overflow-hidden shadow-2xl z-50 min-w-40">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-[13px] transition-colors ${
                opt === value
                  ? "text-[#d4d4d4] bg-[#222222]"
                  : "text-[#6b6b6b] hover:text-[#a3a3a3] hover:bg-[#1e1e1e]"
              }`}
            >
              {renderOption ? renderOption(opt) : opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const COLS = "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_112px] gap-x-4";

export default function WorkflowsPage() {
  const router = useRouter();
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "All">("All");
  const [dateRange, setDateRange]     = useState<DateRange>("Last 7 Days");
  const [workflows, setWorkflows]     = useState<Workflow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [demoOpen, setDemoOpen]       = useState(false);
  const [demoMode, setDemoMode]       = useState<"success" | "failure">("success");
  const [createOpen, setCreateOpen]   = useState(false);
  const [retryPrefill, setRetryPrefill] = useState<CreateWorkflowPrefill | null>(null);
  const [disputeFor, setDisputeFor]   = useState<{ workflowId: string; outcomeId: string } | null>(null);
  const [rowBusy, setRowBusy]         = useState<string | null>(null); // id of row currently fetching

  // Click handlers — wired below in the table rows.
  async function handleRetry(id: string): Promise<void> {
    setRowBusy(id);
    try {
      const r = await fetch(`/api/sui/workflow/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { workflow } = (await r.json()) as {
        workflow: { quote: { price: number; successCriteria: string } | null };
      };
      if (!workflow.quote) throw new Error("workflow has no quote — cannot retry");
      let criteriaTemplate: unknown = {};
      try {
        criteriaTemplate = JSON.parse(workflow.quote.successCriteria) as unknown;
      } catch {
        criteriaTemplate = {};
      }
      setRetryPrefill({
        agentId: 0, // retry isn't tied to a marketplace agent
        agentName: `Retry of ${id.slice(0, 8)}…${id.slice(-4)}`,
        priceBaseUnits: workflow.quote.price,
        criteriaTemplate,
      });
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(`Retry failed: ${(e as Error).message}`);
    } finally {
      setRowBusy(null);
    }
  }

  async function handleDispute(id: string): Promise<void> {
    setRowBusy(id);
    try {
      const r = await fetch(`/api/sui/workflow/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { workflow } = (await r.json()) as { workflow: { outcome: { id: string } | null } };
      if (!workflow.outcome?.id) {
        throw new Error("dispute requires an Outcome on chain — try again after verifier finishes");
      }
      setDisputeFor({ workflowId: id, outcomeId: workflow.outcome.id });
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(`Dispute failed: ${(e as Error).message}`);
    } finally {
      setRowBusy(null);
    }
  }

  const fetchWorkflows = async () => {
    try {
      const r = await fetch("/api/sui/workflows", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as { workflows: ApiWorkflow[] };
      setWorkflows(json.workflows.map(toRow));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await fetchWorkflows();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when the demo drawer closes — there may be a new workflow on chain.
  useEffect(() => {
    if (!demoOpen) fetchWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoOpen]);

  const filtered = workflows.filter((w) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || w.id.toLowerCase().includes(q) || w.customer.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "All" || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 gap-4">

      {/* Filter bar */}
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#171718] border border-[#1e1e1e] rounded-full hover:border-[#2a2a2a] transition-colors">
          <HugeiconsIcon icon={SearchIcon} size={13} color="#5a5a5a" strokeWidth={1.5} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="bg-transparent text-[13px] text-[#a3a3a3] placeholder:text-[#5a5a5a] outline-none w-20 md:w-36"
          />
        </div>

        {/* Status filter */}
        <PillDropdown
          value={statusFilter}
          options={ALL_STATUSES}
          onChange={(v) => setStatusFilter(v as Status | "All")}
          mobileIcon={FilterIcon}
          renderValue={(v) => (
            <span className="flex items-center gap-1.5">
              {v !== "All" && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: statusConfig[v as Status]?.color }}
                />
              )}
              {v === "All" ? "Status" : v}
            </span>
          )}
          renderOption={(v) => (
            <>
              {v === "All" ? (
                <span className="text-[#a3a3a3]">All statuses</span>
              ) : (
                <>
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: statusConfig[v as Status].color }}
                  />
                  <span>{v}</span>
                </>
              )}
            </>
          )}
        />

        {/* Date range filter */}
        <PillDropdown
          value={dateRange}
          options={DATE_RANGES}
          onChange={(v) => setDateRange(v as DateRange)}
          mobileIcon={CalendarIcon}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Create your own */}
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] text-white transition-colors"
        >
          <HugeiconsIcon icon={PlayCircleIcon} size={14} color="currentColor" strokeWidth={1.5} />
          + Create workflow
        </button>

        {/* Run demo */}
        <button
          onClick={() => {
            setDemoMode("success");
            setDemoOpen(true);
          }}
          className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white transition-colors"
        >
          Run demo workflow
        </button>
        <button
          onClick={() => {
            setDemoMode("failure");
            setDemoOpen(true);
          }}
          className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white transition-colors"
        >
          Run failure case
        </button>

      </div>

      <LifecycleDemoDrawer
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        outcomeMode={demoMode}
      />

      <CreateWorkflowDrawer open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Retry — re-run the same quote terms */}
      <CreateWorkflowDrawer
        open={retryPrefill !== null}
        onClose={() => setRetryPrefill(null)}
        prefill={retryPrefill ?? undefined}
      />

      {/* Raise dispute */}
      {disputeFor && (
        <DisputeModal
          workflowId={disputeFor.workflowId}
          outcomeId={disputeFor.outcomeId}
          onClose={() => setDisputeFor(null)}
          onFiled={() => {
            setDisputeFor(null);
            void fetchWorkflows();
          }}
        />
      )}

      {/* Table card */}
      <div className="relative flex flex-col flex-1 min-h-0 bg-[#171718] rounded-[20px] border border-[#1e1e1e] overflow-hidden">
        <div className="md:hidden absolute inset-y-0 right-0 w-10 z-10 pointer-events-none rounded-r-[20px]" style={{ background: "linear-gradient(to right, transparent, #171718)" }} />

        {/* Horizontal scroll wrapper */}
        <div className="flex-1 min-h-0 overflow-x-auto flex flex-col">
          <div className="min-w-180 flex flex-col flex-1 min-h-0">

            {/* Column headers */}
            <div className={`grid ${COLS} px-6 py-4 shrink-0`}>
              {["Workflow ID", "Customer", "Price Quoted", "Cost Billed", "Margin", "Status", "Time", ""].map((h, i) => (
                <span key={i} className="text-[#5a5a5a] text-[13px] font-medium">{h}</span>
              ))}
            </div>

            {/* Rows */}
            <div className="flex flex-col overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex flex-1 items-center justify-center py-16 border-t border-dashed border-[#272727]">
                  <span className="text-[#5a5a5a] text-[13px]">Loading from Avalanche Fuji…</span>
                </div>
              ) : error ? (
                <div className="flex flex-1 items-center justify-center py-16 border-t border-dashed border-[#272727]">
                  <span className="text-[#f87171] text-[13px]">Failed to load: {error}</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-1 items-center justify-center py-16 border-t border-dashed border-[#272727]">
                  <span className="text-[#5a5a5a] text-[13px]">
                    {workflows.length === 0
                      ? "No workflows yet — run `npm run lifecycle` to create one"
                      : "No workflows match your filters"}
                  </span>
                </div>
              ) : (
                filtered.map((w, i) => {
                  const { bg, color } = statusConfig[w.status];
                  return (
                    <div
                      key={i}
                      onClick={() => router.push(`/workflows/${w.id}`)}
                      className={`grid ${COLS} items-center px-6 py-3.5 border-t border-dashed border-[#272727] shrink-0 cursor-pointer hover:bg-[#1c1c1c] transition-colors`}
                    >
                      <Tooltip label="Click to copy">
                        <button
                          onClick={() => navigator.clipboard.writeText(w.id)}
                          className="text-[#5a5a5a] text-[13px] font-mono truncate hover:text-[#a3a3a3] transition-colors text-left w-full"
                        >
                          {w.id}
                        </button>
                      </Tooltip>

                      <span className="text-[#d4d4d4] text-[14px] font-medium truncate">{w.customer}</span>
                      <span className="text-[#d4d4d4] text-[14px] font-medium">{w.priceQuoted}</span>
                      <span className="text-[#d4d4d4] text-[14px] font-medium">{w.costBilled}</span>
                      <span className="text-[14px] font-medium" style={{ color: w.positive ? "#4ade80" : "#f87171" }}>
                        {w.margin}
                      </span>

                      <div>
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium"
                          style={{ background: bg, color }}
                        >
                          {w.status}
                        </span>
                      </div>

                      <span className="text-[#5a5a5a] text-[13px]">{w.time}</span>

                      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <Tooltip label="View workflow">
                          <button
                            onClick={() => router.push(`/workflows/${w.id}`)}
                            disabled={rowBusy === w.id}
                            className="text-[#6b6b6b] hover:text-[#a3a3a3] disabled:opacity-30 transition-colors"
                          >
                            <HugeiconsIcon icon={EyeIcon} size={15} color="currentColor" strokeWidth={1.5} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Copy ID">
                          <button
                            onClick={() => navigator.clipboard.writeText(w.id)}
                            disabled={rowBusy === w.id}
                            className="text-[#6b6b6b] hover:text-[#a3a3a3] disabled:opacity-30 transition-colors"
                          >
                            <HugeiconsIcon icon={CopyIcon} size={15} color="currentColor" strokeWidth={1.5} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Retry workflow (re-run with same quote)">
                          <button
                            onClick={() => handleRetry(w.id)}
                            disabled={rowBusy === w.id}
                            className="text-[#9b3a3a] hover:text-[#f87171] disabled:opacity-30 transition-colors"
                          >
                            <HugeiconsIcon icon={RefreshIcon} size={15} color="currentColor" strokeWidth={1.5} />
                          </button>
                        </Tooltip>
                        <Tooltip label={w.status === "Verified" ? "Raise dispute" : "Dispute only available while Verified"}>
                          <button
                            onClick={() => handleDispute(w.id)}
                            disabled={rowBusy === w.id || w.status !== "Verified"}
                            className="text-[#9b3a3a] hover:text-[#f87171] disabled:opacity-30 transition-colors"
                          >
                            <HugeiconsIcon icon={AlertDiamondIcon} size={15} color="currentColor" strokeWidth={1.5} />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 shrink-0 border-t border-dashed border-[#272727] flex items-center justify-between">
          <span className="text-[#5a5a5a] text-[13px] font-medium">
            {filtered.length} of {workflows.length} Workflows
          </span>
          <span className="md:hidden text-[#3a3a3a] text-[11px] font-medium">swipe →</span>
        </div>
      </div>

    </div>
  );
}
