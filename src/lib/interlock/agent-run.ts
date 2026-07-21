// Running a registered agent for real.
//
// When an agent has an execution endpoint, the platform POSTs the task to it,
// the agent's own code does the work, and it returns the outcome + costs.
// That real outcome is what the verifier then checks against the criteria —
// so the agent genuinely earns its payment rather than a human hand-typing a
// result. Agents without an endpoint are "declared-only": they fall back to
// the sample outcome they registered.
//
// Contract with the agent endpoint:
//   POST { taskInput, criteria, priceBaseUnits, workflowHint }
//   → 200 { outcome: object, costItems?: [{ provider, category, units, amount }] }

import { ethers } from "ethers";
import type { SuccessCriterion } from "./dsl";

const EXECUTION_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

export type AgentCostItem = {
  provider: string;
  category: number; // 0 model | 1 tool | 2 human | 3 compute
  units: number;
  amount: number; // USDC base units
};

export type AgentRunResult = {
  outcome: Record<string, unknown>;
  costItems: AgentCostItem[];
  /** How the outcome was produced, for display + audit. */
  source: "endpoint" | "declared";
};

/**
 * Basic SSRF guard for user-supplied execution URLs. Requires https and blocks
 * obvious internal hosts. Not a complete defense (DNS rebinding etc.), but
 * enough to stop the easy cases on a testnet MVP.
 */
export function isSafeExecutionUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  // In local dev, allow http + localhost so the built-in sample agent (served
  // from this same app) works without TLS. Production requires public https.
  if (process.env.NODE_ENV !== "production") {
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return true;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    // RFC1918 / link-local literals
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return false;
  }
  return true;
}

/**
 * Run the agent. If `endpoint` is set, call it and use its real result.
 * Otherwise return the declared sample outcome. Never throws for a "declared"
 * agent; throws if a configured endpoint fails so the caller can surface it.
 */
export async function runAgent(params: {
  endpoint: string | null;
  declaredOutcome: Record<string, unknown>;
  taskInput: unknown;
  criteria: SuccessCriterion;
  priceBaseUnits: number;
  workflowId?: string;
}): Promise<AgentRunResult> {
  if (!params.endpoint) {
    return { outcome: params.declaredOutcome ?? {}, costItems: [], source: "declared" };
  }
  if (!isSafeExecutionUrl(params.endpoint)) {
    throw new Error("agent execution endpoint is not a safe public https URL");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXECUTION_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(params.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "interlock-runner/1" },
      body: JSON.stringify({
        taskInput: params.taskInput,
        criteria: params.criteria,
        priceBaseUnits: params.priceBaseUnits,
        workflowHint: params.workflowId,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error(`agent endpoint timed out after ${EXECUTION_TIMEOUT_MS}ms`);
    }
    throw new Error(`agent endpoint unreachable: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`agent endpoint returned ${resp.status}: ${text.slice(0, 200)}`);
  }

  const raw = await resp.text();
  if (raw.length > MAX_RESPONSE_BYTES) {
    throw new Error("agent response too large");
  }
  let parsed: { outcome?: unknown; costItems?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("agent endpoint did not return valid JSON");
  }
  if (!parsed.outcome || typeof parsed.outcome !== "object") {
    throw new Error("agent endpoint response is missing an 'outcome' object");
  }

  const costItems = sanitizeCostItems(parsed.costItems);
  return {
    outcome: parsed.outcome as Record<string, unknown>,
    costItems,
    source: "endpoint",
  };
}

/**
 * Validate + normalize cost items the agent reported. Items with an
 * unrecognized or unregistered-provider shape are demoted to "compute"
 * (category 3), which the settlement absorbs into the agent's own share —
 * so a malformed cost line can never redirect money to an arbitrary address.
 */
function sanitizeCostItems(raw: unknown): AgentCostItem[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentCostItem[] = [];
  for (const item of raw.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const provider = typeof c.provider === "string" ? c.provider : "";
    const amount = Number(c.amount);
    const units = Number(c.units) || 0;
    let category = Number(c.category);
    if (![0, 1, 2, 3].includes(category)) category = 3;
    if (!Number.isFinite(amount) || amount < 0) continue;
    // A provider that isn't a valid address can't be paid — absorb as compute.
    if (!ethers.isAddress(provider)) {
      out.push({ provider: ethers.ZeroAddress, category: 3, units, amount });
    } else {
      out.push({ provider, category, units, amount });
    }
  }
  return out;
}
