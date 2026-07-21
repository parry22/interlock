"use client";

// Connect an external wallet (MetaMask / Core / any EIP-1193 injected wallet)
// so the user signs their own transactions and custodies their own funds —
// no platform-held key. Uses ethers' BrowserProvider (no extra deps).
//
// The connected wallet must be on Avalanche Fuji (43113); we prompt to switch
// or add the chain automatically.

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";

const FUJI = {
  chainIdHex: "0xa869", // 43113
  params: {
    chainId: "0xa869",
    chainName: "Avalanche Fuji Testnet",
    nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
    rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
    blockExplorerUrls: ["https://testnet.snowtrace.io"],
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injected(): any | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null;
}

export type WalletState = {
  address: string | null;
  connecting: boolean;
  error: string | null;
  available: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  getSigner: () => Promise<ethers.Signer>;
};

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(Boolean(injected()));
    const eth = injected();
    if (!eth) return;
    // Reflect account changes from the wallet UI.
    const onAccounts = (accts: string[]) => setAddress(accts[0] ?? null);
    eth.on?.("accountsChanged", onAccounts);
    // Restore an already-authorized account without prompting.
    eth.request?.({ method: "eth_accounts" })
      .then((accts: string[]) => { if (accts?.[0]) setAddress(accts[0]); })
      .catch(() => undefined);
    return () => eth.removeListener?.("accountsChanged", onAccounts);
  }, []);

  const ensureChain = useCallback(async () => {
    const eth = injected();
    if (!eth) throw new Error("no injected wallet");
    const current = await eth.request({ method: "eth_chainId" });
    if (current === FUJI.chainIdHex) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: FUJI.chainIdHex }] });
    } catch (e) {
      // 4902 = chain not added; add it then switch.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((e as any)?.code === 4902) {
        await eth.request({ method: "wallet_addEthereumChain", params: [FUJI.params] });
      } else {
        throw e;
      }
    }
  }, []);

  const connect = useCallback(async () => {
    const eth = injected();
    if (!eth) {
      setError("No wallet found. Install MetaMask or Core to connect.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accts: string[] = await eth.request({ method: "eth_requestAccounts" });
      await ensureChain();
      setAddress(accts[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }, [ensureChain]);

  const disconnect = useCallback(() => setAddress(null), []);

  const getSigner = useCallback(async () => {
    const eth = injected();
    if (!eth) throw new Error("no injected wallet");
    await ensureChain();
    const provider = new ethers.BrowserProvider(eth);
    return provider.getSigner();
  }, [ensureChain]);

  return { address, connecting, error, available, connect, disconnect, getSigner };
}
