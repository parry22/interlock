"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SearchIcon,
  UserGroupIcon,
  CoinsDollarIcon,
  AnalyticsUpIcon,
  AddCircleIcon,
  Cancel01Icon,
  CopyIcon,
} from "@hugeicons/core-free-icons";

// ─── Types ───────────────────────────────────────────────────────────────────

type CustomerRow = {
  address: string;
  name: string;
  email?: string;
  slug: string;
  notes?: string;
  createdAtMs: number;
  workflowCount: number;
  totalSettled: number;
  totalEscrowed: number;
  margin: number;
  refundedCount: number;
};

type UnlinkedRow = {
  address: string;
  workflowCount: number;
  totalSettled: number;
  totalEscrowed: number;
  margin: number;
  refundedCount: number;
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatSui(base: number): string {
  return `${(base / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC`;
}
function shortAddr(addr: string): string {
  if (!addr) return "—";
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;
}
function dateLabel(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString();
}

// ─── KPI cards ───────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
}) {
  return (
    <div className="flex flex-col gap-1 bg-[#171718] rounded-[20px] px-4 py-3 border border-[#1e1e1e]">
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={icon} size={13} color="#5a5a5a" strokeWidth={1.5} />
        <p className="text-[#5a5a5a] text-[13px] font-medium">{label}</p>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-white text-[28px] font-semibold leading-none tracking-tight">{value}</span>
        <span className="text-[12px] font-medium text-[#5a5a5a]">{sub}</span>
      </div>
    </div>
  );
}

// ─── Add customer form ───────────────────────────────────────────────────────

function AddCustomerForm({
  defaultAddress = "",
  onSaved,
  onCancel,
}: {
  defaultAddress?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [address, setAddress] = useState(defaultAddress);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, name, email: email || undefined }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-white">Add customer</span>
        <button onClick={onCancel} className="text-[#5a5a5a] hover:text-[#a3a3a3]">
          <HugeiconsIcon icon={Cancel01Icon} size={16} color="currentColor" strokeWidth={1.5} />
        </button>
      </div>
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Sui address (0x…)"
        className="bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] font-mono outline-none focus:border-[#2a2a2a]"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Customer name"
        className="bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] outline-none focus:border-[#2a2a2a]"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional)"
        className="bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-[#d4d4d4] outline-none focus:border-[#2a2a2a]"
      />
      {error && <p className="text-[12px] text-[#f87171]">{error}</p>}
      <button
        disabled={busy || !address || !name}
        onClick={save}
        className="self-start px-4 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] disabled:bg-[#1e1e1e] disabled:text-[#5a5a5a] text-white transition-colors"
      >
        {busy ? "Saving…" : "Save customer"}
      </button>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const COLS = "grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedRow[]>([]);
  const [kvLive, setKvLive] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [claimAddress, setClaimAddress] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/customers", { cache: "no-store" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setCustomers(json.customers ?? []);
      setUnlinked(json.unlinked ?? []);
      setKvLive(Boolean(json.kvLive));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      (c.email?.toLowerCase().includes(q) ?? false)
    );
  });

  const totalRevenue = customers.reduce((s, c) => s + c.totalSettled, 0);
  const totalWorkflows = customers.reduce((s, c) => s + c.workflowCount, 0);
  const totalCustomers = customers.length;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-4">
      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
        <KpiCard label="Customers (off-chain)" value={String(totalCustomers)} sub={kvLive ? "Vercel KV" : "in-memory"} icon={UserGroupIcon} />
        <KpiCard label="Workflows (on-chain)" value={String(totalWorkflows)} sub="all customers" icon={AnalyticsUpIcon} />
        <KpiCard label="Revenue (settled)" value={formatSui(totalRevenue)} sub="all customers" icon={CoinsDollarIcon} />
      </div>

      {/* Top bar */}
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#171718] border border-[#1e1e1e] rounded-full hover:border-[#2a2a2a] transition-colors">
          <HugeiconsIcon icon={SearchIcon} size={13} color="#5a5a5a" strokeWidth={1.5} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, address, email"
            className="bg-transparent text-[13px] text-[#a3a3a3] placeholder:text-[#5a5a5a] outline-none w-48 md:w-64"
          />
        </div>
        <button
          onClick={() => {
            setClaimAddress(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium bg-[#3064FF] hover:bg-[#2050d0] text-white transition-colors"
        >
          <HugeiconsIcon icon={AddCircleIcon} size={14} color="currentColor" strokeWidth={1.5} />
          Add customer
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <AddCustomerForm
          defaultAddress={claimAddress ?? ""}
          onCancel={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}

      {/* Unlinked addresses (on-chain activity, no off-chain record) */}
      {unlinked.length > 0 && (
        <div className="bg-[#171718] border border-[#1e1e1e] rounded-[20px] px-5 py-4">
          <span className="text-[13px] text-[#a3a3a3] font-medium block mb-3">
            {unlinked.length} address{unlinked.length === 1 ? "" : "es"} with on-chain activity but no off-chain record
          </span>
          <div className="flex flex-col gap-2">
            {unlinked.map((u) => (
              <div
                key={u.address}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-3 py-2 rounded-md bg-[#111] border border-[#1e1e1e]"
              >
                <span className="font-mono text-[12px] text-[#a3a3a3]">{shortAddr(u.address)}</span>
                <span className="text-[#6b6b6b] text-[12px]">{u.workflowCount} workflows</span>
                <span className="text-[#d4d4d4] text-[13px]">{formatSui(u.totalSettled)}</span>
                <button
                  onClick={() => {
                    setClaimAddress(u.address);
                    setShowForm(true);
                  }}
                  className="text-[12px] px-2.5 py-1 rounded-full bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white transition-colors"
                >
                  Claim
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer table */}
      <div className="relative bg-[#171718] rounded-[20px] border border-[#1e1e1e] overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-225">
            <div className={`grid ${COLS} items-center px-6 py-4`}>
              {["Customer", "Address", "Workflows", "Settled", "Margin", "Added"].map((h) => (
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
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center py-16 border-t border-dashed border-[#272727]">
                <span className="text-[#5a5a5a] text-[13px]">
                  {customers.length === 0 ? "No customers yet. Click 'Add customer' to onboard one." : "No matches."}
                </span>
              </div>
            ) : (
              filtered.map((c) => (
                <div
                  key={c.address}
                  className={`grid ${COLS} items-center px-6 py-3.5 border-t border-dashed border-[#272727] hover:bg-[#1c1c1c] transition-colors`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[#d4d4d4] text-[14px] font-medium truncate">{c.name}</span>
                    {c.email && <span className="text-[#5a5a5a] text-[12px] truncate">{c.email}</span>}
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(c.address)}
                    className="text-[#a3a3a3] text-[13px] font-mono text-left hover:text-white inline-flex items-center gap-1.5"
                  >
                    {shortAddr(c.address)}
                    <HugeiconsIcon icon={CopyIcon} size={11} color="#5a5a5a" strokeWidth={1.5} />
                  </button>
                  <span className="text-[#d4d4d4] text-[14px]">{c.workflowCount}</span>
                  <span className="text-[#d4d4d4] text-[14px] font-medium">{formatSui(c.totalSettled)}</span>
                  <span
                    className="text-[14px] font-medium"
                    style={{ color: c.margin >= 0 ? "#4ade80" : "#f87171" }}
                  >
                    {formatSui(c.margin)}
                  </span>
                  <span className="text-[#5a5a5a] text-[13px]">{dateLabel(c.createdAtMs)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
