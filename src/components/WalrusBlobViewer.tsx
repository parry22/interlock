"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  CopyIcon,
  CheckmarkCircleIcon,
  CloudDownloadIcon,
  Download01Icon,
} from "@hugeicons/core-free-icons";

// ─── Types ───────────────────────────────────────────────────────────────────

type BlobResponse = {
  blobId: string;
  size: number;
  aggregatorUrl: string;
  contentType: string;
  text: string | null;
  json: unknown;
  base64: string | null;
  hexPreview: string;
};

export type BlobMeta = {
  /** Walrus blob ID (base64-url). */
  blobId: string;
  /** Human label, e.g., "Outcome", "Trace", "Proof". */
  label: string;
  /** Optional one-line description for context. */
  description?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function CopyButton({ value, label }: { value: string; label?: string }) {
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

// ─── Pretty JSON rendering ───────────────────────────────────────────────────

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) return <span className="text-[#a78bfa]">null</span>;
  if (value === undefined) return <span className="text-[#5a5a5a]">undefined</span>;
  if (typeof value === "boolean")
    return <span className="text-[#fb923c]">{String(value)}</span>;
  if (typeof value === "number")
    return <span className="text-[#22d3ee]">{value}</span>;
  if (typeof value === "string")
    return <span className="text-[#4ade80]">&quot;{value}&quot;</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-[#5a5a5a]">[]</span>;
    return (
      <>
        <span className="text-[#5a5a5a]">[</span>
        <div className="pl-4 border-l border-dashed border-[#272727] ml-1">
          {value.map((v, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-2">
              <span className="text-[#5a5a5a] text-[11px]">{i}:</span>
              <JsonNode value={v} depth={depth + 1} />
            </div>
          ))}
        </div>
        <span className="text-[#5a5a5a]">]</span>
      </>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-[#5a5a5a]">{"{}"}</span>;
    return (
      <>
        <span className="text-[#5a5a5a]">{"{"}</span>
        <div className="pl-4 border-l border-dashed border-[#272727] ml-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-baseline gap-2">
              <span className="text-[#fbbf24]">{k}:</span>
              <JsonNode value={v} depth={depth + 1} />
            </div>
          ))}
        </div>
        <span className="text-[#5a5a5a]">{"}"}</span>
      </>
    );
  }
  return <span>{String(value)}</span>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WalrusBlobViewer({
  meta,
  onClose,
}: {
  meta: BlobMeta | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<BlobResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meta) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setData(null);
    setError(null);
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(`/api/walrus/${encodeURIComponent(meta.blobId)}`, {
          cache: "force-cache", // Walrus blobs are immutable
          signal: ac.signal,
        });
        const json = (await r.json()) as BlobResponse | { error: string };
        if ("error" in json) throw new Error(json.error);
        setData(json);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [meta]);

  if (!meta) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-150 bg-[#0a0a0a] border-l border-[#1e1e1e] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e] shrink-0">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={CloudDownloadIcon} size={16} color="#3064FF" strokeWidth={1.5} />
            <span className="text-[14px] font-semibold text-white">{meta.label} blob</span>
            {data && (
              <span className="text-[11px] text-[#5a5a5a]">{formatBytes(data.size)}</span>
            )}
          </div>
          <button onClick={onClose} className="text-[#5a5a5a] hover:text-white transition-colors">
            <HugeiconsIcon icon={Cancel01Icon} size={16} color="currentColor" strokeWidth={1.5} />
          </button>
        </div>

        {/* Meta */}
        <div className="px-5 py-4 border-b border-[#1e1e1e] shrink-0 flex flex-col gap-2">
          {meta.description && (
            <p className="text-[12px] text-[#5a5a5a]">{meta.description}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <code className="flex-1 min-w-0 bg-[#111] border border-[#272727] rounded-md px-3 py-1.5 text-[11px] font-mono text-[#a3a3a3] truncate">
              {meta.blobId}
            </code>
            <CopyButton value={meta.blobId} label="Copy ID" />
            {data && (
              <>
                <button
                  onClick={() => {
                    // Always download the canonical bytes. If we have text use
                    // it; if we have base64 decode it; otherwise hex preview.
                    let blob: Blob;
                    if (data.text != null) {
                      blob = new Blob([data.text], { type: data.contentType });
                    } else if (data.base64 != null) {
                      const bin = atob(data.base64);
                      const u8 = new Uint8Array(bin.length);
                      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
                      blob = new Blob([u8], { type: "application/octet-stream" });
                    } else {
                      return;
                    }
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${meta.blobId}.${data.contentType === "application/json" ? "json" : "bin"}`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1e1e1e] border border-[#272727] text-[12px] text-[#a3a3a3] hover:text-white transition-colors"
                >
                  <HugeiconsIcon icon={Download01Icon} size={11} color="currentColor" strokeWidth={1.5} />
                  Download
                </button>
                <a
                  href={data.aggregatorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1e1e1e] border border-[#272727] text-[12px] text-[#60a5fa] hover:text-[#93c5fd] transition-colors"
                >
                  Aggregator ↗
                </a>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-[#5a5a5a] text-[13px]">Fetching from Walrus testnet…</span>
            </div>
          ) : error ? (
            <div className="bg-[#3a1818] border border-[#ef4444] rounded-md px-4 py-3">
              <p className="text-[13px] font-medium text-[#f87171]">Failed to load blob</p>
              <p className="text-[11px] text-[#fca5a5] mt-1 font-mono break-all">{error}</p>
            </div>
          ) : !data ? null : data.json !== null ? (
            <div className="bg-[#111] border border-[#1e1e1e] rounded-md px-4 py-3 text-[12px] font-mono leading-relaxed overflow-x-auto">
              <JsonNode value={data.json} />
            </div>
          ) : data.text !== null ? (
            <pre className="bg-[#111] border border-[#1e1e1e] rounded-md px-4 py-3 text-[12px] font-mono text-[#a3a3a3] whitespace-pre-wrap overflow-x-auto">
              {data.text}
            </pre>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-[#5a5a5a]">
                Binary blob ({formatBytes(data.size)}). Hex preview (first 256 bytes):
              </p>
              <pre className="bg-[#111] border border-[#1e1e1e] rounded-md px-4 py-3 text-[11px] font-mono text-[#a3a3a3] whitespace-pre-wrap break-all">
                {data.hexPreview}
                {data.size > 256 ? "…" : ""}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#1e1e1e] px-5 py-3 shrink-0 flex items-center gap-2 text-[11px] text-[#5a5a5a]">
          <span>Source:</span>
          <code className="font-mono">aggregator.walrus-testnet.walrus.space</code>
        </div>
      </div>
    </div>
  );
}
