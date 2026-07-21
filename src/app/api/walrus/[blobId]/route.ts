// /api/walrus/[blobId] — fetch a blob from the Walrus testnet aggregator and
// return it to the dashboard. Caches in the browser via the aggregator's own
// headers (blobs are immutable on Walrus, so this is safe).

import { NextRequest, NextResponse } from "next/server";
import { walrusGet } from "@/lib/interlock/walrus";
import { interlockConfig } from "@/lib/interlock/config";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ blobId: string }> },
): Promise<NextResponse> {
  const { blobId } = await ctx.params;
  if (!blobId || blobId.length < 8) {
    return NextResponse.json({ error: "blobId required" }, { status: 400 });
  }
  try {
    const bytes = await walrusGet(blobId);
    const aggregatorUrl = `${interlockConfig.walrusAggregator}/v1/blobs/${blobId}`;
    // Try to decode as UTF-8 + parse as JSON. If both succeed, return parsed.
    // Otherwise return base64 + hex preview so the UI can render gracefully.
    let text: string | null = null;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = null;
    }
    let json: unknown = null;
    if (text != null) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    const buf = Buffer.from(bytes);
    return NextResponse.json({
      blobId,
      size: bytes.length,
      aggregatorUrl,
      contentType:
        json != null ? "application/json" : text != null ? "text/plain" : "application/octet-stream",
      text: text ?? null,
      json,
      base64: json == null && text == null ? buf.toString("base64") : null,
      hexPreview: buf.subarray(0, 256).toString("hex"),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `walrus get failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
