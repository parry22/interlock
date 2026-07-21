// POST /api/connectors/connect
// { sourceSystem, params, config?, webhookSecret?, displayName?, customerId? }
//
// Establish a connection: validate/exchange credentials via the connector's
// authenticate(), encrypt them at rest, persist, and register the subscription
// (webhook or polling). Returns the connection + the webhook URL to hand the
// provider. Secrets are never returned or logged.
//
// GET /api/connectors/connect  → list this customer's connections (no secrets)
// GET /api/connectors/connect?providers=1 → available connectors + capabilities

import { NextRequest, NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import { db, auditLog } from "@/lib/db";
import { getCurrentUser, effectiveOnChainAddress } from "@/lib/interlock/session";
import { isEncryptionConfigured } from "@/lib/db/encryption";
import { getConnector, listConnectors } from "@/lib/connectors/registry";
import { createConnection, listActiveConnections, toConnection } from "@/lib/db/connectors";
import { encryptCreds, encryptSecret } from "@/lib/connectors/creds";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.searchParams.get("providers")) {
    return NextResponse.json({
      providers: listConnectors().map((c) => ({ sourceSystem: c.sourceSystem, capabilities: c.capabilities })),
    });
  }
  const customerId = req.nextUrl.searchParams.get("customerId");
  try {
    const rows = await listActiveConnections();
    const filtered = customerId ? rows.filter((r) => r.customerId === customerId) : rows;
    // Never leak ciphertext.
    return NextResponse.json({
      connections: filtered.map((r) => ({
        id: r.id,
        customerId: r.customerId,
        sourceSystem: r.sourceSystem,
        displayName: r.displayName,
        authKind: r.authKind,
        status: r.status,
        lastHealthyAtMs: r.lastHealthyAtMs,
        config: r.config,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

type Body = {
  sourceSystem?: string;
  params?: Record<string, string>;
  config?: Record<string, unknown>;
  webhookSecret?: string;
  displayName?: string;
  customerId?: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = rateLimit(req, "connector-connect", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { error: "SETTINGS_ENCRYPTION_KEY not set — cannot store credentials securely" },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  if (!body.sourceSystem) return NextResponse.json({ error: "sourceSystem is required" }, { status: 400 });

  const connector = getConnector(body.sourceSystem);
  if (!connector) return NextResponse.json({ error: `unknown connector: ${body.sourceSystem}` }, { status: 404 });

  // Tenancy: default to the signed-in user's address; allow an explicit
  // customerId (demo / server-to-server).
  let customerId = body.customerId ?? null;
  if (!customerId) {
    const user = await getCurrentUser();
    if (user) customerId = effectiveOnChainAddress(user);
  }
  if (!customerId) return NextResponse.json({ error: "customerId is required (or sign in)" }, { status: 401 });

  // Validate/exchange credentials with the provider.
  const auth = await connector.authenticate({ customerId, params: body.params ?? {} });
  if (!auth.ok) {
    return NextResponse.json({ error: `authentication failed: ${auth.error}` }, { status: 400 });
  }

  const row = await createConnection({
    customerId,
    sourceSystem: body.sourceSystem,
    authKind: connector.capabilities.authKind,
    credsEncrypted: encryptCreds(auth.creds),
    webhookSecretEncrypted: encryptSecret(body.webhookSecret),
    config: body.config ?? {},
    displayName: body.displayName,
  });

  // Register subscription (webhook vs polling).
  let subscribe;
  try {
    subscribe = await connector.subscribe(toConnection(row));
  } catch (e) {
    subscribe = { mode: "polling" as const, note: `subscribe failed: ${(e as Error).message}` };
  }

  await db().insert(auditLog).values({
    actorAddress: customerId.toLowerCase(),
    action: "connector.connect",
    targetId: row.id,
    payload: { sourceSystem: body.sourceSystem, mode: subscribe.mode },
    atMs: Date.now(),
  });

  const origin = req.nextUrl.origin;
  return NextResponse.json(
    {
      connection: {
        id: row.id,
        customerId: row.customerId,
        sourceSystem: row.sourceSystem,
        authKind: row.authKind,
        status: row.status,
        config: row.config,
      },
      subscribe,
      webhookUrl: `${origin}/api/connectors/${body.sourceSystem}/webhook?c=${row.id}`,
    },
    { status: 201 },
  );
}
