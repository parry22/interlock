"use client";

import { useEffect, useState, use } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CopyIcon,
  LegalDocumentIcon,
  WorkflowCircleIcon,
  FileSearchIcon,
  CheckmarkCircleIcon,
  AlertDiamondIcon,
  Payment01Icon,
  CloudDownloadIcon,
} from "@hugeicons/core-free-icons";
import { WalrusBlobViewer, type BlobMeta } from "@/components/WalrusBlobViewer";
import { DisputeModal } from "@/components/DisputeModal";

// ─── Types — mirror queries.ts WorkflowDetail ────────────────────────────────

type Status =
  | "Quoted"
  | "Executing"
  | "Verified"
  | "Settled"
  | "Disputed"
  | "Refunded";

type WorkflowDetail = {
  id: string;
  customer: string;
  productId: string;
  status: Status;
  statusEnum: number;
  totalRevenue: number;
  totalCost: number;
  margin: number;
  escrowBalance: number;
  createdAtMs: number;
  updatedAtMs: number;
  quote: {
    id: string;
    price: number;
    pricingModel: number;
    successCriteria: string;
    successCriteriaHashHex: string;
    expiresAtMs: number;
    createdAtMs: number;
  } | null;
  execution: {
    id: string;
    startedAtMs: number;
    completedAtMs: number;
    traceBlobId: string;
    totalCost: number;
    costItems: Array<{
      provider: string;
      category: number;
      units: number;
      amount: number;
    }>;
  } | null;
  outcome: {
    id: string;
    success: boolean;
    artifactBlobId: string;
    proofBlobId: string;
    verifiedAtMs: number;
    disputeWindowEndsMs: number;
  } | null;
  settlement: {
    id: string;
    totalSettled: number;
    platformFee: number;
    settledAtMs: number;
    splits: Array<{ recipient: string; amount: number; role: number }>;
  } | null;
};

const STATUS_COLOR: Record<Status, { bg: string; color: string }> = {
  Quoted:    { bg: "rgba(34,  211, 238, 0.1)", color: "#22d3ee" },
  Executing: { bg: "rgba(245, 158,  11, 0.1)", color: "#f59e0b" },
  Verified:  { bg: "rgba(96,  165, 250, 0.1)", color: "#60a5fa" },
  Settled:   { bg: "rgba(74,  222, 128, 0.1)", color: "#4ade80" },
  Disputed:  { bg: "rgba(248, 113, 113, 0.1)", color: "#f87171" },
  Refunded:  { bg: "rgba(107, 107, 107, 0.1)", color: "#6b6b6b" },
};

const CATEGORY_NAME = ["model", "tool", "human", "compute"];
const ROLE_NAME = ["agent company", "model provider", "tool", "human", "platform"];

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatSui(base: number): string {
  if (!base) return "0 USDC";
  return `${(base / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`;
}

function shorten(addr: string, head = 8, tail = 4): string {
  if (!addr) return "—";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function dt(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

// ─── UI Primitives ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  const c = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium"
      style={{ background: c.bg, color: c.color }}
    >
      {status}
    </span>
  );
}

function BlobChip({
  blobId,
  label,
  onOpen,
}: {
  blobId: string;
  label: string;
  onOpen: (meta: BlobMeta) => void;
}) {
  return (
    <button
      onClick={() =>
        onOpen({
          blobId,
          label,
          description: `Stored on Walrus testnet. Click to fetch the bytes via aggregator.`,
        })
      }
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#111] border border-[#272727] hover:border-[#3064FF] transition-colors text-left max-w-full"
    >
      <HugeiconsIcon icon={CloudDownloadIcon} size={11} color="#60a5fa" strokeWidth={1.5} />
      <span className="text-[11px] font-mono text-[#a3a3a3] truncate">{blobId}</span>
    </button>
  );
}

function CopyAddr({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className={`inline-flex items-center gap-1.5 text-left transition-colors hover:text-[#a3a3a3] ${mono ? "font-mono" : ""}`}
      style={{ color: "#d4d4d4" }}
    >
      <span className="text-[13px]">{shorten(value)}</span>
      <HugeiconsIcon
        icon={CopyIcon}
        size={11}
        color={copied ? "#4ade80" : "#5a5a5a"}
        strokeWidth={1.5}
      />
    </button>
  );
}

type StageCardProps = {
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  title: string;
  ts: number;
  done: boolean;
  rows: Array<{ k: string; v: React.ReactNode; mono?: boolean }>;
  accent?: string;
};

function StageCard({ icon, title, ts, done, rows, accent }: StageCardProps) {
  return (
    <div
      className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-5 py-4 flex flex-col gap-3"
      style={accent ? { borderColor: accent } : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={icon}
            size={14}
            color={done ? accent ?? "#4ade80" : "#5a5a5a"}
            strokeWidth={1.5}
          />
          <span className="text-[14px] font-semibold text-white">{title}</span>
        </div>
        <span className="text-[12px] text-[#5a5a5a]">{ts ? dt(ts) : "pending"}</span>
      </div>
      <div className="flex flex-col gap-2 pt-1">
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[140px_1fr] text-[13px] gap-3 items-start"
          >
            <span className="text-[#5a5a5a]">{r.k}</span>
            <span className={`text-[#d4d4d4] wrap-break-word ${r.mono ? "font-mono" : ""}`}>{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16 — params is a Promise.
  const { id } = use(params);
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [blob, setBlob] = useState<BlobMeta | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const fetchDetail = async () => {
    try {
      const r = await fetch(`/api/sui/workflow/${id}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as { workflow: WorkflowDetail };
      setWf(json.workflow);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  async function resolveDispute(refundCustomer: boolean) {
    setResolving(true);
    setResolveError(null);
    try {
      const r = await fetch("/api/sui/resolve-dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: id, refundCustomer }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      await fetchDetail();
    } catch (e) {
      setResolveError((e as Error).message);
    } finally {
      setResolving(false);
    }
  }

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Check admin status once, so we only show resolve controls to the admin.
  useEffect(() => {
    fetch("/api/sui/resolve-dispute", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { isAdmin?: boolean }) => setIsAdmin(Boolean(j.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#5a5a5a] text-[14px]">
        Loading from Avalanche Fuji…
      </div>
    );
  }
  if (err || !wf) {
    return (
      <div className="flex items-center justify-center h-full text-[#f87171] text-[14px]">
        {err ?? "Workflow not found"}
      </div>
    );
  }

  const explorerUrl = (objId: string) =>
    `https://testnet.snowtrace.io/address/${objId}`;

  // ─── Header card ───────────────────────────────────────────────────────────

  const margin =
    wf.statusEnum === 3 && wf.totalRevenue > 0
      ? `${((wf.margin / wf.totalRevenue) * 100).toFixed(1)}%`
      : "—";

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-4">
      {/* ─── Header ─── */}
      <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[16px] font-semibold text-white">Workflow</span>
            <CopyAddr value={wf.id} />
            <StatusBadge status={wf.status} />
          </div>
          <div className="flex items-center gap-3">
            {wf.status === "Verified" &&
              wf.outcome &&
              wf.outcome.disputeWindowEndsMs > Date.now() && (
                <button
                  onClick={() => setDisputeOpen(true)}
                  className="text-[12px] px-3 py-1.5 rounded-full bg-[#3a1818] border border-[#dc2626] text-[#f87171] hover:text-white hover:bg-[#dc2626] transition-colors flex items-center gap-1.5"
                >
                  <HugeiconsIcon icon={AlertDiamondIcon} size={11} color="currentColor" strokeWidth={1.5} />
                  File dispute
                </button>
              )}
            <a
              href={explorerUrl(wf.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-[#60a5fa] hover:text-[#93c5fd] transition-colors"
            >
              Open on Snowtrace ↗
            </a>
          </div>
        </div>

        {/* Dispute resolution — admin only, when a dispute is open */}
        {wf.status === "Disputed" && isAdmin && (
          <div className="mt-4 rounded-xl border border-[#dc2626] bg-[#1a0f0f] px-4 py-3 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={AlertDiamondIcon} size={13} color="#f87171" strokeWidth={1.5} />
              <span className="text-[13px] font-semibold text-white">Resolve this dispute</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#3a1818] text-[#f87171] font-semibold">Admin</span>
            </div>
            <p className="text-[11px] text-[#a3a3a3]">
              The escrow is frozen until you decide. Refund the customer, or dismiss the dispute so settlement can proceed.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => resolveDispute(true)}
                disabled={resolving}
                className="text-[12px] px-3 py-1.5 rounded-full bg-[#3064FF] hover:bg-[#2050d0] disabled:opacity-50 text-white font-medium transition-colors"
              >
                {resolving ? "Working…" : "Refund the customer"}
              </button>
              <button
                onClick={() => resolveDispute(false)}
                disabled={resolving}
                className="text-[12px] px-3 py-1.5 rounded-full bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white disabled:opacity-50 transition-colors"
              >
                Dismiss dispute
              </button>
            </div>
            {resolveError && <span className="text-[11px] text-[#f87171]">{resolveError}</span>}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          {[
            {
              label: "Price",
              value: formatSui(wf.quote?.price ?? 0),
            },
            {
              label: "Escrow balance",
              value: formatSui(wf.escrowBalance),
            },
            {
              label: "Settled total",
              value: wf.statusEnum === 3 ? formatSui(wf.totalRevenue) : "—",
            },
            {
              label: "Margin",
              value: margin,
            },
          ].map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <span className="text-[11px] text-[#5a5a5a]">{s.label}</span>
              <span className="text-[14px] font-semibold text-white">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Lifecycle stages ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quote */}
        <StageCard
          icon={LegalDocumentIcon}
          title="Stage 1 — Quote"
          ts={wf.quote?.createdAtMs ?? 0}
          done={wf.quote !== null}
          rows={[
            { k: "Quote object", v: wf.quote ? <CopyAddr value={wf.quote.id} /> : "—" },
            {
              k: "Committed price",
              v: wf.quote ? formatSui(wf.quote.price) : "—",
              mono: false,
            },
            {
              k: "Pricing model",
              v: wf.quote
                ? ["fixed", "capped", "success_fee", "hybrid"][wf.quote.pricingModel] ?? "?"
                : "—",
            },
            {
              k: "Criteria hash",
              v: wf.quote ? (
                <span className="font-mono text-[12px]">
                  {wf.quote.successCriteriaHashHex.slice(0, 16)}…
                </span>
              ) : "—",
            },
            {
              k: "Criteria",
              v: wf.quote ? (
                <pre className="text-[11px] font-mono text-[#a3a3a3] whitespace-pre-wrap bg-[#111] border border-[#1e1e1e] rounded-md px-2 py-1.5 overflow-x-auto">
                  {wf.quote.successCriteria}
                </pre>
              ) : "—",
            },
          ]}
        />

        {/* Workflow (Stage 2 — payment authz) */}
        <StageCard
          icon={WorkflowCircleIcon}
          title="Stage 2 — Payment + Workflow"
          ts={wf.createdAtMs}
          done={true}
          rows={[
            { k: "Customer", v: <CopyAddr value={wf.customer} /> },
            { k: "Product", v: <CopyAddr value={wf.productId} /> },
            { k: "Escrow balance", v: formatSui(wf.escrowBalance) },
            { k: "Open disputes", v: "0" },
          ]}
        />

        {/* Execution (Stage 3-4) */}
        <StageCard
          icon={FileSearchIcon}
          title="Stage 3 — Execution"
          ts={wf.execution?.completedAtMs ?? 0}
          done={wf.execution !== null}
          rows={[
            { k: "Execution object", v: wf.execution ? <CopyAddr value={wf.execution.id} /> : "—" },
            {
              k: "Reported total",
              v: wf.execution ? formatSui(wf.execution.totalCost) : "—",
            },
            {
              k: "Trace blob (Walrus)",
              v: wf.execution ? (
                <BlobChip
                  blobId={wf.execution.traceBlobId}
                  label="Execution trace"
                  onOpen={setBlob}
                />
              ) : "—",
            },
            {
              k: "Cost items",
              v: wf.execution ? (
                <div className="flex flex-col gap-1">
                  {wf.execution.costItems.map((c, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] text-[12px] gap-2">
                      <span className="font-mono text-[#a3a3a3]">
                        {shorten(c.provider)} · {CATEGORY_NAME[c.category]} · {c.units} units
                      </span>
                      <span className="text-white">{formatSui(c.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : "—",
            },
          ]}
        />

        {/* Outcome (Stage 5) */}
        <StageCard
          icon={wf.outcome?.success ? CheckmarkCircleIcon : AlertDiamondIcon}
          title="Stage 5 — Outcome verification"
          ts={wf.outcome?.verifiedAtMs ?? 0}
          done={wf.outcome !== null}
          accent={
            wf.outcome
              ? wf.outcome.success
                ? "#4ade80"
                : "#f87171"
              : undefined
          }
          rows={[
            { k: "Outcome object", v: wf.outcome ? <CopyAddr value={wf.outcome.id} /> : "—" },
            {
              k: "Verifier verdict",
              v: wf.outcome
                ? (wf.outcome.success ? (
                    <span className="text-[#4ade80]">success</span>
                  ) : (
                    <span className="text-[#f87171]">failure (refund)</span>
                  ))
                : "—",
            },
            {
              k: "Artifact blob",
              v: wf.outcome ? (
                <BlobChip
                  blobId={wf.outcome.artifactBlobId}
                  label="Outcome artifact"
                  onOpen={setBlob}
                />
              ) : "—",
            },
            {
              k: "Proof blob",
              v: wf.outcome ? (
                <BlobChip
                  blobId={wf.outcome.proofBlobId}
                  label="Verifier proof"
                  onOpen={setBlob}
                />
              ) : "—",
            },
            {
              k: "Dispute window ends",
              v: wf.outcome ? dt(wf.outcome.disputeWindowEndsMs) : "—",
            },
          ]}
        />

        {/* Settlement (Stage 7) */}
        <div className="lg:col-span-2">
          <StageCard
            icon={Payment01Icon}
            title="Stage 7 — Settlement (atomic)"
            ts={wf.settlement?.settledAtMs ?? 0}
            done={wf.settlement !== null}
            accent={wf.settlement ? "#4ade80" : undefined}
            rows={
              wf.settlement
                ? [
                    { k: "Settlement object", v: <CopyAddr value={wf.settlement.id} /> },
                    {
                      k: "Total disbursed",
                      v: formatSui(wf.settlement.totalSettled),
                    },
                    {
                      k: "Platform fee",
                      v: formatSui(wf.settlement.platformFee),
                    },
                    {
                      k: "Splits",
                      v: (
                        <div className="flex flex-col gap-1.5 w-full">
                          {wf.settlement.splits.map((s, i) => (
                            <div
                              key={i}
                              className="grid grid-cols-[1fr_120px_auto] items-center text-[12px] gap-2 px-2 py-1.5 rounded-md bg-[#111] border border-[#1e1e1e]"
                            >
                              <CopyAddr value={s.recipient} />
                              <span className="text-[#5a5a5a]">{ROLE_NAME[s.role] ?? `role ${s.role}`}</span>
                              <span className="text-white font-mono">{formatSui(s.amount)}</span>
                            </div>
                          ))}
                        </div>
                      ),
                    },
                  ]
                : [
                    { k: "Status", v: "pending — call settle_workflow_dev after dispute window" },
                  ]
            }
          />
        </div>
      </div>

      <WalrusBlobViewer meta={blob} onClose={() => setBlob(null)} />

      {disputeOpen && wf.outcome && (
        <DisputeModal
          workflowId={wf.id}
          outcomeId={wf.outcome.id}
          onClose={() => setDisputeOpen(false)}
          onFiled={() => {
            setDisputeOpen(false);
            fetchDetail();
          }}
        />
      )}
    </div>
  );
}
