// /api/keeper/tick — auto-settle workflows past their dispute window.
//
// Scans WeaveosCore for VERIFIED workflows whose dispute window has closed,
// re-runs the verifier from on-chain + Walrus state, and calls
// settleWorkflowDev (permissionless — the keeper just pays gas).
//
// Auth: optional `Authorization: Bearer <CRON_SECRET>`. Vercel Cron injects
// this automatically. Local dev calls without a secret are allowed.
//
// Modes:  GET → dry run (candidates only)   POST → settle each candidate

import { NextRequest, NextResponse } from "next/server";

import {
  settleWorkflowDev,
  walletFromHex,
  type VerifyResponse,
} from "@/lib/interlock/lifecycle";
import { interlockSecrets } from "@/lib/interlock/config";
import { getWorkflow, listWorkflows, type WorkflowDetail } from "@/lib/interlock/queries";
import { walrusGet } from "@/lib/interlock/walrus";

export const runtime = "nodejs";
export const maxDuration = 60;

function requireCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null; // local dev
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

type Candidate = {
  workflowId: string;
  outcomeSuccess: boolean;
  artifactBlobId: string;
  disputeWindowEndsMs: number;
};

async function findCandidates(): Promise<{
  candidates: Candidate[];
  scanned: number;
  notReady: number;
}> {
  const recent = await listWorkflows({ limit: 100 });
  const now = Date.now();
  let notReady = 0;
  const candidates: Candidate[] = [];

  for (const w of recent) {
    if (w.statusEnum !== 2 /* VERIFIED */) continue;
    const detail: WorkflowDetail | null = await getWorkflow(w.id);
    if (!detail?.outcome || !detail.execution || !detail.quote) continue;
    if (detail.outcome.disputeWindowEndsMs > now) {
      notReady += 1;
      continue;
    }
    candidates.push({
      workflowId: w.id,
      outcomeSuccess: detail.outcome.success,
      artifactBlobId: detail.outcome.artifactBlobId,
      disputeWindowEndsMs: detail.outcome.disputeWindowEndsMs,
    });
  }
  return { candidates, scanned: recent.length, notReady };
}

type SettleAttempt = {
  workflowId: string;
  status: "settled" | "refunded" | "failed" | "skipped";
  txHash?: string;
  reason?: string;
};

async function reverifyAndSettle(req: NextRequest, candidate: Candidate): Promise<SettleAttempt> {
  const baseUrl = new URL(req.url).origin;

  const detail = await getWorkflow(candidate.workflowId);
  if (!detail?.quote || !detail.execution) {
    return { workflowId: candidate.workflowId, status: "skipped", reason: "missing quote/execution" };
  }

  let criteria: unknown;
  try {
    criteria = JSON.parse(detail.quote.successCriteria);
  } catch (e) {
    return {
      workflowId: candidate.workflowId,
      status: "skipped",
      reason: `criteria not JSON: ${(e as Error).message}`,
    };
  }

  let outcomeJson: unknown;
  try {
    const bytes = await walrusGet(candidate.artifactBlobId);
    outcomeJson = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return {
      workflowId: candidate.workflowId,
      status: "skipped",
      reason: `walrus fetch failed: ${(e as Error).message}`,
    };
  }

  const costTrace = detail.execution.costItems.map((c) => ({
    provider: c.provider,
    category: c.category,
    units: c.units,
    amount: c.amount,
  }));

  // The verifier now reads price/fee/agentCompany from chain — we just pass
  // the workflow + criteria + outcome + costs.
  const verifyResp = await fetch(`${baseUrl}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workflowId: candidate.workflowId,
      criteria,
      outcome: outcomeJson,
      costTrace,
      disputeWindowSeconds: 5,
    }),
  });
  if (!verifyResp.ok) {
    return {
      workflowId: candidate.workflowId,
      status: "failed",
      reason: `verify ${verifyResp.status}: ${await verifyResp.text()}`,
    };
  }
  const verify = (await verifyResp.json()) as VerifyResponse;

  if (verify.success !== candidate.outcomeSuccess) {
    return {
      workflowId: candidate.workflowId,
      status: "skipped",
      reason: `verifier verdict (${verify.success}) != recorded outcome (${candidate.outcomeSuccess})`,
    };
  }

  try {
    const keeper = walletFromHex(
      process.env.INTERLOCK_KEEPER_PRIVKEY ?? interlockSecrets.adminPrivkey,
    );
    const s = await settleWorkflowDev(keeper, { workflowId: candidate.workflowId, verify });
    return {
      workflowId: candidate.workflowId,
      status: s.refunded ? "refunded" : "settled",
      txHash: s.txHash,
    };
  } catch (e) {
    return { workflowId: candidate.workflowId, status: "failed", reason: (e as Error).message };
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = requireCron(req);
  if (guard) return guard;
  try {
    const r = await findCandidates();
    return NextResponse.json({ mode: "dry-run", ...r });
  } catch (e) {
    return NextResponse.json({ error: `keeper failed: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = requireCron(req);
  if (guard) return guard;
  const startedAt = Date.now();
  try {
    const { candidates, scanned, notReady } = await findCandidates();
    const results: SettleAttempt[] = [];
    for (const c of candidates) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await reverifyAndSettle(req, c));
    }
    return NextResponse.json({
      mode: "settle",
      scanned,
      notReady,
      candidates: candidates.length,
      results,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    return NextResponse.json({ error: `keeper failed: ${(e as Error).message}` }, { status: 500 });
  }
}
