"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Wallet01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import type { WalletState } from "@/lib/interlock/useWallet";

function short(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Connect / disconnect an external wallet (MetaMask, Core). Pass a shared
 *  useWallet() state so the drawer and button stay in sync. */
export function ConnectWalletButton({ wallet, size = "md" }: { wallet: WalletState; size?: "sm" | "md" }) {
  const pad = size === "sm" ? "px-2.5 py-1.5 text-[12px]" : "px-3 py-2 text-[13px]";

  if (wallet.address) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.25)] px-2.5 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
          <code className="text-[12px] text-[#4ade80] font-mono">{short(wallet.address)}</code>
        </span>
        <button
          onClick={wallet.disconnect}
          title="Disconnect"
          className="text-[#5a5a5a] hover:text-white transition-colors"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={13} color="currentColor" strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={wallet.connect}
        disabled={wallet.connecting}
        className={`flex items-center gap-2 rounded-full bg-[#222834] border border-[#2c323d] text-[#d4d4d4] hover:text-white hover:border-[#3a3a3a] disabled:opacity-60 transition-colors ${pad}`}
      >
        <HugeiconsIcon icon={Wallet01Icon} size={14} color="currentColor" strokeWidth={1.5} />
        {wallet.connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {wallet.error && <span className="text-[11px] text-[#f87171]">{wallet.error}</span>}
      {!wallet.available && !wallet.error && (
        <span className="text-[11px] text-[#5a5a5a]">No wallet detected. Install MetaMask or Core.</span>
      )}
    </div>
  );
}
