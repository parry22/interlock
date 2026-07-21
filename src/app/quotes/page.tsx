"use client";

import { useState, useRef, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDownIcon, CopyIcon, SearchIcon,
  ArchiveIcon, DeleteIcon,
  FilterIcon, CalendarIcon,
  Edit01Icon, ListViewIcon,
} from "@hugeicons/core-free-icons";

// ─── All Quotes ──────────────────────────────────────────────────────────────

type QuoteStatus = "Active" | "Used" | "Expired";
type DateRange   = "Last 7 Days" | "Last 30 Days" | "Last 90 Days" | "All Time";

const quoteStatusConfig: Record<QuoteStatus, { bg: string; color: string }> = {
  Active:  { bg: "rgba(74, 222, 128, 0.1)",  color: "#4ade80" },
  Used:    { bg: "rgba(96, 165, 250, 0.1)",  color: "#60a5fa" },
  Expired: { bg: "rgba(107, 107, 107, 0.1)", color: "#6b6b6b" },
};

const ALL_QUOTE_STATUSES: Array<QuoteStatus | "All"> = ["All", "Active", "Used", "Expired"];
const DATE_RANGES: DateRange[] = ["Last 7 Days", "Last 30 Days", "Last 90 Days", "All Time"];

type Quote = { id: string; customer: string; amount: string; status: QuoteStatus; time: string };

type ApiQuote = {
  id: string;
  customer: string;
  price: number;
  status: QuoteStatus;
  createdAtMs: number;
};

function formatSuiAmt(base: number): string {
  if (!base) return "0 USDC";
  return `${(base / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC`;
}
function shortAddr(addr: string): string {
  if (!addr) return "";
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;
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
function toQuoteRow(q: ApiQuote): Quote {
  return {
    id: q.id,
    customer: shortAddr(q.customer),
    amount: formatSuiAmt(q.price),
    status: q.status,
    time: relTime(q.createdAtMs),
  };
}

function PillDropdown<T extends string>({
  value, options, onChange, renderValue, renderOption, mobileIcon,
}: {
  value: T; options: T[]; onChange: (v: T) => void;
  renderValue?: (v: T) => React.ReactNode;
  renderOption?: (v: T) => React.ReactNode;
  mobileIcon?: React.ComponentProps<typeof HugeiconsIcon>["icon"];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-2 border rounded-full text-[13px] transition-colors ${
          open ? "bg-[#1e1e1e] border-[#3a3a3a] text-[#d4d4d4]" : "bg-[#171718] border-[#1e1e1e] text-[#a3a3a3] hover:border-[#2a2a2a]"
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
        <HugeiconsIcon icon={ArrowDownIcon} size={12} color="#5a5a5a" strokeWidth={2} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 bg-[#1a1a1a] border border-[#272727] rounded-xl overflow-hidden shadow-2xl z-50 min-w-40">
          {options.map((opt) => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); }}
              className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-[13px] transition-colors ${
                opt === value ? "text-[#d4d4d4] bg-[#222222]" : "text-[#6b6b6b] hover:text-[#a3a3a3] hover:bg-[#1e1e1e]"
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

function ConfirmModal({ open, onClose, onConfirm, title, description, confirmLabel, danger }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; description: string; confirmLabel: string; danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-[#171718] border border-[#272727] rounded-2xl p-6 w-100 flex flex-col gap-4 shadow-2xl">
        <h2 className="text-[#d4d4d4] text-[15px] font-semibold">{title}</h2>
        <p className="text-[#6b6b6b] text-[13px] leading-relaxed">{description}</p>
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#272727] rounded-full text-[13px] text-[#a3a3a3] hover:text-[#d4d4d4] hover:border-[#4a4a4a] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={`px-4 py-2 rounded-full text-[13px] font-medium transition-colors ${
              danger
                ? "bg-[#ef4444] text-white hover:bg-[#dc2626]"
                : "bg-[#272727] text-[#d4d4d4] hover:bg-[#3a3a3a]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const Q_COLS = "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_64px] gap-x-4";

function AllQuotesTab() {
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "All">("All");
  const [dateRange, setDateRange]     = useState<DateRange>("Last 7 Days");
  const [archiveTarget, setArchiveTarget] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<number | null>(null);
  const [quotes, setQuotes]           = useState<Quote[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/sui/quotes", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as { quotes: ApiQuote[] };
        if (!cancelled) {
          setQuotes(json.quotes.map(toQuoteRow));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = quotes.filter((q) => {
    const qry = search.toLowerCase();
    const matchSearch = !qry || q.id.toLowerCase().includes(qry) || q.customer.toLowerCase().includes(qry);
    const matchStatus = statusFilter === "All" || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <>
      {/* Filter bar */}
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#171718] border border-[#1e1e1e] rounded-full hover:border-[#2a2a2a] transition-colors">
          <HugeiconsIcon icon={SearchIcon} size={13} color="#5a5a5a" strokeWidth={1.5} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="bg-transparent text-[13px] text-[#a3a3a3] placeholder:text-[#5a5a5a] outline-none w-20 md:w-36"
          />
        </div>
        <PillDropdown
          value={statusFilter}
          options={ALL_QUOTE_STATUSES}
          onChange={(v) => setStatusFilter(v as QuoteStatus | "All")}
          mobileIcon={FilterIcon}
          renderValue={(v) => (
            <span className="flex items-center gap-1.5">
              {v !== "All" && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: quoteStatusConfig[v as QuoteStatus]?.color }} />}
              {v === "All" ? "Status" : v}
            </span>
          )}
          renderOption={(v) => v === "All"
            ? <span className="text-[#a3a3a3]">All statuses</span>
            : <>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: quoteStatusConfig[v as QuoteStatus].color }} />
                <span>{v}</span>
              </>
          }
        />
        <PillDropdown value={dateRange} options={DATE_RANGES} onChange={(v) => setDateRange(v as DateRange)} mobileIcon={CalendarIcon} />
      </div>

      {/* Table */}
      <div className="relative flex flex-col flex-1 min-h-0 bg-[#171718] rounded-[20px] border border-[#1e1e1e] overflow-hidden">
        <div className="md:hidden absolute inset-y-0 right-0 w-10 z-10 pointer-events-none rounded-r-[20px]" style={{ background: "linear-gradient(to right, transparent, #171718)" }} />

        {/* Horizontal scroll wrapper */}
        <div className="flex-1 min-h-0 overflow-x-auto flex flex-col">
          <div className="min-w-130 flex flex-col flex-1 min-h-0">

            {/* Header */}
            <div className={`grid ${Q_COLS} px-6 py-4 shrink-0`}>
              {["Quote ID", "Customer", "Amount", "Status", "Time", ""].map((h, i) => (
                <span key={i} className="text-[#5a5a5a] text-[13px] font-medium">{h}</span>
              ))}
            </div>

            {/* Rows */}
            <div className="flex flex-col overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 border-t border-dashed border-[#272727]">
                  <span className="text-[#5a5a5a] text-[13px]">Loading from Avalanche Fuji…</span>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center py-16 border-t border-dashed border-[#272727]">
                  <span className="text-[#f87171] text-[13px]">Failed to load: {error}</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center py-16 border-t border-dashed border-[#272727]">
                  <span className="text-[#5a5a5a] text-[13px]">
                    {quotes.length === 0 ? "No quotes on chain yet" : "No quotes match your filters"}
                  </span>
                </div>
              ) : filtered.map((q, i) => {
                const { bg, color } = quoteStatusConfig[q.status];
                return (
                  <div key={i} className={`grid ${Q_COLS} items-center px-6 py-3.5 border-t border-dashed border-[#272727] shrink-0 hover:bg-[#1c1c1c] transition-colors`}>
                    <span className="text-[#5a5a5a] text-[13px] font-mono truncate">{q.id}</span>
                    <span className="text-[#d4d4d4] text-[14px] font-medium truncate">{q.customer}</span>
                    <span className="text-[#d4d4d4] text-[14px] font-medium">{q.amount}</span>
                    <div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium" style={{ background: bg, color }}>
                        {q.status}
                      </span>
                    </div>
                    <span className="text-[#5a5a5a] text-[13px]">{q.time}</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setArchiveTarget(i)} className="text-[#5a5a5a] hover:text-[#a3a3a3] transition-colors">
                        <HugeiconsIcon icon={ArchiveIcon} size={15} color="currentColor" strokeWidth={1.5} />
                      </button>
                      <button onClick={() => setDeleteTarget(i)} className="text-[#7a2020] hover:text-[#ef4444] transition-colors">
                        <HugeiconsIcon icon={DeleteIcon} size={15} color="currentColor" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 shrink-0 border-t border-dashed border-[#272727] flex items-center justify-between">
          <span className="text-[#5a5a5a] text-[13px] font-medium">{filtered.length} of {quotes.length} Quotes</span>
          <span className="md:hidden text-[#3a3a3a] text-[11px] font-medium">swipe →</span>
        </div>
      </div>

      {/* Modals */}
      <ConfirmModal
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => {}}
        title="Archive this quote?"
        description="This quote will be moved to the archive. You can restore it at any time from the archived quotes view."
        confirmLabel="Archive"
      />
      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {}}
        title="Delete this quote?"
        description="This action is permanent and cannot be undone. The quote and all associated data will be removed completely."
        confirmLabel="Delete"
        danger
      />
    </>
  );
}

// ─── Quote Builder ────────────────────────────────────────────────────────────

type PricingModel = "fixed" | "capped" | "success-fee" | "hybrid";

const MODELS: { id: PricingModel; label: string; subtext: string }[] = [
  { id: "fixed",       label: "Fixed",       subtext: "Set price at any cost" },
  { id: "capped",      label: "Capped",      subtext: "Price ceiling, shared risk" },
  { id: "success-fee", label: "Success Fee", subtext: "Pay on outcome only" },
  { id: "hybrid",      label: "Hybrid",      subtext: "Base plus outcome bonus" },
];

function ModelDropdown({ value, onChange }: { value: PricingModel; onChange: (v: PricingModel) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = MODELS.find((m) => m.id === value)!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between w-full px-4 py-3 bg-transparent border rounded-xl text-[14px] transition-colors ${
          open ? "border-[#3a3a3a]" : "border-[#272727] hover:border-[#3a3a3a]"
        }`}
      >
        <span>
          <span className="text-[#d4d4d4] font-semibold">{current.label}</span>
          <span className="text-[#5a5a5a]"> – {current.subtext}</span>
        </span>
        <HugeiconsIcon
          icon={ArrowDownIcon}
          size={13}
          color="#5a5a5a"
          strokeWidth={2}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#1a1a1a] border border-[#272727] rounded-xl overflow-hidden shadow-2xl z-50">
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              className={`flex items-center justify-between w-full px-4 py-3 text-left text-[14px] transition-colors ${
                m.id === value ? "bg-[#222222]" : "hover:bg-[#1e1e1e]"
              }`}
            >
              <span>
                <span className={`font-semibold ${m.id === value ? "text-[#d4d4d4]" : "text-[#a3a3a3]"}`}>
                  {m.label}
                </span>
                <span className="text-[#5a5a5a]"> – {m.subtext}</span>
              </span>
              {m.id === value && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#3064FF] shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    // execCommand is synchronous and works in iframes without special permissions
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    // Async clipboard API as fallback if execCommand unavailable
    if (!ok) navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={copy}
      className={`transition-colors ${copied ? "text-[#3064FF]" : "text-[#5a5a5a] hover:text-[#a3a3a3]"}`}
    >
      <HugeiconsIcon icon={CopyIcon} size={15} color="currentColor" strokeWidth={1.5} />
    </button>
  );
}

const INPUT_BASE =
  "px-4 py-3 bg-transparent border border-[#272727] rounded-xl text-[14px] text-[#d4d4d4] placeholder:text-[#3a3a3a] outline-none hover:border-[#3a3a3a] focus:border-[#4a4a4a] transition-colors";

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[#a3a3a3] text-[13px] font-medium">{children}</label>;
}

export default function QuotesPage() {
  const [tab, setTab]                   = useState<"builder" | "all">("builder");
  const [model, setModel]               = useState<PricingModel>("fixed");
  const [customerName, setCustomerName] = useState("");
  const [price, setPrice]               = useState("0.5");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [conditions, setConditions]     = useState("");

  const jsonPreview = JSON.stringify(
    {
      id:              "qt_a1b2c3",
      version:         4,
      customerId:      "cus_p1q2r3",
      customerName:    customerName || "Beacon Health",
      model:           model,
      amount:          parseFloat(price) || 0,
      status:          "draft",
      successCriteria: successCriteria || "Patient summary accuracy >= 95%",
      expiry:          "2027-09-19T00:00:00Z",
      conditions:      conditions || "Minimum 500 records processed. SLA: 99.5% uptime during execution window. Dispute window: 48h post-settlement.",
      createdAt:       "2026-05-15T22:00:49.363Z",
    },
    null,
    2,
  );

  const sdkSnippet = `import { Clearinghouse } from "@clearinghouse/sdk"

const ch = new Clearinghouse({ apiKey: process.env.CH_API_KEY })

const workflow = await ch.workflows.create({
  quoteId: "qt_a1b2c3",
  customerId: "cus_p1q2r3",
  model: "${model}",
  maxAmount: ${parseFloat(price) || 0},
  successCriteria: "${successCriteria || "Patient summary accuracy >= 95%"}",
})

console.log(workflow.id) // wf_xxxxxxxx`;

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 gap-5">

      {/* Tab navigation */}
      <div className="flex items-center gap-6 shrink-0">
        {([
          { key: "builder" as const, label: "Quote Editor", icon: Edit01Icon   },
          { key: "all"     as const, label: "All Quotes",   icon: ListViewIcon },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 text-[14px] font-semibold transition-colors ${
              tab === t.key ? "text-white" : "text-[#5a5a5a] hover:text-[#a3a3a3]"
            }`}
          >
            <HugeiconsIcon icon={t.icon} size={13} color="currentColor" strokeWidth={1.5} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "all" ? (
        <div className="flex flex-col flex-1 min-h-0 gap-4">
          <AllQuotesTab />
        </div>
      ) : (
        <div className="flex flex-col xl:flex-row flex-1 min-h-0 gap-6 xl:gap-8">

          {/* ── Left: form ── */}
          <div className="xl:flex-5 flex flex-col gap-5 overflow-y-auto min-h-0">

            <div className="flex flex-col gap-2">
              <Label>Pricing Model</Label>
              <ModelDropdown value={model} onChange={setModel} />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Your Customer Name</Label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Acme Enterprises"
                className={INPUT_BASE}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Workflow Pricing</Label>
              <div className="flex items-center gap-3 px-4 py-3 bg-transparent border border-[#272727] rounded-xl hover:border-[#3a3a3a] focus-within:border-[#4a4a4a] transition-colors">
                <span className="text-[#5a5a5a] text-[14px] shrink-0">$</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="flex-1 bg-transparent text-[14px] text-[#d4d4d4] outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Success Criteria</Label>
              <textarea
                value={successCriteria}
                onChange={(e) => setSuccessCriteria(e.target.value)}
                placeholder="Given outcome should have 95% success criteria"
                rows={3}
                className={`${INPUT_BASE} resize-y`}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Conditions</Label>
              <textarea
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="Minimum 500 records processed. SLA: 99.5% uptime during execution window. Dispute window: 48h post-settlement."
                rows={3}
                className={`${INPUT_BASE} resize-y`}
              />
            </div>

            <div className="pt-1">
              <button className="px-5 py-2.5 bg-white text-[#0a0a0a] text-[14px] font-semibold rounded-full hover:bg-[#e8e8e8] active:bg-[#d4d4d4] transition-colors">
                Publish Quote
              </button>
            </div>
          </div>

          {/* ── Right: preview panels ── */}
          <div className="xl:flex-6 hidden xl:flex flex-col gap-4 min-h-0 overflow-y-auto">

            {/* Live Preview Code */}
            <div className="shrink-0 bg-[#171718] rounded-[20px] border border-[#1e1e1e] p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[#a3a3a3] text-[13px] font-medium">Live Preview Code</span>
                <CopyButton text={jsonPreview} />
              </div>
              <div className="bg-[#0f0f0f] rounded-xl p-4 max-h-60 overflow-auto">
                <pre className="text-[12px] font-mono text-[#a3a3a3] leading-relaxed whitespace-pre">
                  {jsonPreview}
                </pre>
              </div>
            </div>

            {/* SDK Snippet */}
            <div className="shrink-0 bg-[#171718] rounded-[20px] border border-[#1e1e1e] p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[#a3a3a3] text-[13px] font-medium">SDK Snippet</span>
                <CopyButton text={sdkSnippet} />
              </div>
              <div className="bg-[#0f0f0f] rounded-xl p-4 max-h-60 overflow-auto">
                <pre className="text-[12px] font-mono text-[#a3a3a3] leading-relaxed whitespace-pre">
                  {sdkSnippet}
                </pre>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
