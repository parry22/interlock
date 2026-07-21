"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayCircleIcon, ArrowDownIcon } from "@hugeicons/core-free-icons";

import { LifecycleDemoDrawer } from "@/components/LifecycleDemoDrawer";

/**
 * Floating action button that opens the lifecycle drawer. Used from any
 * server component (e.g., /dashboard) that can't directly render the drawer
 * because it'd flip the page to client.
 */
export function RunDemoButton({
  variant = "primary",
}: {
  variant?: "primary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"success" | "failure">("success");
  const [menuOpen, setMenuOpen] = useState(false);

  const primary = variant === "primary";

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => {
          setMode("success");
          setOpen(true);
        }}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-l-full text-[13px] font-medium transition-colors ${
          primary
            ? "bg-[#3064FF] hover:bg-[#2050d0] text-white"
            : "bg-[#171718] border border-[#1e1e1e] text-[#a3a3a3] hover:text-white hover:border-[#2a2a2a]"
        }`}
      >
        <HugeiconsIcon icon={PlayCircleIcon} size={14} color="currentColor" strokeWidth={1.5} />
        Run a test workflow
      </button>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className={`px-2 py-2 rounded-r-full border-l text-[13px] transition-colors ${
          primary
            ? "bg-[#3064FF] hover:bg-[#2050d0] border-[#2050d0] text-white"
            : "bg-[#171718] border-[#1e1e1e] text-[#a3a3a3] hover:text-white"
        }`}
      >
        <HugeiconsIcon
          icon={ArrowDownIcon}
          size={12}
          color="currentColor"
          strokeWidth={2}
          className={menuOpen ? "rotate-180 transition-transform" : "transition-transform"}
        />
      </button>

      {menuOpen && (
        <div
          className="absolute right-0 top-full mt-1.5 bg-[#1a1a1a] border border-[#272727] rounded-xl overflow-hidden shadow-2xl z-50 min-w-[200px]"
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            onClick={() => {
              setMode("success");
              setOpen(true);
              setMenuOpen(false);
            }}
            className="block w-full px-4 py-2.5 text-left text-[13px] text-[#a3a3a3] hover:text-white hover:bg-[#1e1e1e] transition-colors"
          >
            <span className="font-medium">Successful outcome</span>
            <span className="block text-[11px] text-[#5a5a5a]">Escrow splits and pays every party</span>
          </button>
          <button
            onClick={() => {
              setMode("failure");
              setOpen(true);
              setMenuOpen(false);
            }}
            className="block w-full px-4 py-2.5 text-left text-[13px] text-[#a3a3a3] hover:text-white hover:bg-[#1e1e1e] transition-colors border-t border-[#272727]"
          >
            <span className="font-medium">Failed outcome</span>
            <span className="block text-[11px] text-[#5a5a5a]">Escrow refunds the customer in full</span>
          </button>
        </div>
      )}

      <LifecycleDemoDrawer
        open={open}
        onClose={() => setOpen(false)}
        outcomeMode={mode}
      />
    </div>
  );
}
