// @interlock/sdk — TypeScript SDK for Interlock (billing AI on outcomes, settled
// on Avalanche).
//
// The `InterlockClient` HTTP client at the bottom is the real, working path an
// agent uses today: it drives the full lifecycle server-side over your API
// key, so the agent side needs no blockchain library. The `Interlock` class is
// a preview surface for driving the contract directly.

// ─── Success criteria DSL types ─────────────────────────────────────────────

export type ExactCriterion = { type: "exact"; path: string; value: unknown };
export type RegexCriterion = { type: "regex"; path: string; pattern: string; flags?: string };
export type JsonSchemaCriterion = { type: "json_schema"; schema: unknown };
export type NumericThresholdCriterion = {
  type: "numeric_threshold";
  path: string;
  op: "<" | "<=" | ">" | ">=" | "==" | "!=";
  value: number;
};
export type SemanticMatchCriterion = {
  type: "semantic_match";
  path: string;
  expected: string;
  threshold: number;
};
export type AllOfCriterion = { type: "all_of"; criteria: SuccessCriterion[] };
export type AnyOfCriterion = { type: "any_of"; criteria: SuccessCriterion[] };
export type NotCriterion = { type: "not"; criterion: SuccessCriterion };

export type SuccessCriterion =
  | ExactCriterion
  | RegexCriterion
  | JsonSchemaCriterion
  | NumericThresholdCriterion
  | SemanticMatchCriterion
  | AllOfCriterion
  | AnyOfCriterion
  | NotCriterion;

// ─── Cost / split shapes ────────────────────────────────────────────────────

export type CostCategory = 0 | 1 | 2 | 3; // 0=model, 1=tool, 2=human, 3=compute

export type CostItem = {
  provider: string;
  category: CostCategory;
  units: number;
  amount: number; // USDC base units (6 decimals): 1 USDC = 1_000_000
};

export type SplitRole = 0 | 1 | 2 | 3 | 4; // 0=agent_co, 1=model, 2=tool, 3=human, 4=platform

export type Split = {
  recipient: string;
  amount: number;
  role: SplitRole;
};

// ─── High-level facade ──────────────────────────────────────────────────────

export type InterlockOptions = {
  /** Avalanche RPC endpoint. Defaults to Fuji testnet. */
  rpcUrl?: string;
  /** WeaveosCore contract address on the chosen network. */
  coreAddress: string;
  /** Customer signing key (0x-hex ECDSA private key). */
  customerPrivkey: string;
  /** URL of the verifier service. */
  verifierUrl?: string;
  /** ID of the product the workflows target. */
  productId: number;
};

export type StartWorkflowArgs = {
  successCriteria: SuccessCriterion;
  /** Quote price in coin base units. */
  priceBaseUnits: number;
  /** Quote expiry in ms since epoch. Defaults to +24h. */
  expiresAtMs?: number;
};

/**
 * Low-level SDK facade for driving the contract directly (advanced). Most
 * integrations should use `InterlockClient` instead, which runs the whole
 * lifecycle server-side over HTTP. This class is a preview surface; the
 * direct-contract runtime lands in a later release.
 *
 * @example
 * ```ts
 * import { Interlock } from "@interlock/sdk";
 *
 * const wos = new Interlock({
 *   coreAddress: "0x27C23b…",
 *   productId: 1,
 *   customerPrivkey: process.env.INTERLOCK_CUSTOMER_PRIVKEY!,
 * });
 * ```
 */
export class Interlock {
  public readonly opts: InterlockOptions;

  constructor(opts: InterlockOptions) {
    this.opts = {
      rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
      ...opts,
    };
  }

  public readonly workflows = {
    /**
     * Stage 1+2 in one call: creates a quote and locks USDC in escrow.
     * Returns a handle for recording costs + completing.
     *
     * **Preview.** Use `InterlockClient` (HTTP) for the working end-to-end path.
     */
    start: (_args: StartWorkflowArgs): Promise<WorkflowHandle> => {
      throw new Error(
        "Interlock.workflows.start (direct-contract mode) is a preview. " +
          "Use InterlockClient for the working HTTP lifecycle. See README.md.",
      );
    },
  };
}

/** Returned by `Interlock.workflows.start`. */
export interface WorkflowHandle {
  readonly id: string;
  recordCost(item: CostItem): Promise<void>;
  complete(args: { outcome: unknown; artifact?: Uint8Array }): Promise<void>;
}

// ─── HTTP client (the path agents actually use today) ───────────────────────

export type InterlockClientOptions = {
  /** Your API key from /developer (prefix `wos_…`). */
  apiKey: string;
  /** Interlock API base URL. Defaults to https://app.interlock.dev */
  baseUrl?: string;
};

export type StartWorkflowParams = {
  /** Quote price in USDC base units (e.g. 10_000_000 = 10 USDC). */
  priceBaseUnits: number;
  /** Success criteria — what makes the outcome "right". */
  criteria: SuccessCriterion;
  /** The agent's claimed outcome that the verifier will check. */
  outcome: Record<string, unknown>;
  /** Cost items the agent burned during execution. */
  costItems?: CostItem[];
  /** Seconds the customer has to dispute before settlement fires. */
  disputeWindowSeconds?: number;
  /** Override the default product (otherwise the platform's default). */
  productId?: string;
};

export type LifecycleEvent =
  | { event: "start"; data: { caller: string; customer: string; productId: string; priceBaseUnits: number; disputeWindowSeconds: number } }
  | { event: "stage"; data: { stage: string; status: "started" | "done"; [k: string]: unknown } }
  | { event: "complete"; data: { workflowId: string; settlementId: string; workflowExplorer: string; settlementExplorer: string; [k: string]: unknown } }
  | { event: "error"; data: { message: string } };

/**
 * HTTP-only Interlock client. Use this from an agent process to drive workflows
 * end-to-end against a hosted Interlock deployment. Authentication is via your
 * API key — no on-chain signing needed on the agent side.
 *
 * @example
 * ```ts
 * import { InterlockClient } from "@interlock/sdk";
 *
 * const wos = new InterlockClient({ apiKey: process.env.INTERLOCK_API_KEY! });
 *
 * for await (const ev of wos.workflows.start({
 *   priceBaseUnits: 10_000_000,
 *   criteria: { type: "exact", path: "/ticket_status", value: "closed" },
 *   outcome: { ticket_status: "closed", refund_amount: 47.5 },
 * })) {
 *   console.log(ev.event, ev.data);
 *   if (ev.event === "complete") console.log("workflow", ev.data.workflowId);
 * }
 * ```
 */
export class InterlockClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: InterlockClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://app.interlock.dev").replace(/\/$/, "");
  }

  public readonly workflows = {
    /**
     * Kick off a workflow lifecycle on the hosted Interlock server. Returns an
     * async iterable of stage events streamed back over NDJSON. Iterate to
     * watch progress or `await` the final complete/error event.
     */
    start: (params: StartWorkflowParams): AsyncIterable<LifecycleEvent> => {
      return this._streamLifecycle(params);
    },
  };

  private async *_streamLifecycle(
    params: StartWorkflowParams,
  ): AsyncIterable<LifecycleEvent> {
    const resp = await fetch(`${this.baseUrl}/api/workflows/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(params),
    });
    if (!resp.ok || !resp.body) {
      const text = await resp.text().catch(() => "");
      throw new Error(`workflows.start ${resp.status}: ${text || resp.statusText}`);
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl = buf.indexOf("\n");
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) yield JSON.parse(line) as LifecycleEvent;
        nl = buf.indexOf("\n");
      }
    }
  }
}
