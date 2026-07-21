"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export type DisputeRateDatum = {
  month: string;
  /** Dispute rate as a percentage (0–100). */
  ratePct: number;
  disputes: number;
  settlements: number;
};

/* White-ring hollow dot */
function CustomDot(props: {
  cx?: number;
  cy?: number;
}) {
  const { cx = 0, cy = 0 } = props;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill="#171718"
      stroke="#ffffff"
      strokeWidth={2}
    />
  );
}

export function DisputeRateChart({
  data,
  totalDisputes,
  totalSettled,
}: {
  data: DisputeRateDatum[];
  totalDisputes: number;
  totalSettled: number;
}) {
  const allZero = data.every((d) => d.ratePct === 0 && d.settlements === 0);
  return (
    <div className="flex flex-col h-full bg-[#171718] rounded-[20px] border border-[#1e1e1e] px-5 pt-4 pb-4 overflow-hidden">
      <div className="flex items-baseline justify-between shrink-0 mb-2">
        <span className="text-[#a3a3a3] text-[13px] font-medium">
          Dispute rate (last 6 months)
        </span>
        <span className="text-[#5a5a5a] text-[11px]">
          {totalDisputes} disputed / {totalSettled} settled
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {allZero ? (
          <div className="flex items-center justify-center h-full text-[#5a5a5a] text-[13px]">
            No disputes filed on chain yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 12, left: -4, bottom: 0 }}>
              <CartesianGrid
                vertical={true}
                horizontal={false}
                stroke="#272727"
                strokeDasharray="4 4"
              />
              <XAxis
                dataKey="month"
                tick={{ fill: "#5a5a5a", fontSize: 13, fontFamily: "var(--font-dm-sans)" }}
                axisLine={false}
                tickLine={false}
                dy={8}
              />
              <YAxis
                domain={[0, "auto"]}
                tickFormatter={(v) => (v === 0 ? "0" : `${v}%`)}
                tick={{ fill: "#5a5a5a", fontSize: 13, fontFamily: "var(--font-dm-sans)" }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Line
                type="natural"
                dataKey="ratePct"
                stroke="#3064FF"
                strokeWidth={2.5}
                dot={<CustomDot />}
                activeDot={{
                  r: 6,
                  fill: "#3064FF",
                  stroke: "#ffffff",
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
