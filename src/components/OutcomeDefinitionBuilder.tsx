"use client";

// Guided, natural-language outcome-definition builder.
//
// The default entry point for defining a billable outcome, replacing the raw
// code-snippet box. The workflow (agent) is already chosen, so everything here
// is grounded in THAT agent's real outcome fields — the user types plain
// English, sees a plain-English confirmation of what will run, can test it
// against sample data, and can drop into an advanced structured view. The
// verifier only ever executes the compiled `criterion`.
//
// This component talks only to /api/outcome-definitions/* — it never imports
// the server-only LLM code, so the AI SDK stays out of the client bundle.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiMagicIcon,
  CheckmarkCircleIcon,
  AlertDiamondIcon,
  PlayCircleIcon,
  Timer01Icon,
  Layers01Icon,
  FloppyDiskIcon,
} from "@hugeicons/core-free-icons";

// ── Local mirrors of the server types (kept minimal on purpose) ──────────────

type OutcomeField = {
  pointer: string;
  name: string;
  type: string;
  example?: unknown;
  fromTemplateOnly?: boolean;
};
type AgentOutcomeSchema = {
  agentId: number;
  agentSlug: string;
  agentName: string;
  fields: OutcomeField[];
  exampleOutcome: Record<string, unknown>;
};
type DefinitionCondition = {
  pointer: string;
  operator: string;
  value: string | number | boolean;
  description: string;
};
type CompiledOutcomeDefinition = {
  triggerEvent: string;
  conditions: DefinitionCondition[];
  reversal: DefinitionCondition | null;
  reversalRule: string | null;
  verificationWindowSeconds: number | null;
  criterion: unknown;
};
type OutcomeTemplate = {
  id: string;
  title: string;
  description: string;
  nlPrompt: string;
  definition: CompiledOutcomeDefinition;
  summary: string;
};
type EvalStep = { type: string; path?: string; actual?: unknown; matched: boolean; reason?: string };

const OP_SYMBOL: Record<string, string> = {
  equals: "=",
  not_equals: "≠",
  greater_than: ">",
  less_than: "<",
  greater_or_equal: "≥",
  less_or_equal: "≤",
  matches_regex: "~",
};

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `request failed (${res.status})`);
  return json as T;
}

export function OutcomeDefinitionBuilder({ agentSlug }: { agentSlug: string }) {
  const [schema, setSchema] = useState<AgentOutcomeSchema | null>(null);
  const [templates, setTemplates] = useState<OutcomeTemplate[]>([]);
  const [llmConfigured, setLlmConfigured] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nlInput, setNlInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "clarify" | "config"; title: string; body: string } | null>(null);

  const [definition, setDefinition] = useState<CompiledOutcomeDefinition | null>(null);
  const [summary, setSummary] = useState("");

  const [refineInput, setRefineInput] = useState("");

  const [testResult, setTestResult] = useState<{ wouldFire: boolean; steps: EvalStep[]; source: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [useCustomOutcome, setUseCustomOutcome] = useState(false);
  const [customOutcomeText, setCustomOutcomeText] = useState("");

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedText, setAdvancedText] = useState("");
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);

  // Load the agent's field schema + templates.
  useEffect(() => {
    let alive = true;
    api<{ schema: AgentOutcomeSchema; templates: OutcomeTemplate[]; llmConfigured: boolean }>(
      `/api/outcome-definitions/schema?agent=${encodeURIComponent(agentSlug)}`,
    )
      .then((d) => {
        if (!alive) return;
        setSchema(d.schema);
        setTemplates(d.templates);
        setLlmConfigured(d.llmConfigured);
        setCustomOutcomeText(JSON.stringify(d.schema.exampleOutcome ?? {}, null, 2));
      })
      .catch((e) => alive && setLoadError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [agentSlug]);

  const dirtyReset = () => {
    setTestResult(null);
    setSavedId(null);
  };

  function applyDefinition(def: CompiledOutcomeDefinition, sum: string) {
    setDefinition(def);
    setSummary(sum);
    setAdvancedText(JSON.stringify(def.criterion, null, 2));
    setAdvancedError(null);
    setNotice(null);
    dirtyReset();
  }

  async function translate(text: string, prior?: CompiledOutcomeDefinition) {
    if (!text.trim() || !schema) return;
    setParsing(true);
    setNotice(null);
    try {
      const r = await api<
        | { status: "ok"; definition: CompiledOutcomeDefinition; summary: string }
        | { status: "needs_clarification"; question: string; reason: string }
        | { status: "needs_config"; message: string }
        | { status: "error"; message: string }
      >("/api/outcome-definitions/parse", { agentSlug, text, prior });

      if (r.status === "ok") {
        applyDefinition(r.definition, r.summary);
      } else if (r.status === "needs_clarification") {
        setNotice({ kind: "clarify", title: "One thing to clarify", body: r.question });
      } else if (r.status === "needs_config") {
        setNotice({ kind: "config", title: "Natural-language parsing is off", body: r.message });
      } else {
        setNotice({ kind: "error", title: "Couldn't parse that", body: r.message });
      }
    } catch (e) {
      setNotice({ kind: "error", title: "Request failed", body: (e as Error).message });
    } finally {
      setParsing(false);
    }
  }

  function selectTemplate(t: OutcomeTemplate) {
    setNlInput(t.nlPrompt);
    applyDefinition(t.definition, t.summary);
  }

  async function runTest() {
    if (!definition) return;
    setTesting(true);
    setTestResult(null);
    try {
      let outcome: unknown | undefined;
      if (useCustomOutcome) {
        try {
          outcome = JSON.parse(customOutcomeText);
        } catch (e) {
          setNotice({ kind: "error", title: "Sample outcome isn't valid JSON", body: (e as Error).message });
          setTesting(false);
          return;
        }
      }
      const r = await api<{ wouldFire: boolean; steps: EvalStep[]; source: string }>(
        "/api/outcome-definitions/test",
        { agentSlug, criterion: definition.criterion, ...(useCustomOutcome ? { outcome } : {}) },
      );
      setTestResult(r);
    } catch (e) {
      setNotice({ kind: "error", title: "Test failed", body: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function applyAdvanced() {
    setAdvancedError(null);
    let criterion: unknown;
    try {
      criterion = JSON.parse(advancedText);
    } catch (e) {
      setAdvancedError(`Invalid JSON: ${(e as Error).message}`);
      return;
    }
    try {
      const r = await api<{ definition: CompiledOutcomeDefinition; summary: string; decomposed: boolean }>(
        "/api/outcome-definitions/compile",
        { agentSlug, criterion },
      );
      applyDefinition(r.definition, r.summary);
      setAdvancedOpen(true);
    } catch (e) {
      setAdvancedError((e as Error).message);
    }
  }

  async function save() {
    if (!definition) return;
    setSaving(true);
    try {
      const r = await api<{ ok: boolean; definition: { id: number } }>("/api/outcome-definitions", {
        agentSlug,
        nlInput: nlInput.trim() || summary,
        definition,
      });
      setSavedId(r.definition.id);
    } catch (e) {
      setNotice({ kind: "error", title: "Save failed", body: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const windowDays = useMemo(
    () => (definition?.verificationWindowSeconds ? Math.round(definition.verificationWindowSeconds / 86400) : null),
    [definition],
  );

  if (loadError) {
    return (
      <div className="rounded-xl border border-[#3a1818] bg-[#1a0e0e] px-4 py-3 text-[13px] text-[#f87171]">
        Couldn&apos;t load this agent: {loadError}
      </div>
    );
  }
  if (!schema) {
    return <div className="text-[13px] text-[#5a5a5a]">Loading outcome schema…</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={AiMagicIcon} size={16} color="#3064FF" strokeWidth={1.5} />
          <h2 className="text-[15px] font-semibold text-white">Define what you get paid for</h2>
        </div>
        <p className="mt-1 text-[12px] text-[#8a8a8a]">
          Describe the outcome for <span className="text-[#d4d4d4]">{schema.agentName}</span> in plain English.
          It&apos;s checked only against fields this agent actually produces — no invented data.
        </p>
      </div>

      {/* Field catalog (grounding, visible for trust) */}
      <details className="rounded-xl border border-[#1e1e1e] bg-[#0e0e0e]">
        <summary className="cursor-pointer px-4 py-2.5 text-[12px] text-[#a3a3a3]">
          Fields available for this agent ({schema.fields.length})
        </summary>
        <div className="border-t border-[#1e1e1e] px-4 py-3 flex flex-wrap gap-2">
          {schema.fields.length === 0 && (
            <span className="text-[12px] text-[#5a5a5a]">This agent hasn&apos;t declared any outcome fields.</span>
          )}
          {schema.fields.map((f) => (
            <span
              key={f.pointer}
              className="rounded-md border border-[#242424] bg-[#141414] px-2 py-1 text-[11px] font-mono text-[#c4c4c4]"
              title={f.fromTemplateOnly ? "from criteria template" : `example: ${JSON.stringify(f.example)}`}
            >
              {f.pointer} <span className="text-[#5a5a5a]">· {f.type}</span>
            </span>
          ))}
        </div>
      </details>

      {/* Starter templates */}
      {templates.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-medium text-[#d4d4d4]">Start from a template</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTemplate(t)}
                className="text-left rounded-xl border border-[#1e1e1e] bg-[#111113] px-3 py-2.5 hover:border-[#2c3550] transition-colors"
              >
                <div className="text-[12px] font-medium text-[#e4e4e4]">{t.title}</div>
                <div className="mt-0.5 text-[11px] text-[#7a7a7a]">{t.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* NL input */}
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-medium text-[#d4d4d4]">Describe the outcome</span>
        <textarea
          value={nlInput}
          onChange={(e) => setNlInput(e.target.value)}
          rows={3}
          placeholder="Pay us when a ticket is marked closed and the refund is under $100"
          className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] outline-none focus:border-[#2a2a2a] resize-none"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => translate(nlInput)}
            disabled={parsing || !nlInput.trim() || !llmConfigured}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] disabled:opacity-40 text-white transition-colors"
          >
            <HugeiconsIcon icon={AiMagicIcon} size={14} color="currentColor" strokeWidth={1.5} />
            {parsing ? "Translating…" : "Translate to a definition"}
          </button>
          {!llmConfigured && (
            <span className="text-[11px] text-[#b08a4a]">
              NL parsing is off in this environment — use a template or the advanced view.
            </span>
          )}
        </div>
      </div>

      {/* Notices: clarification / config / error */}
      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-[12px] ${
            notice.kind === "clarify"
              ? "border-[#3a3416] bg-[#16150c] text-[#d9c98a]"
              : notice.kind === "config"
                ? "border-[#1e2a3a] bg-[#0c1016] text-[#8fb2d9]"
                : "border-[#3a1818] bg-[#160c0c] text-[#e29a9a]"
          }`}
        >
          <div className="flex items-center gap-1.5 font-medium">
            <HugeiconsIcon icon={AlertDiamondIcon} size={13} color="currentColor" strokeWidth={1.5} />
            {notice.title}
          </div>
          <div className="mt-1 leading-relaxed">{notice.body}</div>
          {notice.kind === "clarify" && (
            <div className="mt-2 text-[11px] text-[#9a8f5a]">
              Edit your description above to answer, then translate again.
            </div>
          )}
        </div>
      )}

      {/* Confirmation — the trust layer */}
      {definition && (
        <div className="rounded-xl border border-[#233043] bg-[#0c1118] px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon icon={CheckmarkCircleIcon} size={15} color="#5aa9ff" strokeWidth={1.5} />
            <span className="text-[13px] font-semibold text-[#cfe0f5]">Confirm what will go live</span>
          </div>
          <p className="text-[14px] leading-relaxed text-[#e7eef8]">{summary}</p>

          {/* Structured conditions */}
          {definition.conditions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {definition.conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] font-mono">
                  <span className="text-[#7a8aa0]">{c.pointer}</span>
                  <span className="text-[#5aa9ff]">{OP_SYMBOL[c.operator] ?? c.operator}</span>
                  <span className="text-[#d4d4d4]">{JSON.stringify(c.value)}</span>
                </div>
              ))}
              {definition.reversal && (
                <div className="flex items-center gap-2 text-[12px] font-mono">
                  <span className="text-[#c07a7a]">NOT</span>
                  <span className="text-[#7a8aa0]">{definition.reversal.pointer}</span>
                  <span className="text-[#5aa9ff]">{OP_SYMBOL[definition.reversal.operator] ?? definition.reversal.operator}</span>
                  <span className="text-[#d4d4d4]">{JSON.stringify(definition.reversal.value)}</span>
                  {windowDays != null && (
                    <span className="inline-flex items-center gap-1 text-[#8a8a8a]">
                      <HugeiconsIcon icon={Timer01Icon} size={11} color="currentColor" strokeWidth={1.5} />
                      within {windowDays}d
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Conversational refine */}
          <div className="flex items-center gap-2 pt-1">
            <input
              value={refineInput}
              onChange={(e) => setRefineInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && refineInput.trim()) {
                  translate(refineInput, definition);
                  setRefineInput("");
                }
              }}
              placeholder="Refine: “make it 60 days instead”"
              className="flex-1 bg-[#0a0d12] border border-[#1e2836] rounded-md px-3 py-1.5 text-[12px] text-[#d4d4d4] outline-none focus:border-[#2a3a52]"
            />
            <button
              onClick={() => {
                if (refineInput.trim()) {
                  translate(refineInput, definition);
                  setRefineInput("");
                }
              }}
              disabled={parsing || !llmConfigured || !refineInput.trim()}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-[#1a2740] border border-[#243449] text-[#a9c4e6] hover:text-white disabled:opacity-40 transition-colors"
            >
              Refine
            </button>
          </div>
        </div>
      )}

      {/* Test against sample */}
      {definition && (
        <div className="rounded-xl border border-[#1e1e1e] bg-[#0e0e0e] px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <HugeiconsIcon icon={PlayCircleIcon} size={15} color="#5DCAA5" strokeWidth={1.5} />
              <span className="text-[13px] font-semibold text-[#d4d4d4]">Test against sample data</span>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-[#8a8a8a]">
              <input
                type="checkbox"
                checked={useCustomOutcome}
                onChange={(e) => setUseCustomOutcome(e.target.checked)}
                className="accent-[#3064FF]"
              />
              Use a custom outcome
            </label>
          </div>

          {useCustomOutcome ? (
            <textarea
              value={customOutcomeText}
              onChange={(e) => setCustomOutcomeText(e.target.value)}
              rows={6}
              className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[12px] font-mono text-[#d4d4d4] outline-none focus:border-[#2a2a2a] resize-none"
            />
          ) : (
            <p className="text-[11px] text-[#7a7a7a]">
              Runs against {schema.agentName}&apos;s declared sample outcome.
            </p>
          )}

          <div>
            <button
              onClick={runTest}
              disabled={testing}
              className="px-3 py-2 rounded-full text-[12px] font-medium bg-[#14241d] border border-[#1f3a2e] text-[#8fe0be] hover:text-white disabled:opacity-40 transition-colors"
            >
              {testing ? "Running…" : "Run test"}
            </button>
          </div>

          {testResult && (
            <div className="flex flex-col gap-2">
              <div
                className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium ${
                  testResult.wouldFire
                    ? "bg-[#12251c] text-[#7fe0b6] border border-[#1f4030]"
                    : "bg-[#251616] text-[#e29a9a] border border-[#402020]"
                }`}
              >
                <HugeiconsIcon
                  icon={testResult.wouldFire ? CheckmarkCircleIcon : AlertDiamondIcon}
                  size={13}
                  color="currentColor"
                  strokeWidth={1.5}
                />
                {testResult.wouldFire ? "Would settle (fires) ✓" : "Would NOT fire — refund path"}
                <span className="text-[#6a6a6a] font-normal">
                  · {testResult.source === "provided" ? "custom outcome" : "agent sample"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {testResult.steps.filter((s) => s.path).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
                    <span className={s.matched ? "text-[#7fe0b6]" : "text-[#e29a9a]"}>
                      {s.matched ? "✓" : "✗"}
                    </span>
                    <span className="text-[#7a8aa0]">{s.path}</span>
                    <span className="text-[#6a6a6a]">actual: {JSON.stringify(s.actual)}</span>
                    {s.reason && <span className="text-[#b08a4a]">({s.reason})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced / structured escape hatch */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#0e0e0e]">
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 px-4 py-2.5 text-[12px] text-[#a3a3a3] hover:text-white transition-colors"
        >
          <HugeiconsIcon icon={Layers01Icon} size={13} color="currentColor" strokeWidth={1.5} />
          Advanced — edit the structured definition directly
          <span className="ml-auto text-[#5a5a5a]">{advancedOpen ? "hide" : "show"}</span>
        </button>
        {advancedOpen && (
          <div className="border-t border-[#1e1e1e] px-4 py-3 flex flex-col gap-2">
            <p className="text-[11px] text-[#7a7a7a]">
              This is the exact <span className="font-mono">SuccessCriterion</span> the verifier executes. Edits are
              re-validated against the agent&apos;s field schema.
            </p>
            <textarea
              value={advancedText || "{}"}
              onChange={(e) => setAdvancedText(e.target.value)}
              rows={10}
              spellCheck={false}
              className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-md px-3 py-2 text-[12px] font-mono text-[#d4d4d4] outline-none focus:border-[#2a2a2a] resize-none"
            />
            {advancedError && <span className="text-[11px] text-[#e29a9a]">{advancedError}</span>}
            <div>
              <button
                onClick={applyAdvanced}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white transition-colors"
              >
                Apply structured edit
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 border-t border-[#1e1e1e] pt-4">
        <button
          onClick={save}
          disabled={!definition || saving || savedId != null}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] disabled:opacity-40 text-white transition-colors"
        >
          <HugeiconsIcon icon={FloppyDiskIcon} size={14} color="currentColor" strokeWidth={1.5} />
          {saving ? "Saving…" : savedId != null ? "Saved ✓" : "Save definition"}
        </button>
        {savedId != null && (
          <span className="text-[12px] text-[#7fe0b6]">
            Saved as definition #{savedId}.{" "}
            <Link href={`/agents/${agentSlug}`} className="underline hover:text-white">
              Back to agent
            </Link>
          </span>
        )}
        {!definition && (
          <span className="text-[12px] text-[#5a5a5a]">Translate a description or pick a template to enable saving.</span>
        )}
      </div>
    </div>
  );
}
