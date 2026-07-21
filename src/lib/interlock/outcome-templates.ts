// Starter templates per agent.
//
// So the user never starts from a blank box. Every template is grounded in the
// agent's own declared fields (outcome-schema.ts) — a template can only
// reference a field that actually exists — and ships pre-compiled, so selecting
// one needs no LLM call. The user then edits it in natural language or the
// advanced view.

import type { AgentOutcomeSchema, OutcomeField } from "./outcome-schema";
import {
  type CompiledOutcomeDefinition,
  type DefinitionCondition,
  buildDefinition,
  summarizeDefinition,
} from "./outcome-nl";

export type OutcomeTemplate = {
  id: string;
  title: string;
  description: string;
  /** Editable NL seed shown in the input when the template is picked. */
  nlPrompt: string;
  /** Pre-compiled definition — selecting the template is instant, no LLM. */
  definition: CompiledOutcomeDefinition;
  /** Deterministic plain-English summary, so the confirmation step needs no
   *  server round-trip when a template is selected. */
  summary: string;
};

function withSummary(t: Omit<OutcomeTemplate, "summary">): OutcomeTemplate {
  return { ...t, summary: summarizeDefinition(t.definition) };
}

/** Heuristic: a good "trigger" field is a short string/boolean status-like
 *  field with a sample value we can pin an `equals` to. */
function statusLikeFields(schema: AgentOutcomeSchema): OutcomeField[] {
  return schema.fields.filter(
    (f) =>
      (f.type === "string" || f.type === "boolean") &&
      f.example !== undefined &&
      f.example !== null &&
      /status|state|result|closed|done|complete|paid|hired|verdict|success/i.test(
        `${f.name} ${String(f.example)}`,
      ),
  );
}

function numericFields(schema: AgentOutcomeSchema): OutcomeField[] {
  return schema.fields.filter((f) => f.type === "number" && f.example !== undefined);
}

function condEquals(f: OutcomeField): DefinitionCondition {
  return {
    pointer: f.pointer,
    operator: "equals",
    value: f.example as string | number | boolean,
    description: `${f.name} is ${JSON.stringify(f.example)}`,
  };
}

/** Produce grounded starter templates for an agent. Always safe (all
 *  conditions reference real fields); returns [] only if the agent declared no
 *  usable fields, in which case the UI just shows the blank NL box. */
export function starterTemplatesForAgent(schema: AgentOutcomeSchema): OutcomeTemplate[] {
  const templates: Array<Omit<OutcomeTemplate, "summary">> = [];
  const statuses = statusLikeFields(schema);
  const numerics = numericFields(schema);

  // 1) Simple "trigger fired" — first status-like field equals its sample.
  if (statuses[0]) {
    const f = statuses[0];
    templates.push({
      id: "trigger-only",
      title: `Standard: ${f.name} reached`,
      description: `Bill when ${f.name} is ${JSON.stringify(f.example)}.`,
      nlPrompt: `Count it as done when ${f.name} is ${JSON.stringify(f.example)}`,
      definition: buildDefinition({
        triggerEvent: `${f.name} = ${JSON.stringify(f.example)}`,
        conditions: [condEquals(f)],
      }),
    });
  }

  // 2) Trigger + a numeric guard (e.g. status closed AND amount under a cap).
  if (statuses[0] && numerics[0]) {
    const s = statuses[0];
    const n = numerics[0];
    const cap = typeof n.example === "number" ? n.example : 0;
    const guard: DefinitionCondition = {
      pointer: n.pointer,
      operator: "less_or_equal",
      value: cap,
      description: `${n.name} is at most ${cap}`,
    };
    templates.push({
      id: "trigger-plus-guard",
      title: `Strict: ${s.name} + ${n.name} cap`,
      description: `Bill when ${s.name} is ${JSON.stringify(s.example)} and ${n.name} ≤ ${cap}.`,
      nlPrompt: `Pay when ${s.name} is ${JSON.stringify(s.example)} and ${n.name} is at most ${cap}`,
      definition: buildDefinition({
        triggerEvent: `${s.name} = ${JSON.stringify(s.example)}`,
        conditions: [condEquals(s), guard],
      }),
    });
  }

  // 3) Retention-style: trigger now, watched for a reversal over a window. Only
  //    offered when there's a second status-like field to serve as the reversal
  //    signal (e.g. a "terminated"/"reopened" flag).
  if (statuses.length >= 2) {
    const trigger = statuses[0];
    const reversalField = statuses[1];
    templates.push({
      id: "retention-window",
      title: `Retention: ${trigger.name}, held ${90} days`,
      description: `Bill when ${trigger.name} fires and ${reversalField.name} does not flip within 90 days.`,
      nlPrompt: `Pay when ${trigger.name} is ${JSON.stringify(trigger.example)} and it isn't reversed within 90 days`,
      definition: buildDefinition({
        triggerEvent: `${trigger.name} = ${JSON.stringify(trigger.example)}`,
        conditions: [condEquals(trigger)],
        reversal: condEquals(reversalField),
        verificationWindowSeconds: 90 * 86400,
      }),
    });
  }

  return templates.map(withSummary);
}
