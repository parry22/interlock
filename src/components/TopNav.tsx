"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BellDotIcon, SearchIcon, MenuIcon,
  DashboardSquareIcon, WorkflowCircleIcon, LegalDocumentIcon,
  BankIcon, TrendingUpDownIcon, PresentationBarChartIcon,
  UserGroupIcon, DeveloperIcon, SettingsIcon, StoreIcon,
  CopyIcon, ArrowLeft01Icon, ArrowRightDoubleIcon,
} from "@hugeicons/core-free-icons";

// ─── Page meta ────────────────────────────────────────────────────────────────
//
// Every entry answers one question for someone who just landed here: "what
// is this page for?" Keep descriptions concrete (name the actual thing shown)
// rather than generic ("manage X"). Dynamic routes (e.g. /agents/acme-bot)
// are matched by the longest prefix in `resolvePageMeta` below.

type IconType = React.ComponentProps<typeof HugeiconsIcon>["icon"];

type PageMeta = {
  title: string;
  description: string;
  icon: IconType;
};

const PAGE_META: Record<string, PageMeta> = {
  "/":              { title: "Overview",       description: "Live activity across every workflow, updated as it happens",          icon: DashboardSquareIcon      },
  "/dashboard":     { title: "Overview",       description: "Live activity across every workflow, updated as it happens",          icon: DashboardSquareIcon      },
  "/marketplace":   { title: "Hire an agent",  description: "Describe the job, get matched to a priced, registered agent",         icon: StoreIcon                },
  "/agents":        { title: "Browse agents",  description: "Every agent registered on Interlock, with pricing and track record",    icon: UserGroupIcon            },
  "/workflows":     { title: "Workflows",      description: "Every agent job, from quote to payout",                              icon: WorkflowCircleIcon       },
  "/quotes":        { title: "Quotes",         description: "Prices and success criteria you've committed to, before work begins", icon: LegalDocumentIcon        },
  "/settlement":    { title: "Payouts",        description: "Where the money goes: agents, providers, platform fee, and refunds",  icon: BankIcon                 },
  "/margin":        { title: "Margin",         description: "What you keep after provider costs, per customer and per workflow",   icon: TrendingUpDownIcon       },
  "/pricing-intel": { title: "Pricing Intel",  description: "Coming soon: competitive benchmarks and pricing recommendations",      icon: PresentationBarChartIcon },
  "/customers":     { title: "Customers",      description: "Everyone who's paid you, and how much they're worth",                icon: UserGroupIcon            },
  "/developer":     { title: "Developer",      description: "API keys, webhooks, and everything you need to integrate",           icon: DeveloperIcon            },
  "/settings":      { title: "Settings",       description: "Your account, webhook delivery, and platform preferences",           icon: SettingsIcon             },
};

/** Longest-prefix match so dynamic routes (e.g. /agents/acme-bot, /agents/new)
 *  inherit their section's title instead of silently falling back to "Overview". */
function resolvePageMeta(pathname: string): PageMeta {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  const prefixes = Object.keys(PAGE_META)
    .filter((p) => p !== "/" && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length);
  return PAGE_META[prefixes[0]] ?? PAGE_META["/"];
}

// ─── Spotlight search data ────────────────────────────────────────────────────

type SpotlightItem = {
  type: "page" | "workflow" | "customer";
  label: string;
  sub: string;
  href: string;
  icon: IconType;
};

const SPOTLIGHT_ITEMS: SpotlightItem[] = [
  { type: "page",     label: "Overview",       sub: "Your platform at a glance",                   href: "/",              icon: DashboardSquareIcon      },
  { type: "page",     label: "Workflows",      sub: "Monitor and manage workflow executions",       href: "/workflows",     icon: WorkflowCircleIcon       },
  { type: "page",     label: "Quotes",         sub: "Build and manage pricing quotes",              href: "/quotes",        icon: LegalDocumentIcon        },
  { type: "page",     label: "Settlement",     sub: "Track payouts, escrow and disputes",           href: "/settlement",    icon: BankIcon                 },
  { type: "page",     label: "Margin",         sub: "Analyse profitability",                        href: "/margin",        icon: TrendingUpDownIcon       },
  { type: "page",     label: "Pricing Intel",  sub: "Benchmarks and demand elasticity",             href: "/pricing-intel", icon: PresentationBarChartIcon },
  { type: "page",     label: "Customers",      sub: "Manage customer relationships",               href: "/customers",     icon: UserGroupIcon            },
  { type: "page",     label: "Developer",      sub: "API keys and SDK configuration",              href: "/developer",     icon: DeveloperIcon            },
  { type: "page",     label: "Settings",       sub: "Platform preferences",                        href: "/settings",      icon: SettingsIcon             },
  { type: "workflow", label: "wf_e4rgffg44fg4g44", sub: "Acme Inc · $23.53",                       href: "/workflows",     icon: WorkflowCircleIcon       },
  { type: "workflow", label: "wf_c6d7e8f9g0h1i2",  sub: "Beco – Beta Corporation · $0.14",        href: "/workflows",     icon: WorkflowCircleIcon       },
  { type: "workflow", label: "wf_j3k4l5m6n7o8p9",  sub: "Nation – National Group · $0.48",        href: "/workflows",     icon: WorkflowCircleIcon       },
  { type: "customer", label: "Acme Inc",            sub: "Enterprise · Active",                    href: "/customers",     icon: UserGroupIcon            },
  { type: "customer", label: "Beco – Beta Corporation", sub: "Enterprise · Active",                href: "/customers",     icon: UserGroupIcon            },
  { type: "customer", label: "Meridian Solutions",  sub: "Growth · Trial",                         href: "/customers",     icon: UserGroupIcon            },
];

const TYPE_LABEL: Record<SpotlightItem["type"], string> = {
  page: "Pages",
  workflow: "Workflows",
  customer: "Customers",
};

// ─── Notifications data ───────────────────────────────────────────────────────

const NOTIFICATIONS = [
  { id: 1, title: "New dispute raised",        body: "Crestfield Partners disputed $2,100.00",    time: "2m ago",   unread: true  },
  { id: 2, title: "Settlement processed",      body: "NAW – Nationwide Corp. · $1,240.00 paid",  time: "14m ago",  unread: true  },
  { id: 3, title: "Escrow window expiring",    body: "wf_j3k4l5m6n7o8p9 expires in 24 hours",    time: "1h ago",   unread: true  },
  { id: 4, title: "Quote accepted",            body: "Acme Inc accepted Enterprise quote",        time: "3h ago",   unread: false },
  { id: 5, title: "Margin alert",              body: "NAW margin dropped below 15% threshold",   time: "5h ago",   unread: false },
];

// ─── Spotlight modal ──────────────────────────────────────────────────────────

function SpotlightModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery]     = useState("");
  const [active, setActive]   = useState(0);
  const inputRef              = useRef<HTMLInputElement>(null);
  const router                = useRouter();

  const results = query.trim()
    ? SPOTLIGHT_ITEMS.filter(
        (i) =>
          i.label.toLowerCase().includes(query.toLowerCase()) ||
          i.sub.toLowerCase().includes(query.toLowerCase())
      )
    : SPOTLIGHT_ITEMS.filter((i) => i.type === "page");

  // Group by type
  const grouped = results.reduce<Record<string, SpotlightItem[]>>((acc, item) => {
    const k = item.type;
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});

  const flat = results;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [query]);

  const navigate = useCallback(
    (href: string) => { router.push(href); onClose(); },
    [router, onClose]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      if (e.key === "Enter" && flat[active]) navigate(flat[active].href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, active, navigate, onClose]);

  let idx = 0;

  return (
    <div
      className="fixed inset-0 z-9999 flex items-start justify-center pt-[18vh] bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-150 bg-[#141414] border border-[#272727] rounded-2xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#1e1e1e]">
          <HugeiconsIcon icon={SearchIcon} size={16} color="#5a5a5a" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, workflows, customers…"
            className="flex-1 bg-transparent text-[14px] text-[#d4d4d4] placeholder:text-[#3a3a3a] outline-none"
          />
          <kbd className="text-[11px] text-[#3a3a3a] bg-[#1a1a1a] border border-[#272727] px-1.5 py-0.5 rounded-md font-mono">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-105 overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <span className="text-[#3a3a3a] text-[13px]">No results for &ldquo;{query}&rdquo;</span>
            </div>
          ) : (
            Object.entries(grouped).map(([type, items]) => (
              <div key={type} className="mb-1">
                <p className="text-[#3a3a3a] text-[11px] font-semibold uppercase tracking-widest px-4 py-2">
                  {TYPE_LABEL[type as SpotlightItem["type"]]}
                </p>
                {items.map((item) => {
                  const itemIdx = idx++;
                  const isActive = active === itemIdx;
                  return (
                    <button
                      key={item.label + item.href}
                      onMouseEnter={() => setActive(itemIdx)}
                      onClick={() => navigate(item.href)}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                        isActive ? "bg-[#1e1e1e]" : ""
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-[#2a2a2a]" : "bg-[#1a1a1a]"}`}>
                        <HugeiconsIcon icon={item.icon} size={14} color={isActive ? "#a3a3a3" : "#5a5a5a"} strokeWidth={1.5} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-[13px] font-medium truncate ${isActive ? "text-[#d4d4d4]" : "text-[#6b6b6b]"}`}>
                          {item.label}
                        </span>
                        <span className="text-[12px] text-[#3a3a3a] truncate">{item.sub}</span>
                      </div>
                      {isActive && (
                        <span className="ml-auto text-[11px] text-[#3a3a3a] shrink-0">↵ open</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[#1e1e1e]">
          <span className="text-[#3a3a3a] text-[11px]"><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span className="text-[#3a3a3a] text-[11px]"><kbd className="font-mono">↵</kbd> open</span>
          <span className="text-[#3a3a3a] text-[11px]"><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Notifications dropdown ───────────────────────────────────────────────────

function NotificationsDropdown({ onClose, upward }: { onClose: () => void; upward?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const unreadCount = NOTIFICATIONS.filter((n) => n.unread).length;

  return (
    <div
      ref={ref}
      className={`absolute right-0 w-[320px] md:w-85 bg-[#141414] border border-[#272727] rounded-2xl shadow-2xl overflow-hidden z-50 ${
        upward ? "bottom-full mb-2" : "top-full mt-2"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#1e1e1e]">
        <span className="text-[#d4d4d4] text-[13px] font-semibold">Notifications</span>
        {unreadCount > 0 && (
          <span className="text-[11px] text-[#4ade80] bg-[rgba(74,222,128,0.1)] px-2 py-0.5 rounded-full font-medium">
            {unreadCount} new
          </span>
        )}
      </div>
      <div className="flex flex-col max-h-90 overflow-y-auto">
        {NOTIFICATIONS.map((n) => (
          <div
            key={n.id}
            className={`flex items-start gap-3 px-4 py-3.5 border-b border-dashed border-[#1e1e1e] last:border-0 transition-colors hover:bg-[#1a1a1a] ${n.unread ? "" : "opacity-50"}`}
          >
            {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] shrink-0 mt-1.5" />}
            {!n.unread && <span className="w-1.5 h-1.5 shrink-0 mt-1.5" />}
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[#d4d4d4] text-[13px] font-medium">{n.title}</span>
              <span className="text-[#5a5a5a] text-[12px] truncate">{n.body}</span>
              <span className="text-[#3a3a3a] text-[11px] mt-0.5">{n.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TopNav ───────────────────────────────────────────────────────────────────

export function TopNav({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname              = usePathname();
  const [spotlight, setSpotlight] = useState(false);
  const [notifs, setNotifs]       = useState(false);

  const meta = resolvePageMeta(pathname);
  const unread = NOTIFICATIONS.filter((n) => n.unread).length;

  // Workflow detail detection
  const isWorkflowDetail = /^\/workflows\/.+/.test(pathname);
  const wfId = isWorkflowDetail ? pathname.replace("/workflows/", "") : null;

  // Cmd+K / Ctrl+K to open spotlight
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSpotlight((s) => !s);
        setNotifs(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {spotlight && <SpotlightModal onClose={() => setSpotlight(false)} />}

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 md:px-6 pt-4 pb-3 shrink-0">
        {/* Title + description */}
        {isWorkflowDetail ? (
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href="/workflows"
                className="flex items-center gap-1.5 text-[12px] text-[#5a5a5a] hover:text-[#a3a3a3] transition-colors shrink-0"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={11} color="currentColor" strokeWidth={2} />
                <span className="hidden md:inline">Workflows</span>
              </Link>
              <span className="hidden md:inline text-[#2a2a2a] text-[13px] shrink-0">/</span>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-mono text-[13px] font-semibold text-[#d4d4d4] truncate max-w-27.5 md:max-w-none">
                  {wfId}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(wfId ?? "")}
                  className="text-[#3a3a3a] hover:text-[#a3a3a3] transition-colors shrink-0"
                >
                  <HugeiconsIcon icon={CopyIcon} size={12} color="currentColor" strokeWidth={1.5} />
                </button>
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0"
                  style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80" }}
                >
                  Settled
                </span>
              </div>
            </div>
            <p className="hidden md:block text-[#3a3a3a] text-[12px] leading-none">
              Acme Inc · Ticket Resolution v2 · May 16–17, 2026
            </p>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <h1 className="text-white text-[14px] font-semibold tracking-tight leading-none">
              {meta.title}
            </h1>
            <span className="hidden md:inline text-[#2a2a2a] text-[12px]">·</span>
            <p className="hidden md:block text-[#4d4d4d] text-[12px] leading-none">{meta.description}</p>
          </div>
        )}

        {/* Right: desktop controls + mobile hamburger */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Block explorer link — workflow detail only */}
          {isWorkflowDetail && (
            <button className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-[#171718] border border-[#1e1e1e] rounded-xl text-[12px] text-[#5a5a5a] hover:border-[#2a2a2a] hover:text-[#a3a3a3] transition-colors">
              <HugeiconsIcon icon={ArrowRightDoubleIcon} size={12} color="currentColor" strokeWidth={1.5} />
              View on Snowtrace
            </button>
          )}

          {/* Desktop search */}
          <button
            onClick={() => { setSpotlight(true); setNotifs(false); }}
            className="hidden md:flex items-center gap-2.5 px-3 py-2 bg-[#171718] border border-[#1e1e1e] rounded-xl hover:border-[#2a2a2a] transition-colors"
          >
            <HugeiconsIcon icon={SearchIcon} size={13} color="#5a5a5a" strokeWidth={1.5} />
            <span className="text-[#3a3a3a] text-[13px] w-36 text-left">Search…</span>
            <span className="flex items-center gap-0.5 ml-1">
              <kbd className="text-[11px] text-[#3a3a3a] bg-[#1a1a1a] border border-[#272727] px-1.5 py-0.5 rounded font-mono leading-none">⌘</kbd>
              <kbd className="text-[11px] text-[#3a3a3a] bg-[#1a1a1a] border border-[#272727] px-1.5 py-0.5 rounded font-mono leading-none">K</kbd>
            </span>
          </button>

          {/* Desktop bell */}
          <div className="hidden md:block relative">
            <button
              onClick={() => { setNotifs((n) => !n); setSpotlight(false); }}
              className="relative flex items-center justify-center w-9 h-9 bg-[#171718] border border-[#1e1e1e] rounded-xl hover:border-[#2a2a2a] transition-colors"
            >
              <HugeiconsIcon icon={BellDotIcon} size={16} color="#6b6b6b" strokeWidth={1.5} />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#4ade80]" />
              )}
            </button>
            {notifs && <NotificationsDropdown onClose={() => setNotifs(false)} />}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={onMenuClick}
            className="md:hidden flex items-center justify-center w-8 h-8 text-[#6b6b6b] hover:text-[#a3a3a3] transition-colors"
          >
            <HugeiconsIcon icon={MenuIcon} size={20} color="currentColor" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Mobile bottom bar — glass effect */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-50 px-4 pb-5 pt-3 flex items-end gap-3 pointer-events-none">
        {/* Search */}
        <button
          onClick={() => { setSpotlight(true); setNotifs(false); }}
          className="flex-1 flex items-center gap-2.5 px-4 py-3 bg-[#171718]/60 backdrop-blur-xl border border-white/[0.07] rounded-2xl pointer-events-auto"
        >
          <HugeiconsIcon icon={SearchIcon} size={15} color="#5a5a5a" strokeWidth={1.5} />
          <span className="flex-1 text-left text-[#3a3a3a] text-[13px]">Search…</span>
          <span className="flex items-center gap-0.5">
            <kbd className="text-[11px] text-[#3a3a3a] bg-[#1a1a1a] border border-[#272727] px-1.5 py-0.5 rounded font-mono leading-none">⌘</kbd>
            <kbd className="text-[11px] text-[#3a3a3a] bg-[#1a1a1a] border border-[#272727] px-1.5 py-0.5 rounded font-mono leading-none">K</kbd>
          </span>
        </button>

        {/* Bell */}
        <div className="relative pointer-events-auto">
          <button
            onClick={() => { setNotifs((n) => !n); setSpotlight(false); }}
            className="relative flex items-center justify-center w-12 h-12 bg-[#171718]/60 backdrop-blur-xl border border-white/[0.07] rounded-2xl"
          >
            <HugeiconsIcon icon={BellDotIcon} size={18} color="#6b6b6b" strokeWidth={1.5} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#4ade80]" />
            )}
          </button>
          {notifs && <NotificationsDropdown onClose={() => setNotifs(false)} upward />}
        </div>
      </div>
    </>
  );
}
