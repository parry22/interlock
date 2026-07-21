"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  CheckmarkCircleIcon,
  PlayCircleIcon,
  LegalDocumentIcon,
  WorkflowCircleIcon,
  FileSearchIcon,
  Settings01Icon,
  AlertDiamondIcon,
  CoinsDollarIcon,
  HourglassIcon,
} from "@hugeicons/core-free-icons";

// ─── Stage spec ──────────────────────────────────────────────────────────────

type StageKey =
  | "quote"
  | "workflow"
  | "execution"
  | "verify"
  | "outcome"
  | "dispute_window"
  | "settle";

type StageStatus = "pending" | "running" | "done" | "error";

type StageRecord = {
  status: StageStatus;
  id?: string;
  digest?: string;
  explorer?: string;
  success?: boolean;
  walrus?: Record<string, string>;
  signaturePrefix?: string;
  waitMs?: number;
};

type StageDef = {
  key: StageKey;
  title: string;
  hint: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
};

const STAGES: StageDef[] = [
  { key: "quote",          title: "Quote",                 hint: "Lock in the price and what counts as success, on chain",              icon: LegalDocumentIcon  },
  { key: "workflow",       title: "Payment + escrow",      hint: "Your USDC is locked in escrow on Avalanche",                          icon: WorkflowCircleIcon },
  { key: "execution",      title: "Agent runs",            hint: "The agent does the work and reports its costs",                       icon: FileSearchIcon     },
  { key: "verify",         title: "Verify outcome",        hint: "Check the result against your success criteria, then sign the verdict", icon: Settings01Icon     },
  { key: "outcome",        title: "Outcome recorded",      hint: "The signed verdict is verified and stored on chain",                  icon: CheckmarkCircleIcon },
  { key: "dispute_window", title: "Dispute window",        hint: "You can challenge the result here before funds move",                 icon: HourglassIcon       },
  { key: "settle",         title: "Settle",                hint: "Escrow pays every party at once, or refunds you in full if it failed", icon: CoinsDollarIcon    },
];

const STATUS_COLOR: Record<StageStatus, string> = {
  pending: "#5a5a5a",
  running: "#fbbf24",
  done: "#4ade80",
  error: "#f87171",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function LifecycleDemoDrawer({
  open,
  onClose,
  outcomeMode,
}: {
  open: boolean;
  onClose: () => void;
  outcomeMode: "success" | "failure";
}) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  const [stages, setStages] = useState<Record<StageKey, StageRecord>>(() =>
    Object.fromEntries(STAGES.map((s) => [s.key, { status: "pending" as StageStatus }])) as Record<
      StageKey,
      StageRecord
    >,
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState<{
    workflowId: string;
    settlementId: string;
    workflowExplorer: string;
    settlementExplorer: string;
  } | null>(null);
  const [customerAddr, setCustomerAddr] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStages(
      Object.fromEntries(STAGES.map((s) => [s.key, { status: "pending" as StageStatus }])) as Record<
        StageKey,
        StageRecord
      >,
    );
    setError(null);
    setComplete(null);
    setCustomerAddr(null);
  }, []);

  // Auto-start when the drawer opens.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    reset();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    (async () => {
      try {
        // Runs signed by the signed-in user's own Avalanche wallet (the
        // server loads it from their session) — their escrow, their refund.
        const resp = await fetch("/api/demo/run-lifecycle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcomeMode }),
          signal: controller.signal,
        });
        if (!resp.body) throw new Error("response has no body");
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl = buf.indexOf("\n");
          while (nl >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) {
              const msg = JSON.parse(line) as {
                event: string;
                data: Record<string, unknown>;
              };
              handleEvent(msg);
            }
            nl = buf.indexOf("\n");
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      } finally {
        setRunning(false);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, outcomeMode]);

  function handleEvent(msg: { event: string; data: Record<string, unknown> }) {
    if (msg.event === "start") {
      setCustomerAddr((msg.data.customer as string) ?? null);
      return;
    }
    if (msg.event === "stage") {
      const stage = msg.data.stage as StageKey;
      const status = msg.data.status as "started" | "done";
      setStages((prev) => ({
        ...prev,
        [stage]: {
          ...prev[stage],
          status: status === "started" ? "running" : "done",
          id: (msg.data.id as string | undefined) ?? prev[stage].id,
          digest: (msg.data.digest as string | undefined) ?? prev[stage].digest,
          explorer: (msg.data.explorer as string | undefined) ?? prev[stage].explorer,
          success: msg.data.success as boolean | undefined,
          walrus: msg.data.walrus as Record<string, string> | undefined,
          signaturePrefix: msg.data.signaturePrefix as string | undefined,
          waitMs: msg.data.waitMs as number | undefined,
        },
      }));
    } else if (msg.event === "complete") {
      setComplete({
        workflowId: msg.data.workflowId as string,
        settlementId: msg.data.settlementId as string,
        workflowExplorer: msg.data.workflowExplorer as string,
        settlementExplorer: msg.data.settlementExplorer as string,
      });
    } else if (msg.event === "error") {
      setError(msg.data.message as string);
      setStages((prev) => {
        const next = { ...prev };
        for (const k of STAGES.map((s) => s.key)) {
          if (next[k].status === "running") next[k] = { ...next[k], status: "error" };
        }
        return next;
      });
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative ml-auto w-full max-w-130 bg-[#0a0a0a] border-l border-[#1e1e1e] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e] shrink-0">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={PlayCircleIcon} size={16} color="#3064FF" strokeWidth={1.5} />
            <span className="text-[14px] font-semibold text-white">
              Test workflow: {outcomeMode}
            </span>
          </div>
          <button onClick={onClose} className="text-[#5a5a5a] hover:text-white transition-colors">
            <HugeiconsIcon icon={Cancel01Icon} size={16} color="currentColor" strokeWidth={1.5} />
          </button>
        </div>

        {/* Signing mode banner */}
        {customerAddr && (
          <div
            className="mx-5 mt-3 px-3 py-2 rounded-md text-[11px] flex items-center gap-2 shrink-0"
            style={{ background: "rgba(107,107,107,0.1)", border: "1px solid #272727" }}
          >
            <span className="font-semibold uppercase tracking-wider text-[#a3a3a3]">
              platform key
            </span>
            <span className="text-[#5a5a5a]">·</span>
            <span className="text-[#a3a3a3]">customer:</span>
            <code className="font-mono text-[#d4d4d4]">
              {customerAddr.length > 14
                ? `${customerAddr.slice(0, 8)}…${customerAddr.slice(-4)}`
                : customerAddr}
            </code>
          </div>
        )}

        {/* Stages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {STAGES.map((def, idx) => {
            const rec = stages[def.key];
            const color = STATUS_COLOR[rec.status];
            return (
              <div
                key={def.key}
                className="bg-[#171718] border border-[#1e1e1e] rounded-2xl px-4 py-3"
                style={rec.status === "done" ? { borderColor: color } : undefined}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `${color}1a`, color }}
                  >
                    <HugeiconsIcon
                      icon={
                        rec.status === "done"
                          ? CheckmarkCircleIcon
                          : rec.status === "error"
                            ? AlertDiamondIcon
                            : def.icon
                      }
                      size={14}
                      color="currentColor"
                      strokeWidth={1.5}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-semibold text-white">
                        {idx + 1}. {def.title}
                      </span>
                      <span
                        className="text-[11px] font-medium uppercase tracking-wider"
                        style={{ color }}
                      >
                        {rec.status === "running" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
                            running
                          </span>
                        ) : (
                          rec.status
                        )}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#5a5a5a] mt-0.5">{def.hint}</p>

                    {/* Stage outputs */}
                    {(rec.id || rec.digest || rec.signaturePrefix || rec.walrus) && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {rec.id && (
                          <a
                            href={rec.explorer}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-mono text-[#60a5fa] hover:text-[#93c5fd] truncate block"
                          >
                            id: {rec.id}
                          </a>
                        )}
                        {rec.digest && (
                          <a
                            href={rec.explorer}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-mono text-[#a3a3a3] hover:text-white truncate block"
                          >
                            tx: {rec.digest}
                          </a>
                        )}
                        {rec.signaturePrefix && (
                          <span className="text-[11px] font-mono text-[#a3a3a3]">
                            ed25519 sig: {rec.signaturePrefix}
                          </span>
                        )}
                        {rec.success !== undefined && (
                          <span
                            className="text-[11px] font-medium"
                            style={{ color: rec.success ? "#4ade80" : "#f87171" }}
                          >
                            verifier verdict: {rec.success ? "success ✓" : "failure → refund"}
                          </span>
                        )}
                        {rec.walrus && (
                          <div className="text-[10px] font-mono text-[#5a5a5a] flex flex-col gap-0.5">
                            {Object.entries(rec.walrus).map(([k, v]) => (
                              <span key={k} className="truncate">
                                walrus/{k}: {v}
                              </span>
                            ))}
                          </div>
                        )}
                        {rec.waitMs && rec.status === "running" && (
                          <span className="text-[11px] text-[#a3a3a3]">
                            waiting {rec.waitMs / 1000}s for dispute window…
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {error && (
            <div className="bg-[#3a1818] border border-[#ef4444] rounded-2xl px-4 py-3">
              <p className="text-[13px] font-medium text-[#f87171]">Lifecycle failed</p>
              <p className="text-[11px] text-[#fca5a5] mt-1 font-mono break-all">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#1e1e1e] px-5 py-4 flex items-center gap-3 shrink-0">
          {complete ? (
            <>
              <button
                onClick={() => {
                  onClose();
                  router.push(`/workflows/${complete.workflowId}`);
                }}
                className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] text-white transition-colors"
              >
                Open workflow
              </button>
              <a
                href={complete.settlementExplorer}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white transition-colors"
              >
                Settlement on Snowtrace ↗
              </a>
            </>
          ) : running ? (
            <span className="text-[12px] text-[#5a5a5a]">
              Running live on Avalanche, about 30 to 40 seconds including a 10 second dispute window
            </span>
          ) : error ? (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white transition-colors"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
