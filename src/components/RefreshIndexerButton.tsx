"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  RefreshIcon,
  CheckmarkCircleIcon,
  AlertDiamondIcon,
} from "@hugeicons/core-free-icons";

type IndexerResult = {
  results: Array<{
    eventType: string;
    upserts: number;
    durationMs: number;
    error?: string;
  }>;
  totalDurationMs: number;
};

export function RefreshIndexerButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<IndexerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch("/api/keeper/index-tick", { method: "POST" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setResult(json as IndexerResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <HugeiconsIcon icon={RefreshIcon} size={16} color="#a3a3a3" strokeWidth={1.5} />
          <div>
            <span className="text-[14px] font-semibold text-white">Sui → Postgres indexer</span>
            <p className="text-[12px] text-[#5a5a5a] mt-0.5">
              Refreshes the indexed_* tables from Sui events. Runs every 15 min via Vercel Cron
              in production. The dashboard reads from these tables.
            </p>
          </div>
        </div>
        <button
          onClick={trigger}
          disabled={running}
          className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] disabled:bg-[#1e1e1e] disabled:text-[#5a5a5a] text-white transition-colors"
        >
          {running ? "Indexing…" : "Refresh indexer"}
        </button>
      </div>

      {result && (
        <div className="bg-[#111] border border-[#272727] rounded-md px-4 py-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-3 text-[12px]">
            <span className="text-[#5a5a5a]">total:</span>
            <span className="text-[#d4d4d4] font-medium">
              {(result.totalDurationMs / 1000).toFixed(1)}s
            </span>
          </div>
          {result.results.map((r) => (
            <div key={r.eventType} className="grid grid-cols-[100px_1fr_auto] text-[12px] gap-3">
              <span className="text-[#a3a3a3]">{r.eventType}</span>
              <span
                className="font-mono"
                style={{ color: r.error ? "#f87171" : "#d4d4d4" }}
              >
                {r.error ? r.error : `${r.upserts} upserted`}
              </span>
              <span
                className="text-[11px] inline-flex items-center gap-1"
                style={{ color: r.error ? "#f87171" : "#4ade80" }}
              >
                <HugeiconsIcon
                  icon={r.error ? AlertDiamondIcon : CheckmarkCircleIcon}
                  size={11}
                  color="currentColor"
                  strokeWidth={1.5}
                />
                {(r.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-[#3a1818] border border-[#ef4444] rounded-md px-4 py-2 text-[12px] text-[#f87171]">
          {error}
        </div>
      )}
    </div>
  );
}
