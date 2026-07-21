// Natural-language → structured outcome definition.
//
// The guided flow's translation layer. A user who has already picked which
// agent they're verifying types plain English ("pay us when a ticket is closed
// and the refund is under $100"); this turns that into the SAME structured
// SuccessCriterion the deterministic verifier already executes.
//
// Division of labor (this is the whole point of the design):
//   • The LLM's ONLY job is translation + ambiguity-flagging. It is handed the
//     agent's real field catalog (outcome-schema.ts) as grounding and told to
//     use only those fields, or to ask a clarifying question. It never decides
//     what's billable and it is never in the verification path.
//   • compileConditions() + summarizeDefinition() are DETERMINISTIC. The
//     English summary shown to the user for confirmation is generated from the
//     validated structure, not from the model's prose, so "what you see" is
//     provably "what will run".
//   • validateCriterionAgainstSchema() (outcome-schema.ts) is the backstop: if
//     the model invents a field despite instructions, we convert the result to
//     a clarification instead of ever compiling it.

import { generateObject } from "ai";
import { z } from "zod";

import type { SuccessCriterion } from "./dsl";
import {
  type AgentOutcomeSchema,
  validateCriterionAgainstSchema,
} from "./outcome-schema";

// === Structured definition (human-facing shape) ===

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "greater_or_equal"
  | "less_or_equal"
  | "matches_regex";

export type DefinitionCondition = {
  /** Must be a pointer from the agent's field catalog. */
  pointer: string;
  operator: ConditionOperator;
  value: string | number | boolean;
  /** English gloss from the model, kept for the audit trail only. */
  description: string;
};

/** The compiled, validated definition. `criterion` is the executable artifact
 *  the verifier runs unchanged; everything else is human framing + audit. */
export type CompiledOutcomeDefinition = {
  triggerEvent: string;
  conditions: DefinitionCondition[];
  reversal: DefinitionCondition | null;
  reversalRule: string | null;
  verificationWindowSeconds: number | null;
  /** What the verification engine executes. Deterministic. */
  criterion: SuccessCriterion;
};

export type ParseResult =
  | { status: "ok"; definition: CompiledOutcomeDefinition }
  | { status: "needs_clarification"; question: string; reason: string }
  | { status: "needs_config"; message: string }
  | { status: "error"; message: string };

// === LLM configuration ===

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

/** The parse step needs the Vercel AI Gateway (plain "provider/model" routing).
 *  When it isn't configured, the UI falls back to templates + the advanced
 *  structured editor, which need no LLM — the flow degrades, never breaks. */
export function isLlmConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

function modelId(): string {
  return process.env.OUTCOME_NL_MODEL || DEFAULT_MODEL;
}

// === LLM output schema (constrained) ===

const operatorEnum = z.enum([
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "greater_or_equal",
  "less_or_equal",
  "matches_regex",
]);

const conditionSchema = z.object({
  pointer: z
    .string()
    .describe("RFC6901 JSON pointer. MUST be copied verbatim from the provided field list."),
  operator: operatorEnum,
  value: z.union([z.string(), z.number(), z.boolean()]),
  description: z.string().describe("Plain-English gloss of this single condition."),
});

const llmSchema = z.object({
  status: z
    .enum(["ok", "needs_clarification"])
    .describe("'needs_clarification' if the request references a concept no listed field can verify."),
  clarificationQuestion: z.string().nullable(),
  clarificationReason: z.string().nullable(),
  definition: z
    .object({
      triggerEvent: z
        .string()
        .describe("Short label for the primary event that makes this billable."),
      verificationWindowDays: z
        .number()
        .nullable()
        .describe("Days to watch for a reversal after the trigger; null if none."),
      conditions: z.array(conditionSchema),
      reversal: conditionSchema
        .nullable()
        .describe("A condition that, if it becomes true within the window, VOIDS the outcome."),
    })
    .nullable(),
});

type LlmOutput = z.infer<typeof llmSchema>;
type LlmCondition = z.infer<typeof conditionSchema>;

class CompileError extends Error {}

// === Deterministic compilation ===

function compileCondition(c: LlmCondition | DefinitionCondition): SuccessCriterion {
  const numericOps: Record<string, "<" | "<=" | ">" | ">=" > = {
    greater_than: ">",
    less_than: "<",
    greater_or_equal: ">=",
    less_or_equal: "<=",
  };
  switch (c.operator) {
    case "equals":
      return { type: "exact", path: c.pointer, value: c.value };
    case "not_equals":
      return { type: "not", criterion: { type: "exact", path: c.pointer, value: c.value } };
    case "matches_regex":
      return { type: "regex", path: c.pointer, pattern: String(c.value) };
    case "greater_than":
    case "less_than":
    case "greater_or_equal":
    case "less_or_equal": {
      const n = Number(c.value);
      if (!Number.isFinite(n)) {
        throw new CompileError(
          `condition on "${c.pointer}" needs a numeric value but got "${String(c.value)}"`,
        );
      }
      return { type: "numeric_threshold", path: c.pointer, op: numericOps[c.operator], value: n };
    }
    default: {
      const _exhaustive: never = c;
      throw new CompileError(`unknown operator: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Compose conditions (+ optional reversal, folded in as a `not`) into a single
 *  executable SuccessCriterion. */
export function compileCriterion(
  conditions: Array<LlmCondition | DefinitionCondition>,
  reversal: LlmCondition | DefinitionCondition | null,
): SuccessCriterion {
  const parts: SuccessCriterion[] = conditions.map(compileCondition);
  if (reversal) {
    // Success requires the reversal to NOT have occurred.
    parts.push({ type: "not", criterion: compileCondition(reversal) });
  }
  if (parts.length === 0) {
    throw new CompileError("no verifiable conditions were produced");
  }
  return parts.length === 1 ? parts[0] : { type: "all_of", criteria: parts };
}

/** Build a compiled definition from already-structured conditions (used by
 *  starter templates and the advanced editor — no LLM involved). */
export function buildDefinition(input: {
  triggerEvent: string;
  conditions: DefinitionCondition[];
  reversal?: DefinitionCondition | null;
  verificationWindowSeconds?: number | null;
}): CompiledOutcomeDefinition {
  const criterion = compileCriterion(input.conditions, input.reversal ?? null);
  return {
    triggerEvent: input.triggerEvent,
    conditions: input.conditions,
    reversal: input.reversal ?? null,
    reversalRule: input.reversal ? input.reversal.description : null,
    verificationWindowSeconds: input.verificationWindowSeconds ?? null,
    criterion,
  };
}

/** Best-effort inverse of compile: turn a SuccessCriterion back into editable
 *  conditions so a saved/template criterion can be shown in the guided view.
 *  Returns null for shapes the guided view can't represent (e.g. json_schema,
 *  nested any_of) — the advanced JSON editor handles those. */
export function decomposeCriterion(criterion: unknown): DefinitionCondition[] | null {
  const parts =
    criterion && typeof criterion === "object" && (criterion as { type?: string }).type === "all_of"
      ? ((criterion as { criteria?: unknown[] }).criteria ?? [])
      : [criterion];
  const out: DefinitionCondition[] = [];
  const numericBack: Record<string, ConditionOperator> = {
    ">": "greater_than",
    "<": "less_than",
    ">=": "greater_or_equal",
    "<=": "less_or_equal",
  };
  for (const raw of parts) {
    if (!raw || typeof raw !== "object") return null;
    const c = raw as Record<string, unknown>;
    if (c.type === "exact" && typeof c.path === "string") {
      out.push({ pointer: c.path, operator: "equals", value: c.value as never, description: "" });
    } else if (
      c.type === "not" &&
      c.criterion &&
      typeof c.criterion === "object" &&
      (c.criterion as Record<string, unknown>).type === "exact"
    ) {
      const inner = c.criterion as Record<string, unknown>;
      if (typeof inner.path !== "string") return null;
      out.push({ pointer: inner.path, operator: "not_equals", value: inner.value as never, description: "" });
    } else if (c.type === "numeric_threshold" && typeof c.path === "string") {
      const op = numericBack[String(c.op)];
      if (!op) return null;
      out.push({ pointer: c.path, operator: op, value: Number(c.value), description: "" });
    } else if (c.type === "regex" && typeof c.path === "string") {
      out.push({ pointer: c.path, operator: "matches_regex", value: String(c.pattern), description: "" });
    } else {
      return null;
    }
  }
  return out.length > 0 ? out : null;
}

// === Deterministic English summary (the trust layer) ===

function fieldLabel(pointer: string): string {
  return pointer.replace(/^\//, "").replace(/\//g, " › ") || "the outcome";
}

function quoteVal(v: unknown): string {
  return typeof v === "string" ? `“${v}”` : String(v);
}

function conditionEnglish(c: DefinitionCondition): string {
  const label = fieldLabel(c.pointer);
  switch (c.operator) {
    case "equals": return `${label} is ${quoteVal(c.value)}`;
    case "not_equals": return `${label} is not ${quoteVal(c.value)}`;
    case "greater_than": return `${label} is greater than ${quoteVal(c.value)}`;
    case "less_than": return `${label} is less than ${quoteVal(c.value)}`;
    case "greater_or_equal": return `${label} is at least ${quoteVal(c.value)}`;
    case "less_or_equal": return `${label} is at most ${quoteVal(c.value)}`;
    case "matches_regex": return `${label} matches the pattern ${quoteVal(c.value)}`;
  }
}

/** Render a compiled definition back to plain English for the confirmation
 *  step. Built entirely from the validated structure — never the LLM's prose. */
export function summarizeDefinition(def: CompiledOutcomeDefinition): string {
  const clauses = def.conditions.map(conditionEnglish);
  let text = `You'll be paid when: ${clauses.join(", and ")}`;
  if (def.reversal) {
    const window =
      def.verificationWindowSeconds != null
        ? ` within ${Math.round(def.verificationWindowSeconds / 86400)} days`
        : "";
    text += ` — provided ${conditionEnglish(def.reversal)}${window} does not happen`;
  }
  return `${text}.`;
}

// === Prompt construction ===

function fieldCatalog(schema: AgentOutcomeSchema): string {
  if (schema.fields.length === 0) {
    return "(this agent has not declared any outcome fields yet)";
  }
  return schema.fields
    .map((f) => {
      const ex = f.fromTemplateOnly
        ? "no sample value"
        : `example: ${JSON.stringify(f.example)}`;
      return `- ${f.pointer}  (type: ${f.type}, ${ex})`;
    })
    .join("\n");
}

function systemPrompt(schema: AgentOutcomeSchema): string {
  return `You translate a plain-English billing rule into a structured outcome definition for the "${schema.agentName}" agent.

The ONLY fields that exist for this agent's outcome are:
${fieldCatalog(schema)}

Rules:
- Every condition's "pointer" MUST be copied verbatim from the list above. Never invent, guess, or reword a field path.
- If the request depends on a concept none of these fields can verify (e.g. subjective quality like "good work", or a field that simply isn't listed), set status to "needs_clarification" and ask ONE specific question. Do not guess an interpretation.
- Each field is single-valued: one condition per field.
- Express any retention/verification window in whole days via verificationWindowDays.
- A "reversal" is an event that would VOID the outcome if it happens within the window (e.g. a termination, a chargeback, a reopened ticket).
- Use numeric operators only on numeric fields; use equals/matches_regex on strings.
- When you can fully ground the request, set status to "ok" and fill "definition".`;
}

function userPrompt(text: string, prior?: CompiledOutcomeDefinition): string {
  if (prior) {
    return `Here is the current structured definition:
${JSON.stringify({ triggerEvent: prior.triggerEvent, conditions: prior.conditions, reversal: prior.reversal, verificationWindowSeconds: prior.verificationWindowSeconds }, null, 2)}

The user wants to adjust it: "${text}"

Return the FULL updated definition (not just the delta).`;
  }
  return `Translate this billing rule: "${text}"`;
}

// === Public entry point ===

/** Parse (or conversationally refine) a natural-language rule into a compiled,
 *  schema-validated outcome definition. Never returns a definition that
 *  references a field outside the agent's catalog. */
export async function parseOutcomeDefinition(params: {
  text: string;
  schema: AgentOutcomeSchema;
  prior?: CompiledOutcomeDefinition;
}): Promise<ParseResult> {
  const text = params.text.trim();
  if (!text) return { status: "error", message: "Describe the outcome in a sentence first." };
  if (!isLlmConfigured()) {
    return {
      status: "needs_config",
      message:
        "Natural-language parsing needs the AI gateway (set AI_GATEWAY_API_KEY). Use a starter template or the advanced editor for now.",
    };
  }

  let out: LlmOutput;
  try {
    const res = await generateObject({
      model: modelId(),
      schema: llmSchema,
      system: systemPrompt(params.schema),
      prompt: userPrompt(text, params.prior),
      temperature: 0,
    });
    out = res.object;
  } catch (e) {
    return { status: "error", message: `parsing failed: ${(e as Error).message}` };
  }

  if (out.status === "needs_clarification" || !out.definition) {
    return {
      status: "needs_clarification",
      question:
        out.clarificationQuestion ??
        "I couldn't fully map that to this agent's data. Can you rephrase it in terms of the outcome fields?",
      reason: out.clarificationReason ?? "The description referenced something the schema can't verify.",
    };
  }

  const d = out.definition;

  // Compile deterministically. A bad operator/value pairing becomes a
  // clarification, never a silently-wrong criterion.
  let criterion: SuccessCriterion;
  try {
    criterion = compileCriterion(d.conditions, d.reversal ?? null);
  } catch (e) {
    return {
      status: "needs_clarification",
      question: `${(e as Error).message}. Could you clarify that part?`,
      reason: "The parsed conditions couldn't be compiled into a verifiable check.",
    };
  }

  // Backstop: reject anything referencing a field outside the catalog even if
  // the model ignored the instruction.
  const validation = validateCriterionAgainstSchema(criterion, params.schema);
  if (!validation.ok) {
    const bad = [...validation.invalidPointers, ...validation.unsupportedTypes];
    const known = params.schema.fields.slice(0, 8).map((f) => f.pointer).join(", ");
    return {
      status: "needs_clarification",
      question:
        validation.invalidPointers.length > 0
          ? `I couldn't find ${bad.join(", ")} in this agent's outcome data. Available fields include: ${known}. Which did you mean?`
          : `That relies on ${bad.join(", ")}, which the deterministic verifier can't check yet. Can you restate it using exact/numeric/regex conditions?`,
      reason: "Parsed definition referenced fields or checks the schema can't verify.",
    };
  }

  return {
    status: "ok",
    definition: {
      triggerEvent: d.triggerEvent,
      conditions: d.conditions,
      reversal: d.reversal ?? null,
      reversalRule: d.reversal ? d.reversal.description : null,
      verificationWindowSeconds:
        d.verificationWindowDays != null ? Math.round(d.verificationWindowDays * 86400) : null,
      criterion,
    },
  };
}
