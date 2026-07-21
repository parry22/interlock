"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  HourglassIcon,
  CheckmarkCircleIcon,
  AlertDiamondIcon,
} from "@hugeicons/core-free-icons";

type KeeperResult = {
  mode: string;
  scanned: number;
  notReady: number;
  candidates: number;
  results: Array<{
    workflowId: string;
    status: "settled" | "failed" | "skipped";
    settlementId?: string;
    reason?: string;
  }>;
  durationMs: number;
};

export function RunKeeperButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<KeeperResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch("/api/keeper/tick", { method: "POST" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setResult(json as KeeperResult);
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
          <HugeiconsIcon icon={HourglassIcon} size={16} color="#a3a3a3" strokeWidth={1.5} />
          <div>
            <span className="text-[14px] font-semibold text-white">Settlement keeper</span>
            <p className="text-[12px] text-[#5a5a5a] mt-0.5">
              Scans for VERIFIED workflows past their dispute window and auto-settles them. Runs
              hourly via Vercel Cron in production.
            </p>
          </div>
        </div>
        <button
          onClick={trigger}
          disabled={running}
          className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] disabled:bg-[#1e1e1e] disabled:text-[#5a5a5a] text-white transition-colors"
        >
          {running ? "Running…" : "Run keeper now"}
        </button>
      </div>

      {result && (
        <div className="bg-[#111] border border-[#272727] rounded-md px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center gap-3 text-[12px]">
            <span className="text-[#5a5a5a]">scanned:</span>
            <span className="text-[#d4d4d4] font-medium">{result.scanned}</span>
            <span className="text-[#5a5a5a]">·</span>
            <span className="text-[#5a5a5a]">not ready:</span>
            <span className="text-[#d4d4d4] font-medium">{result.notReady}</span>
            <span className="text-[#5a5a5a]">·</span>
            <span className="text-[#5a5a5a]">candidates:</span>
            <span className="text-[#d4d4d4] font-medium">{result.candidates}</span>
            <span className="text-[#5a5a5a]">·</span>
            <span className="text-[#5a5a5a]">took</span>
            <span className="text-[#d4d4d4] font-medium">{(result.durationMs / 1000).toFixed(1)}s</span>
          </div>
          {result.results.length === 0 ? (
            <p className="text-[12px] text-[#5a5a5a]">
              No candidates to settle. The keeper has nothing to do right now.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {result.results.map((r) => (
                <div
                  key={r.workflowId}
                  className="flex items-center gap-2 text-[12px] font-mono"
                  style={{ color: r.status === "settled" ? "#4ade80" : "#f87171" }}
                >
                  <HugeiconsIcon
                    icon={r.status === "settled" ? CheckmarkCircleIcon : AlertDiamondIcon}
                    size={12}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                  <span className="truncate">{r.workflowId}</span>
                  <span className="text-[#5a5a5a]">→</span>
                  <span>{r.status}</span>
                  {r.reason && <span className="text-[#a3a3a3]"> · {r.reason}</span>}
                </div>
              ))}
            </div>
          )}
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
