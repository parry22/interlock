"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Configuration01Icon,
  CheckmarkCircleIcon,
  CopyIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";

import { RunKeeperButton } from "@/components/RunKeeperButton";
import { RefreshIndexerButton } from "@/components/RefreshIndexerButton";
import { useAuthSession } from "@/lib/interlock/useSession";

// ─── Types — mirror /api/settings ───────────────────────────────────────────

type RetryPolicy = { maxAttempts: number; backoffSeconds: number };

type SettingsRecord = {
  tenantAddress: string;
  webhookUrl: string;
  signingSecret: string;
  topics: string[];
  retryPolicy: RetryPolicy;
  updatedAtMs: number;
};

const ALL_TOPICS = [
  "WorkflowCreated",
  "ExecutionRecorded",
  "OutcomeVerified",
  "DisputeFiled",
  "WorkflowSettled",
  "WorkflowRefunded",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  if (!addr) return "—";
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;
}

function dateLabel(ms: number): string {
  if (!ms) return "never";
  return new Date(ms).toLocaleString();
}

function CopyChip({ value, label }: { value: string; label?: string }) {
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
      {copied ? "Copied" : label ?? "Copy"}
    </button>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const session = useAuthSession();
  const tenantAddress = session?.suiAddress ?? "";
  const [data, setData] = useState<SettingsRecord | null>(null);
  const [draft, setDraft] = useState({
    webhookUrl: "",
    topics: new Set<string>(),
    maxAttempts: 5,
    backoffSeconds: 30,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testResp, setTestResp] = useState<string | null>(null);

  async function load(addr: string) {
    setLoading(true);
    try {
      const r = await fetch(`/api/settings?address=${addr}`, { cache: "no-store" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      const s: SettingsRecord = json.settings;
      setData(s);
      setDraft({
        webhookUrl: s.webhookUrl,
        topics: new Set(s.topics),
        maxAttempts: s.retryPolicy.maxAttempts,
        backoffSeconds: s.retryPolicy.backoffSeconds,
      });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // Wait until the session has hydrated from localStorage. The server
    // ignores the ?address query and uses the cookie anyway, but loading
    // before the session resolves gives an "address query required"-style
    // race that looks confusing in the UI.
    if (!tenantAddress) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(tenantAddress);
  }, [tenantAddress]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // tenantAddress is server-derived from the cookie; we don't send it.
          webhookUrl: draft.webhookUrl,
          topics: Array.from(draft.topics),
          retryPolicy: {
            maxAttempts: draft.maxAttempts,
            backoffSeconds: draft.backoffSeconds,
          },
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setData(json.settings);
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function testWebhook() {
    if (!data?.webhookUrl) {
      setTestResp("Save a webhook URL first");
      return;
    }
    setTestResp("Sending…");
    try {
      const r = await fetch(data.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Interlock-Event": "WorkflowSettled",
          "X-Interlock-Signature": "test-signature",
        },
        body: JSON.stringify({
          event: "WorkflowSettled",
          workflowId: "0x0253aca8…",
          totalSettled: 100_000_000,
          test: true,
        }),
      });
      setTestResp(`Webhook responded ${r.status}`);
    } catch (e) {
      setTestResp(`Delivery failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-4">
      {/* Tenant selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Configuration01Icon} size={16} color="#a3a3a3" strokeWidth={1.5} />
          <span className="text-[14px] font-semibold text-white">Tenant settings</span>
        </div>
        <div className="flex-1 max-w-105 bg-[#171718] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] font-mono">
          {tenantAddress || <span className="text-[#5a5a5a]">No session — sign in first</span>}
        </div>
        <button
          onClick={() => tenantAddress && load(tenantAddress)}
          disabled={!tenantAddress}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#171718] border border-[#1e1e1e] text-[#a3a3a3] hover:text-white hover:border-[#2a2a2a] disabled:opacity-50 transition-colors text-[13px]"
        >
          <HugeiconsIcon icon={RefreshIcon} size={13} color="currentColor" strokeWidth={1.5} />
          Reload
        </button>
      </div>

      {loading ? (
        <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] py-16 flex items-center justify-center text-[#5a5a5a] text-[13px]">
          Loading settings…
        </div>
      ) : (
        <>
          {/* Webhook URL + signing secret */}
          <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-5 py-4 flex flex-col gap-3">
            <span className="text-[14px] font-semibold text-white">Webhook delivery</span>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-[#5a5a5a]">Webhook URL</span>
              <input
                type="url"
                value={draft.webhookUrl}
                onChange={(e) => setDraft({ ...draft, webhookUrl: e.target.value })}
                placeholder="https://your-app.example.com/webhooks/interlock"
                className="bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] outline-none focus:border-[#2a2a2a]"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-[#5a5a5a]">Signing secret (HMAC-SHA256)</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#111] border border-[#272727] rounded-md px-3 py-2 text-[13px] font-mono text-[#a3a3a3] truncate">
                  {data?.signingSecret || "—"}
                </code>
                {data?.signingSecret && <CopyChip value={data.signingSecret} label="Copy secret" />}
              </div>
              <p className="text-[11px] text-[#5a5a5a]">
                Auto-generated on first save. Use it to verify the{" "}
                <code className="font-mono">X-Interlock-Signature</code> header on incoming webhooks.
              </p>
            </div>
          </div>

          {/* Topics */}
          <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-5 py-4 flex flex-col gap-3">
            <span className="text-[14px] font-semibold text-white">Event topics</span>
            <p className="text-[12px] text-[#5a5a5a]">
              Leave all unchecked to receive all events; check specific topics to filter.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ALL_TOPICS.map((t) => {
                const on = draft.topics.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => {
                      const next = new Set(draft.topics);
                      if (on) next.delete(t);
                      else next.add(t);
                      setDraft({ ...draft, topics: next });
                    }}
                    className={`px-3 py-2 rounded-md border text-[12px] font-mono transition-colors ${
                      on
                        ? "bg-[#3064FF]/10 border-[#3064FF] text-white"
                        : "bg-[#111] border-[#1e1e1e] text-[#a3a3a3] hover:border-[#2a2a2a]"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Retry policy */}
          <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-5 py-4 flex flex-col gap-3">
            <span className="text-[14px] font-semibold text-white">Retry policy</span>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-[#5a5a5a]">Max attempts</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={draft.maxAttempts}
                  onChange={(e) => setDraft({ ...draft, maxAttempts: Number(e.target.value) })}
                  className="bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] outline-none focus:border-[#2a2a2a]"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-[#5a5a5a]">Backoff (seconds)</span>
                <input
                  type="number"
                  min={1}
                  value={draft.backoffSeconds}
                  onChange={(e) => setDraft({ ...draft, backoffSeconds: Number(e.target.value) })}
                  className="bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] outline-none focus:border-[#2a2a2a]"
                />
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] disabled:bg-[#1e1e1e] disabled:text-[#5a5a5a] text-white transition-colors"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
            <button
              onClick={testWebhook}
              disabled={!data?.webhookUrl}
              className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white disabled:opacity-50 disabled:hover:text-[#a3a3a3] transition-colors"
            >
              Send test webhook
            </button>
            {savedAt && (
              <span className="text-[12px] text-[#4ade80] inline-flex items-center gap-1.5">
                <HugeiconsIcon icon={CheckmarkCircleIcon} size={12} color="#4ade80" strokeWidth={1.5} />
                Saved {dateLabel(savedAt)}
              </span>
            )}
            {testResp && <span className="text-[12px] text-[#a3a3a3]">{testResp}</span>}
            {error && <span className="text-[12px] text-[#f87171]">{error}</span>}
          </div>

          {/* Meta */}
          <div className="text-[11px] text-[#5a5a5a]">
            Tenant: <span className="font-mono">{shortAddr(tenantAddress)}</span> · Last updated:{" "}
            {data ? dateLabel(data.updatedAtMs) : "never"}
          </div>

          {/* Platform automation */}
          <RefreshIndexerButton />
          <RunKeeperButton />
        </>
      )}
    </div>
  );
}
