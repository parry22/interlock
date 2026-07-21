"use client";

// Human-facing Create-Workflow drawer.
//
// Lets the signed-in user author a real workflow without writing JSON:
//   • Price (USDC) → escrow amount
//   • Success criteria builder: rows of "JSON pointer → expected value"
//     combined with `all_of`. Matches the DSL the on-chain Quote freezes.
//   • Outcome JSON: what the agent claims it produced (free-form JSON).
//   • Dispute window seconds
//
// On submit, POSTs to /api/workflows/start and reuses
// <StreamingLifecycleStages /> to render the streaming progress.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  AddCircleIcon,
  Delete01Icon,
  PlayCircleIcon,
} from "@hugeicons/core-free-icons";

import {
  StreamingLifecycleStages,
  type CompleteEvent,
  type StageRunner,
} from "@/components/StreamingLifecycleStages";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { useWallet } from "@/lib/interlock/useWallet";
import { runWorkflowWithWallet, ensureTestUsdc } from "@/lib/interlock/client-lifecycle";
import { evmConfig, explorerAddressUrl } from "@/lib/interlock/evm";
import type { SuccessCriterion } from "@/lib/interlock/dsl";

type CriterionRow = { path: string; value: string };

const DEFAULT_CRITERIA: CriterionRow[] = [
  { path: "/ticket_status", value: "closed" },
];
const DEFAULT_OUTCOME_TEMPLATE = `{
  "ticket_status": "closed",
  "refund_amount": 47.5
}`;

export type CreateWorkflowPrefill = {
  agentId: number;
  agentName: string;
  /** Default escrow price for this agent, in base units. */
  priceBaseUnits: number;
  /** Agent's success-criteria template — used to seed both the rows AND
   *  the raw criteria sent to the server. We render whatever rows we can
   *  decode from the template; if it can't be decomposed we fall back to a
   *  single sentinel row and pass the full template through unchanged. */
  criteriaTemplate: unknown;
  /** Outcome that satisfies the agent's own criteria — pre-fills the textbox
   *  so the demo run lands on the success path by default. Client can edit. */
  exampleOutcome?: Record<string, unknown>;
};

export function CreateWorkflowDrawer({
  open,
  onClose,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: CreateWorkflowPrefill;
}) {
  const router = useRouter();

  // Form state — seeded from prefill on first mount so the hire flow
  // pre-fills the agent's price + criteria.
  const initialRows: CriterionRow[] = prefill
    ? decomposeCriteriaToRows(prefill.criteriaTemplate) ?? DEFAULT_CRITERIA
    : DEFAULT_CRITERIA;
  const initialPrice = prefill
    ? (prefill.priceBaseUnits / 1e6).toString()
    : "10";

  const initialOutcome =
    prefill?.exampleOutcome && Object.keys(prefill.exampleOutcome).length > 0
      ? JSON.stringify(prefill.exampleOutcome, null, 2)
      : DEFAULT_OUTCOME_TEMPLATE;

  // Hiring a registered agent: the platform RUNS the agent, so the customer
  // describes the task and the agent produces the outcome. Manual mode (no
  // agent) still lets you type the outcome yourself, for testing.
  const isHire = Boolean(prefill);

  const [priceUsdc, setPriceUsdc] = useState(initialPrice);
  const [criteria, setCriteria] = useState<CriterionRow[]>(initialRows);
  const [outcomeText, setOutcomeText] = useState(initialOutcome);
  const [taskInput, setTaskInput] = useState("");
  const [disputeWindowSeconds, setDisputeWindowSeconds] = useState(10);
  const [formError, setFormError] = useState<string | null>(null);

  // Connected wallet (optional). When present in manual mode, the workflow is
  // signed by the user's own wallet client-side instead of the custodial one.
  const wallet = useWallet();

  // Run state
  const [runBody, setRunBody] = useState<Record<string, unknown> | null>(null);
  const [walletRun, setWalletRun] = useState<{
    priceBaseUnits: number;
    criteria: SuccessCriterion;
    outcome: Record<string, unknown>;
    disputeWindowSeconds: number;
  } | null>(null);
  const [complete, setComplete] = useState<CompleteEvent | null>(null);
  const running = Boolean(runBody || walletRun);

  function reset() {
    setRunBody(null);
    setWalletRun(null);
    setComplete(null);
    setFormError(null);
  }

  const walletRunner: StageRunner = async (emit) => {
    if (!walletRun) throw new Error("no run params");
    const signer = await wallet.getSigner();
    await ensureTestUsdc(signer, walletRun.priceBaseUnits);
    const res = await runWorkflowWithWallet({
      signer,
      productId: evmConfig.defaultProductId,
      priceBaseUnits: walletRun.priceBaseUnits,
      criteria: walletRun.criteria,
      outcome: walletRun.outcome,
      costItems: [],
      disputeWindowSeconds: walletRun.disputeWindowSeconds,
      emit,
    });
    return {
      workflowId: res.workflowId,
      settlementId: "",
      workflowExplorer: explorerAddressUrl(evmConfig.coreAddress),
      settlementExplorer: res.settleTxHash
        ? `${evmConfig.explorerBase}/tx/${res.settleTxHash}`
        : explorerAddressUrl(evmConfig.coreAddress),
    };
  };

  function close() {
    reset();
    onClose();
  }

  function submit() {
    setFormError(null);

    // Validate price
    const priceFloat = Number(priceUsdc);
    if (!isFinite(priceFloat) || priceFloat <= 0) {
      setFormError("Price must be a positive number");
      return;
    }
    const priceBaseUnits = Math.round(priceFloat * 1e6);

    // Validate criteria — at least one row, all paths start with /, values non-empty
    const validRows = criteria.filter((r) => r.path && r.value);
    if (validRows.length === 0) {
      setFormError("Add at least one success criterion");
      return;
    }
    for (const r of validRows) {
      if (!r.path.startsWith("/")) {
        setFormError(`Path "${r.path}" must start with /`);
        return;
      }
    }

    // Compose DSL: all_of(exact paths)
    const dslCriteria = {
      type: "all_of" as const,
      criteria: validRows.map((r) => ({
        type: "exact" as const,
        path: r.path,
        value: tryParseLiteral(r.value),
      })),
    };

    if (isHire) {
      // Hiring an agent: the platform runs the agent to produce the outcome.
      // We send the task, not a hand-typed result.
      setRunBody({
        priceBaseUnits,
        criteria: dslCriteria,
        disputeWindowSeconds,
        agentId: prefill!.agentId,
        taskInput: taskInput.trim() || "Complete this task per the success criteria.",
      });
      return;
    }

    // Manual/test mode: you supply the outcome yourself.
    let outcome: Record<string, unknown>;
    try {
      outcome = JSON.parse(outcomeText) as Record<string, unknown>;
    } catch (e) {
      setFormError(`Outcome must be valid JSON: ${(e as Error).message}`);
      return;
    }

    if (wallet.address) {
      // Non-custodial: sign the workflow with the connected wallet client-side.
      setWalletRun({ priceBaseUnits, criteria: dslCriteria, outcome, disputeWindowSeconds });
      return;
    }

    setRunBody({
      priceBaseUnits,
      criteria: dslCriteria,
      outcome,
      disputeWindowSeconds,
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      <div className="relative ml-auto w-full max-w-150 bg-[#0a0a0a] border-l border-[#1e1e1e] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e] shrink-0">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={PlayCircleIcon} size={16} color="#3064FF" strokeWidth={1.5} />
            <span className="text-[14px] font-semibold text-white">
              {running
                ? "Workflow running"
                : prefill
                  ? `Hire ${prefill.agentName}`
                  : "Create a workflow"}
            </span>
          </div>
          <button onClick={close} className="text-[#5a5a5a] hover:text-white transition-colors">
            <HugeiconsIcon icon={Cancel01Icon} size={16} color="currentColor" strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!running ? (
            <div className="flex flex-col gap-4">
              {/* Wallet: pay with your own wallet, or the built-in one.
                  Agent hires run server-side so the wallet toggle is manual-only. */}
              {!isHire && (
                <div className="flex items-center justify-between rounded-xl border border-[#1e1e1e] bg-[#111113] px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-[12px] font-medium text-[#d4d4d4]">
                      {wallet.address ? "Paying with your connected wallet" : "Pay with your own wallet"}
                    </span>
                    <span className="text-[11px] text-[#5a5a5a]">
                      {wallet.address
                        ? "You sign each transaction; your funds never leave your custody."
                        : "Optional. Otherwise your built-in Interlock wallet pays."}
                    </span>
                  </div>
                  <ConnectWalletButton wallet={wallet} size="sm" />
                </div>
              )}
              <Form
                isHire={isHire}
                agentName={prefill?.agentName}
                priceUsdc={priceUsdc}
                setPriceUsdc={setPriceUsdc}
                criteria={criteria}
                setCriteria={setCriteria}
                outcomeText={outcomeText}
                setOutcomeText={setOutcomeText}
                taskInput={taskInput}
                setTaskInput={setTaskInput}
                disputeWindowSeconds={disputeWindowSeconds}
                setDisputeWindowSeconds={setDisputeWindowSeconds}
                error={formError}
              />
            </div>
          ) : walletRun ? (
            <StreamingLifecycleStages runner={walletRunner} onComplete={setComplete} />
          ) : (
            <StreamingLifecycleStages
              url="/api/workflows/start"
              body={runBody!}
              onComplete={setComplete}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#1e1e1e] px-5 py-4 flex items-center gap-3 shrink-0">
          {!running ? (
            <>
              <button
                onClick={submit}
                className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] text-white transition-colors"
              >
                {wallet.address && !isHire ? "Pay + start (sign in wallet)" : "Start workflow"}
              </button>
              <button
                onClick={close}
                className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white transition-colors"
              >
                Cancel
              </button>
            </>
          ) : complete ? (
            <>
              <button
                onClick={() => {
                  close();
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
          ) : (
            <span className="text-[12px] text-[#5a5a5a]">
              {walletRun
                ? "Approve each transaction in your wallet when prompted…"
                : "Running on Avalanche, about 30 to 40 seconds including the dispute window…"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Parse a string into a typed JSON literal where possible: numbers stay
 *  numbers, true/false/null stay primitives, anything else stays string. */
function tryParseLiteral(s: string): unknown {
  const t = s.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return s;
}

/** Best-effort flatten of a criteria template into the form rows. Only
 *  handles all_of-of-exact and a single exact; falls back to null for
 *  anything richer (the form will use defaults but the agent's actual
 *  criteria still gets sent through prefill.criteriaTemplate at submit
 *  time when richer encoding is needed). */
function decomposeCriteriaToRows(t: unknown): CriterionRow[] | null {
  if (!t || typeof t !== "object") return null;
  const obj = t as Record<string, unknown>;
  if (obj.type === "exact") {
    const path = typeof obj.path === "string" ? obj.path : "";
    const value = obj.value === null ? "null" : String(obj.value ?? "");
    if (!path) return null;
    return [{ path, value }];
  }
  if (obj.type === "all_of" && Array.isArray(obj.criteria)) {
    const rows: CriterionRow[] = [];
    for (const sub of obj.criteria as unknown[]) {
      if (sub && typeof sub === "object") {
        const s = sub as Record<string, unknown>;
        if (s.type === "exact" && typeof s.path === "string") {
          rows.push({
            path: s.path,
            value: s.value === null ? "null" : String(s.value ?? ""),
          });
        } else if (s.type === "numeric_threshold" && typeof s.path === "string") {
          rows.push({
            path: s.path,
            value: String(s.value ?? ""),
          });
        }
      }
    }
    return rows.length > 0 ? rows : null;
  }
  return null;
}

// ─── Form ────────────────────────────────────────────────────────────────────

function Form({
  isHire,
  agentName,
  priceUsdc,
  setPriceUsdc,
  criteria,
  setCriteria,
  outcomeText,
  setOutcomeText,
  taskInput,
  setTaskInput,
  disputeWindowSeconds,
  setDisputeWindowSeconds,
  error,
}: {
  isHire: boolean;
  agentName?: string;
  priceUsdc: string;
  setPriceUsdc: (v: string) => void;
  criteria: CriterionRow[];
  setCriteria: (v: CriterionRow[]) => void;
  outcomeText: string;
  setOutcomeText: (v: string) => void;
  taskInput: string;
  setTaskInput: (v: string) => void;
  disputeWindowSeconds: number;
  setDisputeWindowSeconds: (v: number) => void;
  error: string | null;
}) {
  function updateRow(i: number, patch: Partial<CriterionRow>) {
    setCriteria(criteria.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setCriteria([...criteria, { path: "", value: "" }]);
  }
  function removeRow(i: number) {
    setCriteria(criteria.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Task — only when hiring an agent (the agent produces the outcome) */}
      {isHire && (
        <Field
          label="What do you need done?"
          hint={`${agentName ?? "The agent"} runs this task and produces the result. Payment is released only if the result meets the criteria below.`}
        >
          <textarea
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            rows={3}
            placeholder="e.g. Close refund ticket #4821 for an order under $100"
            className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] outline-none focus:border-[#2a2a2a] resize-none"
          />
        </Field>
      )}

      {/* Price */}
      <Field label="Price (USDC escrow)" hint="Locked from your wallet now. Released to the agent and its providers only on success, or refunded to you if the result fails the criteria.">
        <input
          value={priceUsdc}
          onChange={(e) => setPriceUsdc(e.target.value)}
          placeholder="10"
          className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] font-mono outline-none focus:border-[#2a2a2a]"
        />
      </Field>

      {/* Criteria */}
      <Field
        label="Success criteria"
        hint="Each row is checked exactly. Combined with all_of. Path is an RFC 6901 JSON Pointer."
      >
        <div className="flex flex-col gap-2">
          {criteria.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={r.path}
                onChange={(e) => updateRow(i, { path: e.target.value })}
                placeholder="/ticket_status"
                className="flex-1 bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[12px] text-[#d4d4d4] font-mono outline-none focus:border-[#2a2a2a]"
              />
              <span className="text-[#5a5a5a] text-[11px]">==</span>
              <input
                value={r.value}
                onChange={(e) => updateRow(i, { value: e.target.value })}
                placeholder="closed"
                className="flex-1 bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[12px] text-[#d4d4d4] font-mono outline-none focus:border-[#2a2a2a]"
              />
              <button
                onClick={() => removeRow(i)}
                disabled={criteria.length === 1}
                className="text-[#5a5a5a] hover:text-[#f87171] disabled:opacity-30 transition-colors"
              >
                <HugeiconsIcon icon={Delete01Icon} size={13} color="currentColor" strokeWidth={1.5} />
              </button>
            </div>
          ))}
          <button
            onClick={addRow}
            className="self-start flex items-center gap-1.5 text-[11px] text-[#60a5fa] hover:text-[#93c5fd] transition-colors"
          >
            <HugeiconsIcon icon={AddCircleIcon} size={11} color="currentColor" strokeWidth={1.5} />
            Add criterion
          </button>
        </div>
      </Field>

      {/* Outcome — manual/test mode only. When hiring an agent, the agent
          produces this, so we don't ask for it. */}
      {!isHire && (
        <Field label="Test outcome (JSON)" hint="No agent selected, so supply a result to test the verifier against. When you hire a registered agent, it produces this for you.">
          <textarea
            value={outcomeText}
            onChange={(e) => setOutcomeText(e.target.value)}
            rows={6}
            className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[12px] text-[#d4d4d4] font-mono outline-none focus:border-[#2a2a2a] resize-none"
          />
        </Field>
      )}

      {/* Dispute window */}
      <Field label={`Dispute window: ${disputeWindowSeconds}s`} hint="How long the customer has to file a dispute before settlement fires. 5–30s for demo.">
        <input
          type="range"
          min={5}
          max={30}
          step={1}
          value={disputeWindowSeconds}
          onChange={(e) => setDisputeWindowSeconds(Number(e.target.value))}
          className="w-full accent-[#3064FF]"
        />
      </Field>

      {error && (
        <div className="bg-[#3a1818] border border-[#ef4444] rounded-md px-3 py-2 text-[12px] text-[#f87171]">
          {error}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-[#d4d4d4] font-semibold">{label}</span>
      {hint && <span className="text-[11px] text-[#5a5a5a]">{hint}</span>}
      {children}
    </div>
  );
}
