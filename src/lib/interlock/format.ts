// Display formatters for USDC base units, addresses, and timestamps.
// Kept in one place so dashboard cards stay consistent.

/** 1 USDC = 1_000_000 base units (6 decimals). */
export const USDC_DECIMALS = 6;

/** Format a base-unit amount as `12.34 USDC` with 2-decimal precision. */
export function formatUsdc(baseUnits: number | bigint): string {
  const n = typeof baseUnits === "bigint" ? Number(baseUnits) : baseUnits;
  const usdc = n / 10 ** USDC_DECIMALS;
  return `${usdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
}

/** Bare numeric USDC value (no unit suffix), for chart axes and inline math. */
export function usdcAmount(baseUnits: number | bigint): number {
  const n = typeof baseUnits === "bigint" ? Number(baseUnits) : baseUnits;
  return n / 10 ** USDC_DECIMALS;
}

/**
 * Back-compat alias. Several pages still import `formatSui`; it now formats
 * USDC. Kept so the rebrand can proceed incrementally without breaking imports.
 * @deprecated use formatUsdc
 */
export const formatSui = formatUsdc;
export const SUI_DECIMALS = USDC_DECIMALS;

/** Shorten an address / hash to `0xabcd…ef01`. */
export function shortenAddress(addr: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Relative time string like "3 mins ago", "yesterday", etc. */
export function relativeTime(timestampMs: number): string {
  if (!timestampMs) return "";
  const delta = Date.now() - timestampMs;
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(timestampMs).toLocaleDateString();
}

/** Margin pct as `+12.3%` / `-4.5%`. Returns `—` if revenue is zero. */
export function marginPercent(revenue: number, margin: number): string {
  if (!revenue) return "—";
  const pct = (margin / revenue) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** Avalanche Fuji block explorer (Snowtrace) links. */
export function snowtraceTx(txHash: string): string {
  return `https://testnet.snowtrace.io/tx/${txHash}`;
}
export function snowtraceAddress(addr: string): string {
  return `https://testnet.snowtrace.io/address/${addr}`;
}
