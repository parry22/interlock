"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CopyIcon,
  CheckmarkCircleIcon,
  KeyIcon,
  AddCircleIcon,
  Cancel01Icon,
  Delete01Icon,
  AlertDiamondIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";

// ─── Types — mirror /api/apikeys ────────────────────────────────────────────

type ApiKey = {
  hash: string;
  label: string;
  scopes: string[];
  prefix: string;
  ownerAddress: string;
  createdAtMs: number;
  lastUsedAtMs: number | null;
};

import { useAuthSession } from "@/lib/interlock/useSession";

const DEFAULT_SCOPES = [
  "workflows:read",
  "workflows:write",
  "quotes:read",
  "settlements:read",
];

// ─── Formatters ──────────────────────────────────────────────────────────────

function dateLabel(ms: number | null): string {
  if (!ms) return "never";
  return new Date(ms).toLocaleString();
}

function shortAddr(addr: string): string {
  if (!addr) return "—";
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;
}

// ─── Components ──────────────────────────────────────────────────────────────

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1e1e1e] border border-[#272727] text-[12px] text-[#a3a3a3] hover:text-white transition-colors"
    >
      <HugeiconsIcon
        icon={copied ? CheckmarkCircleIcon : CopyIcon}
        size={11}
        color={copied ? "#4ade80" : "currentColor"}
        strokeWidth={1.5}
      />
      {copied ? "Copied" : label}
    </button>
  );
}

function GenerateForm({
  onGenerated,
  onCancel,
}: {
  onGenerated: (secret: string, key: ApiKey) => void;
  onCancel: () => void;
}) {
  const session = useAuthSession();
  const owner = session?.suiAddress ?? "";
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      // ownerAddress is server-derived from the session cookie; we don't send it.
      const r = await fetch("/api/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, scopes: DEFAULT_SCOPES }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      onGenerated(json.secret, json.key);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-white">Generate new API key</span>
        <button onClick={onCancel} className="text-[#5a5a5a] hover:text-[#a3a3a3]">
          <HugeiconsIcon icon={Cancel01Icon} size={16} color="currentColor" strokeWidth={1.5} />
        </button>
      </div>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. production-server-1)"
        className="bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] outline-none focus:border-[#2a2a2a]"
      />
      <div className="bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[12px] text-[#5a5a5a] font-mono">
        Owner: <span className="text-[#a3a3a3]">{owner ? `${owner.slice(0, 10)}…${owner.slice(-4)}` : "—"}</span>
      </div>
      <p className="text-[11px] text-[#5a5a5a]">
        Default scopes: <span className="font-mono">{DEFAULT_SCOPES.join(", ")}</span>
      </p>
      {error && <p className="text-[12px] text-[#f87171]">{error}</p>}
      <button
        disabled={busy || !label || !owner}
        onClick={generate}
        className="self-start px-4 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] disabled:bg-[#1e1e1e] disabled:text-[#5a5a5a] text-white transition-colors"
      >
        {busy ? "Generating…" : "Generate"}
      </button>
    </div>
  );
}

function RevealedSecret({ secret, apiKey: k, onDone }: { secret: string; apiKey: ApiKey; onDone: () => void }) {
  return (
    <div className="bg-[#171718] border border-[#f59e0b] rounded-[20px] px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={AlertDiamondIcon} size={14} color="#f59e0b" strokeWidth={1.5} />
        <span className="text-[14px] font-semibold text-white">Secret shown once — copy it now</span>
      </div>
      <p className="text-[12px] text-[#a3a3a3]">
        The secret is only stored on chain as a SHA-256 hash. We can&apos;t show it again.
      </p>
      <div className="flex items-center gap-3">
        <code className="flex-1 bg-[#111] border border-[#272727] rounded-md px-3 py-2 text-[13px] font-mono text-[#fbbf24] break-all">
          {secret}
        </code>
        <CopyButton value={secret} label="Copy secret" />
      </div>
      <div className="text-[11px] text-[#5a5a5a]">
        Label: <span className="text-[#a3a3a3]">{k.label}</span> · Prefix:{" "}
        <span className="font-mono text-[#a3a3a3]">{k.prefix}</span>
      </div>
      <button
        onClick={onDone}
        className="self-start px-4 py-2 rounded-full text-[13px] font-medium bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white transition-colors"
      >
        I&apos;ve saved it
      </button>
    </div>
  );
}

function SdkSnippet() {
  const [tab, setTab] = useState<"mcp" | "node" | "curl">("mcp");
  const installSnippet = `npm i @interlock/sdk`;
  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const mcpConfigSnippet = `// Claude Desktop / Cursor — claude_desktop_config.json
{
  "mcpServers": {
    "interlock": {
      "url": "${baseUrl}/api/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer wos_<paste_your_api_key>"
      }
    }
  }
}

// Once connected, your agent gets two tools:
//   • register_agent  → list yourself in the Interlock marketplace
//   • start_workflow  → run quote → escrow → execution → verify → settle
//
// Discovery:  GET ${baseUrl}/.well-known/mcp.json
// Manual:     GET ${baseUrl}/api/mcp  (with Accept: application/json)`;
  const nodeSnippet = `import { InterlockClient } from "@interlock/sdk";

const wos = new InterlockClient({
  apiKey: process.env.INTERLOCK_API_KEY!,         // wos_… from /developer
  baseUrl: "http://localhost:3000",              // your Interlock deployment
});

// Stream the full 7-stage lifecycle. ~30-40s total.
for await (const ev of wos.workflows.start({
  priceBaseUnits: 10_000_000,                    // 10 USDC escrow
  criteria: {
    type: "all_of",
    criteria: [
      { type: "exact",             path: "/ticket_status", value: "closed" },
      { type: "numeric_threshold", path: "/refund_amount", op: "<=", value: 100 },
    ],
  },
  outcome: { ticket_status: "closed", refund_amount: 47.5 },
})) {
  if (ev.event === "stage")    console.log(\`\${ev.data.stage} \${ev.data.status}\`);
  if (ev.event === "complete") console.log("workflow:", ev.data.workflowId);
  if (ev.event === "error")    throw new Error(ev.data.message);
}`;
  const curlSnippet = `curl -N -X POST http://localhost:3000/api/workflows/start \\
  -H "Authorization: Bearer $INTERLOCK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "priceBaseUnits": 100000000,
    "criteria": {
      "type": "all_of",
      "criteria": [
        { "type": "exact",             "path": "/ticket_status", "value": "closed" },
        { "type": "numeric_threshold", "path": "/refund_amount", "op": "<=", "value": 100 }
      ]
    },
    "outcome": { "ticket_status": "closed", "refund_amount": 47.5 }
  }'`;
  const active = tab === "mcp" ? mcpConfigSnippet : tab === "node" ? nodeSnippet : curlSnippet;
  return (
    <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={SourceCodeIcon} size={14} color="#5a5a5a" strokeWidth={1.5} />
          <span className="text-[14px] font-semibold text-white">Agent integration</span>
          <span className="text-[11px] text-[#4ade80] px-2 py-0.5 rounded-full bg-[#4ade80]/10">
            live
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#0a0a0a] border border-[#272727] rounded-full p-0.5">
            <button
              onClick={() => setTab("mcp")}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                tab === "mcp" ? "bg-[#1e1e1e] text-white" : "text-[#5a5a5a] hover:text-[#a3a3a3]"
              }`}
            >
              MCP
            </button>
            <button
              onClick={() => setTab("node")}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                tab === "node" ? "bg-[#1e1e1e] text-white" : "text-[#5a5a5a] hover:text-[#a3a3a3]"
              }`}
            >
              Node SDK
            </button>
            <button
              onClick={() => setTab("curl")}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                tab === "curl" ? "bg-[#1e1e1e] text-white" : "text-[#5a5a5a] hover:text-[#a3a3a3]"
              }`}
            >
              curl
            </button>
          </div>
          <CopyButton value={active} />
        </div>
      </div>
      {tab === "node" && (
        <div className="mb-2">
          <span className="text-[11px] text-[#5a5a5a]">Install</span>
          <pre className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-md px-3 py-2 mt-1 text-[12px] font-mono text-[#a3a3a3] overflow-x-auto">
            {installSnippet}
          </pre>
        </div>
      )}
      <div>
        <span className="text-[11px] text-[#5a5a5a]">
          {tab === "mcp"
            ? "Add Interlock as a skill to any MCP-capable agent runtime"
            : "Drive a workflow end-to-end"}
        </span>
        <pre className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-md px-4 py-3 mt-1 text-[12px] font-mono text-[#a3a3a3] whitespace-pre-wrap overflow-x-auto">
          {active}
        </pre>
      </div>
      <p className="text-[11px] text-[#5a5a5a] mt-2">
        {tab === "mcp" ? (
          <>
            Spec-compliant Streamable HTTP transport. Once added to your agent
            runtime, Interlock shows up alongside any other skill. Mint an API key
            above and paste it into the config.
          </>
        ) : (
          <>
            Mint an API key above. The endpoint streams NDJSON — every line is one
            stage event. Same path the in-app &ldquo;+ Create workflow&rdquo; button uses.
          </>
        )}
      </p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DeveloperPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [revealed, setRevealed] = useState<{ secret: string; key: ApiKey } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/apikeys", { cache: "no-store" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setKeys(json.keys ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  async function revoke(hash: string) {
    if (!confirm("Revoke this key? Any client using it will start receiving 401.")) return;
    await fetch(`/api/apikeys?hash=${hash}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={KeyIcon} size={16} color="#a3a3a3" strokeWidth={1.5} />
          <span className="text-[14px] font-semibold text-white">API keys</span>
          <span className="text-[11px] text-[#5a5a5a] ml-1">
            ({keys.length} active)
          </span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] text-white transition-colors"
        >
          <HugeiconsIcon icon={AddCircleIcon} size={14} color="currentColor" strokeWidth={1.5} />
          New key
        </button>
      </div>

      {showForm && (
        <GenerateForm
          onCancel={() => setShowForm(false)}
          onGenerated={(secret, key) => {
            setShowForm(false);
            setRevealed({ secret, key });
            refresh();
          }}
        />
      )}

      {revealed && (
        <RevealedSecret
          secret={revealed.secret}
          apiKey={revealed.key}
          onDone={() => setRevealed(null)}
        />
      )}

      <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1fr_1.4fr_1fr_1fr_80px] gap-x-4 items-center px-6 py-4">
          {["Label", "Prefix", "Owner", "Last used", "Created", ""].map((h) => (
            <span key={h} className="text-[#5a5a5a] text-[13px] font-medium">{h}</span>
          ))}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16 border-t border-dashed border-[#272727]">
            <span className="text-[#5a5a5a] text-[13px]">Loading…</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 border-t border-dashed border-[#272727]">
            <span className="text-[#f87171] text-[13px]">Failed: {error}</span>
          </div>
        ) : keys.length === 0 ? (
          <div className="flex items-center justify-center py-16 border-t border-dashed border-[#272727]">
            <span className="text-[#5a5a5a] text-[13px]">No API keys yet. Click &apos;New key&apos; to generate one.</span>
          </div>
        ) : (
          keys.map((k) => (
            <div
              key={k.hash}
              className="grid grid-cols-[1.5fr_1fr_1.4fr_1fr_1fr_80px] gap-x-4 items-center px-6 py-3.5 border-t border-dashed border-[#272727] hover:bg-[#1c1c1c] transition-colors"
            >
              <span className="text-[#d4d4d4] text-[14px] font-medium truncate">{k.label}</span>
              <span className="font-mono text-[12px] text-[#a3a3a3]">{k.prefix}…</span>
              <span className="font-mono text-[12px] text-[#a3a3a3]">{shortAddr(k.ownerAddress)}</span>
              <span className="text-[#5a5a5a] text-[12px]">{dateLabel(k.lastUsedAtMs)}</span>
              <span className="text-[#5a5a5a] text-[12px]">{dateLabel(k.createdAtMs)}</span>
              <button
                onClick={() => revoke(k.hash)}
                className="text-[#7a2020] hover:text-[#ef4444] transition-colors justify-self-end"
              >
                <HugeiconsIcon icon={Delete01Icon} size={15} color="currentColor" strokeWidth={1.5} />
              </button>
            </div>
          ))
        )}
      </div>

      <SdkSnippet />
    </div>
  );
}
