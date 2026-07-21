"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { DownloadIcon } from "@hugeicons/core-free-icons";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell,
} from "recharts";

// ─── Live data shape ─────────────────────────────────────────────────────────

type ApiMarginWorkflow = {
  id: string;
  productId: string;
  customer: string;
  statusEnum: number;
  totalRevenue: number;
  totalCost: number;
  margin: number;
  marginPct: number;
  updatedAtMs: number;
};

type ApiMarginByProduct = {
  productId: string;
  workflowCount: number;
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  marginPct: number;
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatSui(base: number): string {
  if (!base) return "0 USDC";
  return `${(base / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC`;
}

/** For chart Y-axis: render base-unit numbers as a compact USDC label. */
function formatAxis(v: number): string {
  if (v === 0) return "0";
  const usdc = v / 1e6;
  if (usdc < 0.01) return `${(usdc * 1000).toFixed(1)} mUSDC`;
  return `${usdc.toFixed(3)} USDC`;
}

function shortAddr(addr: string): string {
  if (!addr) return "—";
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;
}

// ─── P & L Waterfall ─────────────────────────────────────────────────────────

const GREEN = "#22c55e";
const RED = "#ef4444";

type WaterfallBar = { name: string; spacer: number; value: number; positive: boolean };

function buildWaterfall(workflows: ApiMarginWorkflow[], platformFee: number): WaterfallBar[] {
  // Aggregate over settled workflows (statusEnum === 3).
  const settled = workflows.filter((w) => w.statusEnum === 3);
  const revenue = settled.reduce((s, w) => s + w.totalRevenue, 0);
  const cost = settled.reduce((s, w) => s + w.totalCost, 0);
  const margin = settled.reduce((s, w) => s + w.margin, 0);
  return [
    { name: "Revenue",      spacer: 0,                   value: revenue,        positive: true  },
    { name: "Provider Cost", spacer: revenue - cost,     value: cost,           positive: false },
    { name: "Platform Fee",  spacer: revenue - cost - platformFee, value: platformFee, positive: false },
    { name: "Net Margin",    spacer: 0,                   value: margin,         positive: true  },
  ];
}

function PLWaterfallChart({ data }: { data: WaterfallBar[] }) {
  const maxVal = Math.max(...data.map((d) => d.value + d.spacer), 1);
  const niceMax = Math.ceil(maxVal / 25_000_000) * 25_000_000 || maxVal;
  return (
    <div className="flex flex-col h-full bg-[#171718] rounded-[20px] border border-[#1e1e1e] px-5 pt-4 pb-4">
      <div className="flex items-center justify-between shrink-0 mb-3">
        <span className="text-[#a3a3a3] text-[13px] font-medium">P & L Waterfall (settled, all-time)</span>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: GREEN }} />
            <span className="text-[#a3a3a3] text-[13px]">Revenue / Margin</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: RED }} />
            <span className="text-[#a3a3a3] text-[13px]">Costs / Fee</span>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="35%" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal vertical={false} stroke="#272727" strokeDasharray="4 4" />
            <XAxis dataKey="name" tick={{ fill: "#5a5a5a", fontSize: 13, fontFamily: "var(--font-dm-sans)" }} axisLine={false} tickLine={false} dy={8} />
            <YAxis
              domain={[0, niceMax]}
              tickFormatter={formatAxis}
              tick={{ fill: "#5a5a5a", fontSize: 12, fontFamily: "var(--font-dm-sans)" }}
              axisLine={false}
              tickLine={false}
              width={92}
            />
            <Bar dataKey="spacer" stackId="wf" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="value" stackId="wf" radius={[8, 8, 0, 0]} maxBarSize={80} isAnimationActive={false}>
              {data.map((d, i) => <Cell key={i} fill={d.positive ? GREEN : RED} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Per-customer margin table ───────────────────────────────────────────────

type CustomerRow = {
  customer: string;
  workflowCount: number;
  totalRevenue: number;
  totalCost: number;
  margin: number;
  marginPct: number;
};

function rollupByCustomer(workflows: ApiMarginWorkflow[]): CustomerRow[] {
  const map = new Map<string, CustomerRow>();
  for (const w of workflows.filter((x) => x.statusEnum === 3)) {
    const cur = map.get(w.customer) ?? {
      customer: w.customer,
      workflowCount: 0,
      totalRevenue: 0,
      totalCost: 0,
      margin: 0,
      marginPct: 0,
    };
    cur.workflowCount += 1;
    cur.totalRevenue += w.totalRevenue;
    cur.totalCost += w.totalCost;
    cur.margin += w.margin;
    map.set(w.customer, cur);
  }
  return Array.from(map.values()).map((r) => ({
    ...r,
    marginPct: r.totalRevenue === 0 ? 0 : (r.margin / r.totalRevenue) * 100,
  })).sort((a, b) => b.totalRevenue - a.totalRevenue);
}

const COLS =
  "grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4";

function MarginTable({ rows }: { rows: CustomerRow[] }) {
  return (
    <div className="relative bg-[#171718] rounded-[20px] border border-[#1e1e1e] overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-230">
          <div className={`grid ${COLS} items-center px-6 py-4`}>
            {["Customer", "Workflows", "Revenue", "Cost", "Margin", "Margin %"].map((h) => (
              <span key={h} className="text-[#5a5a5a] text-[13px] font-medium">{h}</span>
            ))}
          </div>
          {rows.length === 0 ? (
            <div className="flex items-center justify-center py-16 border-t border-dashed border-[#272727]">
              <span className="text-[#5a5a5a] text-[13px]">No settled workflows yet</span>
            </div>
          ) : (
            rows.map((r, i) => (
              <div
                key={i}
                className={`grid ${COLS} items-center px-6 py-3.5 border-t border-dashed border-[#272727] hover:bg-[#1c1c1c] transition-colors`}
              >
                <span className="text-[#d4d4d4] text-[14px] font-mono truncate">{shortAddr(r.customer)}</span>
                <span className="text-[#6b6b6b] text-[14px]">{r.workflowCount}</span>
                <span className="text-[#d4d4d4] text-[14px] font-medium">{formatSui(r.totalRevenue)}</span>
                <span className="text-[#d4d4d4] text-[14px] font-medium">{formatSui(r.totalCost)}</span>
                <span
                  className="text-[14px] font-medium"
                  style={{ color: r.margin >= 0 ? "#4ade80" : "#f87171" }}
                >
                  {formatSui(r.margin)}
                </span>
                <span
                  className="text-[14px] font-medium"
                  style={{ color: r.marginPct >= 0 ? "#4ade80" : "#f87171" }}
                >
                  {r.marginPct.toFixed(1)}%
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="px-6 py-3 border-t border-dashed border-[#272727] flex items-center justify-between">
        <span className="text-[#5a5a5a] text-[13px] font-medium">{rows.length} customer{rows.length === 1 ? "" : "s"}</span>
        <button className="text-[#5a5a5a] hover:text-[#a3a3a3] transition-colors flex items-center gap-1.5 text-[13px]">
          <HugeiconsIcon icon={DownloadIcon} size={14} color="currentColor" strokeWidth={1.5} />
          Export CSV
        </button>
      </div>
    </div>
  );
}

// ─── Per-product breakdown ───────────────────────────────────────────────────

function ProductsCard({ byProduct }: { byProduct: ApiMarginByProduct[] }) {
  return (
    <div className="bg-[#171718] rounded-[20px] border border-[#1e1e1e] px-5 py-4">
      <span className="text-[#a3a3a3] text-[13px] font-medium block mb-3">Margin by product</span>
      {byProduct.length === 0 ? (
        <div className="text-[#5a5a5a] text-[13px] py-4 text-center">No settled workflows yet</div>
      ) : (
        <div className="flex flex-col gap-2">
          {byProduct.map((p) => (
            <div
              key={p.productId}
              className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-3 py-2 rounded-md bg-[#111] border border-[#1e1e1e]"
            >
              <span className="font-mono text-[12px] text-[#a3a3a3] truncate">{shortAddr(p.productId)}</span>
              <span className="text-[#6b6b6b] text-[12px]">{p.workflowCount} wf</span>
              <span className="text-[#d4d4d4] text-[13px] font-medium">{formatSui(p.totalRevenue)}</span>
              <span className="text-[13px] font-medium" style={{ color: p.marginPct >= 0 ? "#4ade80" : "#f87171" }}>
                {p.marginPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MarginPage() {
  const [workflows, setWorkflows] = useState<ApiMarginWorkflow[]>([]);
  const [byProduct, setByProduct] = useState<ApiMarginByProduct[]>([]);
  const [platformFee, setPlatformFee] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, s] = await Promise.all([
          fetch("/api/sui/margin", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/sui/stats", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setWorkflows(m.workflows ?? []);
        setByProduct(m.byProduct ?? []);
        setPlatformFee(s.stats?.totalPlatformFee ?? 0);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const waterfall = buildWaterfall(workflows, platformFee);
  const rows = rollupByCustomer(workflows);

  return (
    <div className="flex flex-col overflow-y-auto p-6 gap-4">
      <div className="h-50 md:h-80 shrink-0">
        <PLWaterfallChart data={waterfall} />
      </div>
      {loading ? (
        <div className="bg-[#171718] rounded-[20px] border border-[#1e1e1e] py-16 flex items-center justify-center text-[#5a5a5a] text-[13px]">
          Loading from Avalanche Fuji…
        </div>
      ) : error ? (
        <div className="bg-[#171718] rounded-[20px] border border-[#1e1e1e] py-16 flex items-center justify-center text-[#f87171] text-[13px]">
          Failed to load: {error}
        </div>
      ) : (
        <>
          <ProductsCard byProduct={byProduct} />
          <MarginTable rows={rows} />
        </>
      )}
    </div>
  );
}
