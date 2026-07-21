"use client";

// Reusable streaming-lifecycle progress view. Takes a POST URL + body,
// opens an NDJSON stream, and renders the 7 stage cards as events arrive.
// Used by both the demo drawer and the human Create-Workflow drawer; the
// agent SDK is a thin client around the same endpoint shape.

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  LegalDocumentIcon,
  WorkflowCircleIcon,
  FileSearchIcon,
  Settings01Icon,
  CheckmarkCircleIcon,
  HourglassIcon,
  CoinsDollarIcon,
  AlertDiamondIcon,
} from "@hugeicons/core-free-icons";

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
  /** Settle stage only — true when the verifier verdict was failure and the
   *  Move contract took the refund branch (no Settlement object created). */
  refunded?: boolean;
};

type StageDef = {
  key: StageKey;
  title: string;
  hint: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
};

const STAGES: StageDef[] = [
  { key: "quote", title: "Quote", hint: "Lock in the price and what counts as success, on chain", icon: LegalDocumentIcon },
  { key: "workflow", title: "Payment + escrow", hint: "Your USDC is locked in escrow on Avalanche", icon: WorkflowCircleIcon },
  { key: "execution", title: "Agent runs", hint: "The agent does the work and reports its costs", icon: FileSearchIcon },
  { key: "verify", title: "Verify outcome", hint: "Check the result against your success criteria, then sign the verdict", icon: Settings01Icon },
  { key: "outcome", title: "Outcome recorded", hint: "The signed verdict is verified and stored on chain", icon: CheckmarkCircleIcon },
  { key: "dispute_window", title: "Dispute window", hint: "You can challenge the result here before funds move", icon: HourglassIcon },
  { key: "settle", title: "Settle", hint: "Escrow pays every party at once, or refunds you in full if it failed", icon: CoinsDollarIcon },
];

const STATUS_COLOR: Record<StageStatus, string> = {
  pending: "#5a5a5a",
  running: "#fbbf24",
  done: "#4ade80",
  error: "#f87171",
};

export type CompleteEvent = {
  workflowId: string;
  settlementId: string;
  workflowExplorer: string;
  settlementExplorer: string;
};

/** A runner drives the stages without the server stream. It receives an `emit`
 *  to report stage progress and resolves with the completion info. Used by the
 *  connected-wallet (client-signed) path. */
export type StageRunner = (
  emit: (
    stage: StageKey,
    status: "started" | "done",
    extra?: { txHash?: string; explorer?: string; success?: boolean },
  ) => void,
) => Promise<CompleteEvent>;

export function StreamingLifecycleStages({
  url,
  body,
  runner,
  onComplete,
  onError,
}: {
  url?: string;
  body?: Record<string, unknown>;
  runner?: StageRunner;
  onComplete?: (e: CompleteEvent) => void;
  onError?: (msg: string) => void;
}) {
  const abortRef = useRef<AbortController | null>(null);
  const [stages, setStages] = useState<Record<StageKey, StageRecord>>(() =>
    Object.fromEntries(
      STAGES.map((s) => [s.key, { status: "pending" as StageStatus }]),
    ) as Record<StageKey, StageRecord>,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    (async () => {
      try {
        if (runner) {
          // Client-signed path: the runner performs the on-chain calls and
          // reports each stage through `emit`.
          const complete = await runner((stage, status, extra) =>
            handleEvent({
              event: "stage",
              data: { stage, status, digest: extra?.txHash, explorer: extra?.explorer, success: extra?.success },
            }),
          );
          onComplete?.(complete);
          return;
        }
        const resp = await fetch(url!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!resp.body) throw new Error("response has no body");
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`HTTP ${resp.status}: ${text}`);
        }
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
            if (line) handleEvent(JSON.parse(line) as { event: string; data: Record<string, unknown> });
            nl = buf.indexOf("\n");
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          const msg = (e as Error).message;
          setError(msg);
          onError?.(msg);
          setStages((prev) => {
            const next = { ...prev };
            for (const k of STAGES.map((s) => s.key)) {
              if (next[k].status === "running") next[k] = { ...next[k], status: "error" };
            }
            return next;
          });
        }
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEvent(msg: { event: string; data: Record<string, unknown> }) {
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
          refunded: msg.data.refunded as boolean | undefined,
        },
      }));
    } else if (msg.event === "complete") {
      onComplete?.({
        workflowId: msg.data.workflowId as string,
        settlementId: msg.data.settlementId as string,
        workflowExplorer: msg.data.workflowExplorer as string,
        settlementExplorer: msg.data.settlementExplorer as string,
      });
    } else if (msg.event === "error") {
      const m = msg.data.message as string;
      setError(m);
      onError?.(m);
      setStages((prev) => {
        const next = { ...prev };
        for (const k of STAGES.map((s) => s.key)) {
          if (next[k].status === "running") next[k] = { ...next[k], status: "error" };
        }
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
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
                    {idx + 1}. {def.key === "settle" && rec.refunded ? "Refund (escrow returned)" : def.title}
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
                <p className="text-[12px] text-[#5a5a5a] mt-0.5">
                  {def.key === "settle" && rec.refunded
                    ? "Verifier verdict was failure — escrow refunded to the customer in one transaction"
                    : def.hint}
                </p>
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
                        signature: {rec.signaturePrefix}
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
  );
}
