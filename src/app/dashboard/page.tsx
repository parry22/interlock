import { TopCustomersChart, type TopCustomersDatum } from "@/components/TopCustomersChart";
import { DisputeRateChart, type DisputeRateDatum } from "@/components/DisputeRateChart";
import { RunDemoButton } from "@/components/RunDemoButton";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CoinsDollarIcon,
  AnalyticsUpIcon,
  FlowchartIcon,
  BalanceScaleIcon,
} from "@hugeicons/core-free-icons";
import {
  customerAggregates,
  dashboardStats,
  disputeStats,
  listWorkflows,
} from "@/lib/db/queries";
import { formatSui, marginPercent, relativeTime, shortenAddress } from "@/lib/interlock/format";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

const SUI_DECIMALS = 6; // USDC base units

// Fetch fresh on every page load — single-customer demo scale, no caching needed.
export const dynamic = "force-dynamic";

type Metric = {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
};

function MetricCard({ metric }: { metric: Metric }) {
  const color = metric.positive ? "#4ade80" : "#f87171";
  return (
    <div className="flex flex-col gap-1 bg-[#171718] rounded-[20px] px-4 py-3 border border-[#1e1e1e]">
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={metric.icon} size={13} color="#5a5a5a" strokeWidth={1.5} />
        <p className="text-[#5a5a5a] text-[13px] font-medium">{metric.label}</p>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-white text-[28px] font-semibold leading-none tracking-tight">{metric.value}</span>
        <span className="text-[12px] font-semibold" style={{ color }}>{metric.change}</span>
      </div>
    </div>
  );
}

type Activity = {
  id: string;
  customer: string;
  cost: string;
  time: string;
};

function LiveActivityCard({ activities }: { activities: Activity[] }) {
  return (
    <div className="relative flex flex-col h-full bg-[#171718] rounded-[20px] border border-[#1e1e1e] overflow-hidden">
      <div className="md:hidden absolute inset-y-0 right-0 w-10 z-10 pointer-events-none rounded-r-[20px]" style={{ background: "linear-gradient(to right, transparent, #171718)" }} />
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <span className="text-[#a3a3a3] text-[13px] font-medium">Live Activity (Avalanche Fuji)</span>
      </div>

      {/* Horizontal scroll wrapper */}
      <div className="flex-1 min-h-0 overflow-x-auto flex flex-col">
        <div className="min-w-110 flex flex-col flex-1 min-h-0">
          {/* Column headers */}
          <div className="grid grid-cols-4 px-5 pb-3 shrink-0">
            <span className="text-[#5a5a5a] text-[13px] font-medium">Workflow ID</span>
            <span className="text-[#5a5a5a] text-[13px] font-medium">Customer</span>
            <span className="text-[#5a5a5a] text-[13px] font-medium">Settled</span>
            <span className="text-[#5a5a5a] text-[13px] font-medium">Time</span>
          </div>

          {activities.length === 0 ? (
            <div className="px-5 py-10 text-center text-[#5a5a5a] text-[13px]">
              No workflows yet — run <code className="text-[#a3a3a3]">npm run lifecycle</code> to create one.
            </div>
          ) : (
            <div className="flex flex-col overflow-y-auto min-h-0">
              {activities.map((a, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 px-5 py-3 border-t border-dashed border-[#1e1e1e] shrink-0"
                >
                  <span className="text-[#6b6b6b] text-[14px] font-medium font-mono truncate pr-4">
                    {a.id}
                  </span>
                  <span className="text-[#d4d4d4] text-[14px] font-medium truncate pr-4 font-mono">
                    {a.customer}
                  </span>
                  <span className="text-[#d4d4d4] text-[14px] font-medium">
                    {a.cost}
                  </span>
                  <span className="text-[#5a5a5a] text-[14px] font-medium">
                    {a.time}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function Home() {
  // Auth is disabled for now (see proxy.ts) — anyone can load the dashboard.
  // Signed-in users still get their own data scoped; everyone else sees
  // unscoped, platform-wide activity.
  const user = await getCurrentUser();
  const scope = user ? { customer: effectiveOnChainAddress(user) } : {};
  const [stats, workflows, customers, disputes] = await Promise.all([
    dashboardStats(scope).catch(() => null),
    listWorkflows({ limit: 20, ...scope }).catch(() => []),
    customerAggregates({ limit: 50, ...scope }).catch(() => []),
    disputeStats(scope).catch(() => null),
  ]);

  const topCustomers: TopCustomersDatum[] = customers.slice(0, 5).map((c) => ({
    customer: shortenAddress(c.customer, 6, 4),
    gmv: c.totalSettled / 10 ** SUI_DECIMALS,
    escrowed: c.totalEscrowed / 10 ** SUI_DECIMALS,
  }));

  const disputeData: DisputeRateDatum[] =
    disputes?.byMonth.map((m) => ({
      month: m.month,
      ratePct: m.ratePct,
      disputes: m.disputes,
      settlements: m.settlements,
    })) ?? [];

  const totalRevenue = stats?.totalRevenue ?? 0;
  const totalMargin = stats?.totalMargin ?? 0;

  const metrics: Metric[] = [
    {
      label: "Total volume",
      value: formatSui(totalRevenue),
      change: `${stats?.settledCount ?? 0} settled`,
      positive: (stats?.settledCount ?? 0) > 0,
      icon: CoinsDollarIcon,
    },
    {
      label: "Average margin",
      value: marginPercent(totalRevenue, totalMargin),
      change: formatSui(totalMargin),
      positive: totalMargin > 0,
      icon: AnalyticsUpIcon,
    },
    {
      label: "Workflows",
      value: String(stats?.totalWorkflows ?? 0),
      change: `${stats?.inFlight ?? 0} in flight`,
      positive: (stats?.totalWorkflows ?? 0) > 0,
      icon: FlowchartIcon,
    },
    {
      label: "Platform fees",
      value: formatSui(stats?.totalPlatformFee ?? 0),
      change: `${stats?.refunded ?? 0} refunded`,
      positive: (stats?.refunded ?? 0) === 0,
      icon: BalanceScaleIcon,
    },
  ];

  const activities: Activity[] = workflows.map((w) => ({
    id: shortenAddress(w.id, 8, 4),
    customer: shortenAddress(w.customer, 8, 4),
    cost:
      w.statusEnum === 3
        ? formatSui(w.totalRevenue)
        : w.statusEnum === 5
          ? "refunded"
          : `escrow: ${formatSui(w.escrowBalance)}`,
    time: relativeTime(w.updatedAtMs),
  }));

  return (
    <div className="flex flex-1 flex-col overflow-y-auto lg:overflow-hidden p-4 lg:p-6 gap-4">
      {/* Title bar with demo trigger */}
      <div className="flex items-center justify-between gap-3 shrink-0 flex-wrap">
        <div>
          <h1 className="text-white text-[20px] font-semibold tracking-tight">Overview</h1>
          <p className="text-[#5a5a5a] text-[12px]">Live from Avalanche Fuji · refreshes on each page load</p>
        </div>
        <RunDemoButton />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 shrink-0">
        {metrics.map((m) => (
          <MetricCard key={m.label} metric={m} />
        ))}
      </div>

      {/* Bottom row */}
      <div className="flex flex-col lg:flex-row lg:flex-1 gap-4 lg:min-h-0">
        <div className="lg:flex-2 flex flex-col gap-4 lg:min-h-0">
          <div className="h-70 lg:h-auto lg:flex-1 lg:min-h-0">
            <TopCustomersChart data={topCustomers} />
          </div>
          <div className="h-70 lg:h-auto lg:flex-1 lg:min-h-0">
            <DisputeRateChart
              data={disputeData}
              totalDisputes={disputes?.totalDisputes ?? 0}
              totalSettled={disputes?.totalSettled ?? 0}
            />
          </div>
        </div>
        <div className="h-95 lg:h-auto lg:flex-3 lg:min-h-0">
          <LiveActivityCard activities={activities} />
        </div>
      </div>
    </div>
  );
}
