"use client";

// Register a new agent in the marketplace.
//
// Mirrors the structured shape an agent self-registers via MCP — same
// fields, just typed by a human through this form instead of by a calling
// agent. On submit, POST /api/agents creates the row with the signed-in
// user as the owner and the user is redirected to the agent's detail page.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AddCircleIcon,
  Delete01Icon,
  ArrowLeft01Icon,
  Brain01Icon,
  ToolsIcon,
  UserMultipleIcon,
  CodeIcon,
} from "@hugeicons/core-free-icons";

type StepKind = "model_call" | "tool_call" | "human_review" | "compute";
type StepRow = { kind: StepKind; label: string; provider?: string; costNote?: string };
type CriterionRow = { path: string; value: string };

const KIND_LABEL: Record<StepKind, string> = {
  model_call: "Model call",
  tool_call: "Tool call",
  human_review: "Human review",
  compute: "Compute",
};
const KIND_ICON = {
  model_call: Brain01Icon,
  tool_call: ToolsIcon,
  human_review: UserMultipleIcon,
  compute: CodeIcon,
} as const;
const KIND_COLOR = {
  model_call: "#60a5fa",
  tool_call: "#fbbf24",
  human_review: "#a78bfa",
  compute: "#4ade80",
} as const;

export default function NewAgentPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [steps, setSteps] = useState<StepRow[]>([
    { kind: "model_call", label: "", provider: "", costNote: "" },
  ]);
  const [criteria, setCriteria] = useState<CriterionRow[]>([
    { path: "/status", value: "done" },
  ]);
  const [priceUsdc, setPriceUsdc] = useState("10");
  const [execMode, setExecMode] = useState<"sample" | "endpoint" | "declared">("sample");
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addStep() {
    setSteps([...steps, { kind: "model_call", label: "", provider: "", costNote: "" }]);
  }
  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }
  function updateStep(i: number, patch: Partial<StepRow>) {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addCriterion() {
    setCriteria([...criteria, { path: "", value: "" }]);
  }
  function removeCriterion(i: number) {
    setCriteria(criteria.filter((_, idx) => idx !== i));
  }
  function updateCriterion(i: number, patch: Partial<CriterionRow>) {
    setCriteria(criteria.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function submit() {
    setError(null);

    if (!name.trim() || name.length < 2) return setError("Name must be at least 2 chars");
    if (!description.trim() || description.length < 10)
      return setError("Description must be at least 10 chars");

    const priceFloat = Number(priceUsdc);
    if (!isFinite(priceFloat) || priceFloat <= 0) return setError("Price must be > 0");
    const priceBaseUnits = Math.round(priceFloat * 1e6);

    const validSteps = steps.filter((s) => s.label.trim());
    if (validSteps.length === 0) return setError("Add at least one workflow step");

    const validCriteria = criteria.filter((c) => c.path.trim() && c.value.trim());
    if (validCriteria.length === 0) return setError("Add at least one success criterion");
    for (const c of validCriteria) {
      if (!c.path.startsWith("/")) return setError(`Path "${c.path}" must start with /`);
    }
    const criteriaTemplate =
      validCriteria.length === 1
        ? { type: "exact", path: validCriteria[0].path, value: parseLiteral(validCriteria[0].value) }
        : {
            type: "all_of",
            criteria: validCriteria.map((c) => ({
              type: "exact",
              path: c.path,
              value: parseLiteral(c.value),
            })),
          };

    const taskTags = tagsText
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    // Resolve the execution endpoint from the chosen mode.
    let executionEndpoint: string | undefined;
    if (execMode === "sample") {
      executionEndpoint = `${window.location.origin}/api/agents/sample-execute`;
    } else if (execMode === "endpoint") {
      const ep = endpoint.trim();
      if (!ep) return setError("Enter your agent's HTTPS endpoint, or pick another mode");
      if (!ep.startsWith("https://")) return setError("Endpoint must start with https://");
      executionEndpoint = ep;
    }

    // A sample "successful outcome" derived from the criteria, so a
    // declared-only agent (no endpoint) still has something to return.
    const exampleOutcome: Record<string, unknown> = {};
    for (const c of validCriteria) {
      setDeep(exampleOutcome, c.path, parseLiteral(c.value));
    }

    setBusy(true);
    try {
      const r = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim(),
          taskTags,
          workflowSpec: { steps: validSteps },
          criteriaTemplate,
          exampleOutcome,
          executionEndpoint,
          pricingModel: "fixed",
          priceBaseUnits,
        }),
      });
      const j = (await r.json()) as { agent?: { slug: string }; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      router.push(`/agents/${j.agent!.slug}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-5">
      <button
        onClick={() => router.push("/agents")}
        className="self-start flex items-center gap-1.5 text-[12px] text-[#5a5a5a] hover:text-white"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={11} color="currentColor" strokeWidth={1.5} />
        Back to agents
      </button>

      <div>
        <h1 className="text-white text-[20px] font-semibold tracking-tight">Register your agent</h1>
        <p className="text-[#5a5a5a] text-[12px] mt-0.5">
          Your agent shows up in the marketplace once you save. Clients can hire you and the workflows that result get tagged to your track record.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Basics */}
        <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl px-5 py-4 flex flex-col gap-4">
          <span className="text-[10px] uppercase tracking-wider text-[#5a5a5a] font-semibold">
            Basics
          </span>
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Refundo Pro"
              className={inputCls}
            />
          </Field>
          <Field label="Slug (optional)" hint="Auto-generated from the name if blank.">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="refundo-pro"
              className={inputCls}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What does this agent do? When should a client pick it?"
              className={inputCls + " resize-none"}
            />
          </Field>
          <Field label="Tags" hint="Comma-separated. Used for filtering + matching.">
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="support, refund, tickets"
              className={inputCls}
            />
          </Field>
          <Field label="Price (USDC escrow per workflow)">
            <input
              value={priceUsdc}
              onChange={(e) => setPriceUsdc(e.target.value)}
              placeholder="10"
              className={inputCls}
            />
          </Field>
        </div>

        {/* Workflow + criteria */}
        <div className="flex flex-col gap-5">
          {/* Steps */}
          <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl px-5 py-4 flex flex-col gap-3">
            <span className="text-[10px] uppercase tracking-wider text-[#5a5a5a] font-semibold">
              Workflow steps
            </span>
            {steps.map((s, i) => (
              <div key={i} className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl px-3 py-2.5 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <select
                    value={s.kind}
                    onChange={(e) => updateStep(i, { kind: e.target.value as StepKind })}
                    className="bg-[#171718] border border-[#272727] rounded-md px-2 py-1 text-[12px] text-[#d4d4d4] outline-none"
                  >
                    {(Object.keys(KIND_LABEL) as StepKind[]).map((k) => (
                      <option key={k} value={k}>{KIND_LABEL[k]}</option>
                    ))}
                  </select>
                  <HugeiconsIcon
                    icon={KIND_ICON[s.kind]}
                    size={12}
                    color={KIND_COLOR[s.kind]}
                    strokeWidth={1.5}
                  />
                  <input
                    value={s.label}
                    onChange={(e) => updateStep(i, { label: e.target.value })}
                    placeholder="Step label"
                    className={"flex-1 " + inputCls}
                  />
                  <button
                    onClick={() => removeStep(i)}
                    disabled={steps.length === 1}
                    className="text-[#5a5a5a] hover:text-[#f87171] disabled:opacity-30 transition-colors"
                  >
                    <HugeiconsIcon icon={Delete01Icon} size={12} color="currentColor" strokeWidth={1.5} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={s.provider ?? ""}
                    onChange={(e) => updateStep(i, { provider: e.target.value })}
                    placeholder="Provider (e.g. Claude Sonnet)"
                    className={"flex-1 " + inputCls}
                  />
                  <input
                    value={s.costNote ?? ""}
                    onChange={(e) => updateStep(i, { costNote: e.target.value })}
                    placeholder="Cost note (e.g. ~3k tokens)"
                    className={"flex-1 " + inputCls}
                  />
                </div>
              </div>
            ))}
            <button
              onClick={addStep}
              className="self-start flex items-center gap-1.5 text-[11px] text-[#60a5fa] hover:text-[#93c5fd] transition-colors"
            >
              <HugeiconsIcon icon={AddCircleIcon} size={11} color="currentColor" strokeWidth={1.5} />
              Add step
            </button>
          </div>

          {/* Criteria */}
          <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl px-5 py-4 flex flex-col gap-3">
            <span className="text-[10px] uppercase tracking-wider text-[#5a5a5a] font-semibold">
              Success criteria
            </span>
            <p className="text-[11px] text-[#5a5a5a]">
              Frozen into every Quote you fulfill. Path is an RFC 6901 JSON Pointer into the agent&apos;s outcome JSON.
            </p>
            {criteria.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={c.path}
                  onChange={(e) => updateCriterion(i, { path: e.target.value })}
                  placeholder="/status"
                  className={"flex-1 " + inputCls}
                />
                <span className="text-[#5a5a5a] text-[11px]">==</span>
                <input
                  value={c.value}
                  onChange={(e) => updateCriterion(i, { value: e.target.value })}
                  placeholder="done"
                  className={"flex-1 " + inputCls}
                />
                <button
                  onClick={() => removeCriterion(i)}
                  disabled={criteria.length === 1}
                  className="text-[#5a5a5a] hover:text-[#f87171] disabled:opacity-30 transition-colors"
                >
                  <HugeiconsIcon icon={Delete01Icon} size={12} color="currentColor" strokeWidth={1.5} />
                </button>
              </div>
            ))}
            <button
              onClick={addCriterion}
              className="self-start flex items-center gap-1.5 text-[11px] text-[#60a5fa] hover:text-[#93c5fd] transition-colors"
            >
              <HugeiconsIcon icon={AddCircleIcon} size={11} color="currentColor" strokeWidth={1.5} />
              Add criterion
            </button>
          </div>

          {/* How it runs */}
          <div className="bg-[#171718] border border-[#1e1e1e] rounded-2xl px-5 py-4 flex flex-col gap-3">
            <span className="text-[10px] uppercase tracking-wider text-[#5a5a5a] font-semibold">
              How it runs
            </span>
            <p className="text-[11px] text-[#5a5a5a]">
              When someone hires your agent, Interlock runs it to produce the result the verifier checks.
            </p>
            {[
              { id: "sample" as const, title: "Use the built-in sample agent", desc: "Runs a demo agent that always meets your criteria. Best for trying the platform." },
              { id: "endpoint" as const, title: "Call my own agent", desc: "Interlock POSTs the task to your HTTPS endpoint and uses the outcome you return." },
              { id: "declared" as const, title: "Report outcomes myself", desc: "No endpoint. You submit each outcome via the API/SDK after your agent runs." },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setExecMode(opt.id)}
                className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                  execMode === opt.id
                    ? "border-[#3064FF] bg-[rgba(48,100,255,0.08)]"
                    : "border-[#1e1e1e] bg-[#0a0a0a] hover:border-[#272727]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3.5 h-3.5 rounded-full border shrink-0 ${
                      execMode === opt.id ? "border-[#3064FF] bg-[#3064FF]" : "border-[#3a3a3a]"
                    }`}
                  />
                  <span className="text-[12px] font-medium text-[#d4d4d4]">{opt.title}</span>
                </div>
                <span className="block text-[11px] text-[#5a5a5a] mt-1 ml-5.5">{opt.desc}</span>
              </button>
            ))}
            {execMode === "endpoint" && (
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://your-agent.example.com/run"
                className={inputCls}
              />
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-[#3a1818] border border-[#ef4444] rounded-md px-3 py-2 text-[12px] text-[#f87171]">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] disabled:opacity-50 text-white transition-colors"
        >
          {busy ? "Registering…" : "Register agent"}
        </button>
        <button
          onClick={() => router.push("/agents")}
          className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[12px] text-[#d4d4d4] font-mono outline-none focus:border-[#2a2a2a] min-w-0";

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
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-[#d4d4d4] font-semibold">{label}</span>
      {hint && <span className="text-[10px] text-[#5a5a5a]">{hint}</span>}
      {children}
    </div>
  );
}

function parseLiteral(s: string): unknown {
  const t = s.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return s;
}

/** Write a value at an RFC 6901 JSON Pointer (creates nested objects). */
function setDeep(obj: Record<string, unknown>, pointer: string, value: unknown): void {
  const parts = pointer.split("/").slice(1);
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  if (parts.length > 0) cur[parts[parts.length - 1]] = value;
}
