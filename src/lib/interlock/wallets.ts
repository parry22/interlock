// Per-user custodial wallets on Avalanche Fuji.
//
// Every signed-in user gets their own secp256k1 keypair at first sign-in.
// The private key is AES-256-GCM encrypted (SETTINGS_ENCRYPTION_KEY) at rest
// and decrypted only to sign that user's own transactions — so each user's
// workflows are created by, escrowed from, and refunded to THEIR address,
// not a shared platform key. A self-custodied wallet (MetaMask / Core) can
// replace this per-user without changing the contract side: the customer is
// just an address.
//
// Funding: testnet wallets are topped up automatically — a sliver of AVAX
// for gas from the platform admin wallet, and demo USDC via MockUSDC's open
// mint. On mainnet this becomes "deposit USDC to your Interlock address".

import { ethers } from "ethers";
import { eq } from "drizzle-orm";

import { db, users } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/db/encryption";
import { interlockSecrets } from "./config";
import { getProvider, usdcContract, walletFromHex } from "./evm";

/** Gas top-up threshold / amount. Fuji gas is ~2 wei; 0.002 AVAX is months of use. */
const GAS_TOPUP_WEI = ethers.parseEther("0.002");
const GAS_MIN_WEI = ethers.parseEther("0.0005");
/** Demo USDC grant: 1,000 USDC (6 decimals). */
const USDC_GRANT = 1_000_000_000n;
const USDC_MIN = 100_000_000n; // top up below 100 USDC

export type UserWalletInfo = {
  address: string;
  created: boolean;
};

/** Create the user's wallet if they don't have one yet. Returns the address. */
export async function getOrCreateUserWallet(googleSub: string): Promise<UserWalletInfo> {
  const d = db();
  const rows = await d.select().from(users).where(eq(users.googleSub, googleSub)).limit(1);
  if (rows.length > 0 && rows[0].walletAddress && rows[0].walletPrivkeyEncrypted) {
    return { address: rows[0].walletAddress, created: false };
  }

  const wallet = ethers.Wallet.createRandom();
  const encrypted = encrypt(wallet.privateKey);
  await d
    .update(users)
    .set({ walletAddress: wallet.address, walletPrivkeyEncrypted: encrypted })
    .where(eq(users.googleSub, googleSub));
  return { address: wallet.address, created: true };
}

/** Load + decrypt the user's signing wallet, provisioning one if the account
 *  predates wallets (or otherwise has none). Never throws for a known user. */
export async function getUserWallet(googleSub: string): Promise<ethers.Wallet> {
  const d = db();
  let rows = await d.select().from(users).where(eq(users.googleSub, googleSub)).limit(1);
  if (!rows[0]?.walletPrivkeyEncrypted) {
    // Heal pre-wallet accounts on demand.
    await getOrCreateUserWallet(googleSub);
    rows = await d.select().from(users).where(eq(users.googleSub, googleSub)).limit(1);
  }
  const row = rows[0];
  if (!row?.walletPrivkeyEncrypted) {
    throw new Error("could not provision a wallet for this user");
  }
  return walletFromHex(decrypt(row.walletPrivkeyEncrypted));
}

/** Return the user's wallet address, provisioning one if missing. The
 *  authoritative source for scoping + display (the cookie can be stale). */
export async function resolveWalletAddress(googleSub: string): Promise<string> {
  const { address } = await getOrCreateUserWallet(googleSub);
  return address.toLowerCase();
}

/** Load a user's signing wallet by their wallet address (for API-key callers,
 *  where we have the address but not the Google sub). */
export async function getUserWalletByAddress(address: string): Promise<ethers.Wallet> {
  const d = db();
  const rows = await d
    .select()
    .from(users)
    .where(eq(users.walletAddress, address.toLowerCase()))
    .limit(1);
  const row = rows[0];
  if (!row?.walletPrivkeyEncrypted) {
    // Case-insensitive fallback (addresses are stored checksummed by ethers).
    const all = await d.select().from(users);
    const match = all.find(
      (u) => u.walletAddress?.toLowerCase() === address.toLowerCase() && u.walletPrivkeyEncrypted,
    );
    if (!match?.walletPrivkeyEncrypted) {
      throw new Error(`no wallet found for address ${address}`);
    }
    return walletFromHex(decrypt(match.walletPrivkeyEncrypted));
  }
  return walletFromHex(decrypt(row.walletPrivkeyEncrypted));
}

export type FundResult = {
  gas: "funded" | "sufficient" | "error";
  usdc: "funded" | "sufficient" | "error";
  gasError?: string;
  usdcError?: string;
};

/** Best-effort testnet top-up: AVAX for gas + demo USDC. Never throws. */
export async function fundWalletIfNeeded(address: string): Promise<FundResult> {
  const result: FundResult = { gas: "sufficient", usdc: "sufficient" };
  const provider = getProvider();

  try {
    const bal = await provider.getBalance(address);
    if (bal < GAS_MIN_WEI) {
      const admin = walletFromHex(interlockSecrets.adminPrivkey);
      const tx = await admin.sendTransaction({ to: address, value: GAS_TOPUP_WEI });
      await tx.wait();
      result.gas = "funded";
    }
  } catch (e) {
    result.gas = "error";
    result.gasError = (e as Error).message;
  }

  try {
    const usdc = usdcContract();
    const bal: bigint = await usdc.balanceOf(address);
    if (bal < USDC_MIN) {
      const admin = walletFromHex(interlockSecrets.adminPrivkey);
      const tx = await usdcContract(admin).mint(address, USDC_GRANT);
      await tx.wait();
      result.usdc = "funded";
    }
  } catch (e) {
    result.usdc = "error";
    result.usdcError = (e as Error).message;
  }

  return result;
}
