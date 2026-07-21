"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_NAV } from "@/lib/docs-nav";

/* ── Code block ──────────────────────────────────────────────────────── */
export function Code({
  lang,
  children,
}: {
  lang: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="rounded-xl overflow-hidden my-5"
      style={{ border: "1px solid #1e1e1e" }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ background: "#0d0d0f", borderBottom: "1px solid #1e1e1e" }}
      >
        <span
          className="text-[11px] font-medium tracking-wide uppercase"
          style={{ color: "#3a3a3a" }}
        >
          {lang}
        </span>
        <button
          onClick={copy}
          className="text-[11px] font-medium transition-colors"
          style={{ color: copied ? "#3064FF" : "#3a3a3a" }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {/* Code */}
      <pre
        className="overflow-x-auto"
        style={{
          background: "#0a0a0b",
          padding: "1rem 1.25rem",
          margin: 0,
          lineHeight: 1.65,
        }}
      >
        <code
          style={{
            fontFamily:
              '"JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace',
            fontSize: 13,
            color: "#d4d4d4",
          }}
        >
          {children.trim()}
        </code>
      </pre>
    </div>
  );
}

/* ── Callout box ─────────────────────────────────────────────────────── */
export function Callout({
  type = "info",
  children,
}: {
  type?: "info" | "warning" | "tip";
  children: React.ReactNode;
}) {
  const config = {
    info:    { color: "#3064FF", label: "Note",    bg: "rgba(48,100,255,0.06)"  },
    warning: { color: "#e0900a", label: "Warning", bg: "rgba(224,144,10,0.06)" },
    tip:     { color: "#22c55e", label: "Tip",     bg: "rgba(34,197,94,0.06)"  },
  }[type];

  return (
    <div
      className="rounded-xl px-5 py-4 my-5 text-[14px] leading-relaxed"
      style={{
        background: config.bg,
        border: `1px solid ${config.color}22`,
        color: "#a3a3a3",
      }}
    >
      <span className="font-semibold mr-2" style={{ color: config.color }}>
        {config.label}
      </span>
      {children}
    </div>
  );
}

/* ── Pill / badge ────────────────────────────────────────────────────── */
export function MethodBadge({ method }: { method: "GET" | "POST" | "DELETE" | "PATCH" }) {
  const colors = {
    GET:    { bg: "rgba(34,197,94,0.12)",   color: "#22c55e" },
    POST:   { bg: "rgba(48,100,255,0.12)",  color: "#3064FF" },
    DELETE: { bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
    PATCH:  { bg: "rgba(234,179,8,0.12)",   color: "#eab308" },
  }[method];

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold mr-2"
      style={{ background: colors.bg, color: colors.color }}
    >
      {method}
    </span>
  );
}

/* ── Docs layout ─────────────────────────────────────────────────────── */
export function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex flex-col h-full" style={{ background: "#080808" }}>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header
        className="flex-shrink-0 h-14 flex items-center px-5 z-40"
        style={{
          borderBottom: "1px solid #141414",
          background: "#080808",
          position: "sticky",
          top: 0,
        }}
      >
        <div className="flex items-center justify-between w-full max-w-[1400px] mx-auto">
          {/* Left: logo + docs label */}
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              className="md:hidden flex items-center justify-center w-8 h-8 rounded mr-1"
              style={{ color: "#808080" }}
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                <rect width="16" height="1.5" rx="0.75" fill="currentColor" />
                <rect y="5.25" width="16" height="1.5" rx="0.75" fill="currentColor" />
                <rect y="10.5" width="16" height="1.5" rx="0.75" fill="currentColor" />
              </svg>
            </button>

            <Link href="/">
              <img src="/logo.svg" alt="Interlock" width={100} height={20} />
            </Link>

            <div
              className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{ background: "#111113", border: "1px solid #1e1e1e", color: "#808080" }}
            >
              <span style={{ color: "#3064FF" }}>●</span>
              Docs
            </div>
          </div>

          {/* Right: version + dashboard link */}
          <div className="flex items-center gap-4">
            <span
              className="hidden sm:block text-[12px]"
              style={{ color: "#3a3a3a" }}
            >
              v1.4.2
            </span>
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:text-white"
              style={{ color: "#808080" }}
            >
              Dashboard
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Body: sidebar + content ──────────────────────────── */}
      <div className="flex flex-1 overflow-hidden max-w-[1400px] mx-auto w-full">

        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/70 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed md:relative z-40 md:z-auto
            top-14 md:top-0
            w-[240px] flex-shrink-0
            h-[calc(100svh-56px)] md:h-full
            overflow-y-auto
            flex flex-col gap-6 pt-5 pb-8 px-5
            transition-transform duration-300 md:translate-x-0
            ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          `}
          style={{
            background: "#080808",
            borderRight: "1px solid #141414",
          }}
        >
          {DOCS_NAV.map((group) => (
            <div key={group.section} className="flex flex-col gap-1">
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: "#3a3a3a" }}
              >
                {group.section}
              </p>
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center text-[13px] rounded-lg px-3 py-1.5 transition-colors"
                    style={{
                      color: active ? "#3064FF" : "#808080",
                      background: active ? "rgba(48,100,255,0.08)" : "transparent",
                      fontWeight: active ? 500 : 400,
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Bottom: external links */}
          <div
            className="mt-auto flex flex-col gap-1 pt-6"
            style={{ borderTop: "1px solid #141414" }}
          >
            {[
              { label: "Changelog",  href: "/changelog" },
              { label: "GitHub",     href: "#" },
              { label: "Status",     href: "#" },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg transition-colors hover:text-white"
                style={{ color: "#3a3a3a" }}
              >
                {l.label}
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="opacity-40">
                  <path d="M1 8L8 1M8 1H3M8 1V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </a>
            ))}
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[760px] px-8 md:px-12 pt-8 pb-12">
            {children}
          </div>
        </main>

      </div>
    </div>
  );
}
