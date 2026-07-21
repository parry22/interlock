"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from "recharts";

export type TopCustomersDatum = {
  /** Display label — usually a shortened address. */
  customer: string;
  /** GMV in USDC (post-decimal conversion). */
  gmv: number;
  /** Currently locked in escrow, in USDC. */
  escrowed: number;
};

const ESCROWED_COLOR = "#00248F";
const GMV_COLOR = "#3064FF";

function formatY(v: number) {
  // Compact display: <1 USDC uses 3 decimals, larger uses 1.
  if (v < 1) return `${v.toFixed(3)} USDC`;
  if (v < 10) return `${v.toFixed(2)} USDC`;
  return `${v.toFixed(0)} USDC`;
}

export function TopCustomersChart({ data }: { data: TopCustomersDatum[] }) {
  const empty = data.length === 0;
  return (
    <div className="flex flex-col h-full bg-[#171718] rounded-[20px] border border-[#1e1e1e] px-5 pt-4 pb-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 mb-3">
        <span className="text-[#a3a3a3] text-[13px] font-medium">
          Top customers
        </span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-2.5 rounded-sm shrink-0"
              style={{ background: ESCROWED_COLOR }}
            />
            <span className="text-[#a3a3a3] text-[13px]">In escrow</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-2.5 rounded-sm shrink-0"
              style={{ background: GMV_COLOR }}
            />
            <span className="text-[#a3a3a3] text-[13px]">Paid out</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        {empty ? (
          <div className="flex items-center justify-center h-full text-[#5a5a5a] text-[13px]">
            No customer activity yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              barCategoryGap="20%"
              barGap={4}
              margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="#272727"
                strokeDasharray="4 4"
              />
              <XAxis
                dataKey="customer"
                tick={{ fill: "#5a5a5a", fontSize: 13, fontFamily: "var(--font-dm-sans)" }}
                axisLine={false}
                tickLine={false}
                dy={8}
              />
              <YAxis
                tickFormatter={formatY}
                tick={{ fill: "#5a5a5a", fontSize: 12, fontFamily: "var(--font-dm-sans)" }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Bar dataKey="escrowed" radius={[12, 12, 0, 0]} maxBarSize={44}>
                {data.map((_, i) => (
                  <Cell key={i} fill={ESCROWED_COLOR} />
                ))}
              </Bar>
              <Bar dataKey="gmv" radius={[12, 12, 0, 0]} maxBarSize={44}>
                {data.map((_, i) => (
                  <Cell key={i} fill={GMV_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
