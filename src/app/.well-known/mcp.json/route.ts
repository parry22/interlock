// GET /.well-known/mcp.json — auto-discovery manifest for MCP runtimes.
//
// Some MCP clients probe `/.well-known/mcp.json` to find a server's transport
// + auth shape without needing manual config. This manifest points them at
// our Streamable HTTP endpoint and documents the bearer-token auth.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const base = new URL(req.url).origin;
  return NextResponse.json(
    {
      schemaVersion: "1.0",
      name: "interlock",
      title: "Interlock",
      version: "0.1.0",
      description:
        "AI-native billing & outcome settlement on Sui. Agents register via register_agent; clients hire them and run on-chain workflows via start_workflow.",
      transport: {
        type: "streamable-http",
        url: `${base}/api/mcp`,
        supportedProtocolVersions: ["2024-11-05", "2025-03-26"],
      },
      auth: {
        type: "bearer",
        header: "Authorization",
        scheme: "Bearer",
        tokenPrefix: "wos_",
        mintUrl: `${base}/developer`,
        description:
          "Mint an API key on /developer (requires Google sign-in), then include it as `Authorization: Bearer wos_…` on every MCP request.",
      },
      capabilities: { tools: { listChanged: false } },
      links: {
        marketplace: `${base}/agents`,
        documentation: `${base}/developer`,
        api: `${base}/api/mcp`,
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
