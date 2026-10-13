import { formatEther } from "viem";

export function formatUsd(value: number) {
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}m` : `$${(value / 1_000).toFixed(0)}k`;
}

// Compact ETH for cards and summaries; exact values stay available via `formatEthExact`.
export function formatEthCompact(wei?: string) {
  if (!wei || !/^[0-9]+$/.test(wei)) return "—";
  const value = Number(formatEther(BigInt(wei)));
  if (value === 0) return "0 ETH";
  if (value < 0.0001) return "<0.0001 ETH";
  return `${new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(value)} ETH`;
}

export function formatEthExact(wei?: string) {
  if (!wei || !/^[0-9]+$/.test(wei)) return "—";
  return `${formatEther(BigInt(wei))} ETH`;
}
