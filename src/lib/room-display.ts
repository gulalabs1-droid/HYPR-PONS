import type { Launch } from "@/lib/types";
import { formatCurveProgress } from "@/lib/curve-progress";
import { formatEthCompact, formatUsd } from "@/lib/format";

export type RoomKind = "native" | "pons" | "sample";

export function roomKind(token: Launch): RoomKind {
  if (token.origin === "hypr") return "native";
  return token.dataStatus === "demo" ? "sample" : "pons";
}

// Stable per-token hue so every room keeps the same color identity everywhere.
export function roomHue(address: string) {
  return parseInt(address.slice(2, 8), 16) % 360;
}

export function roomBadge(token: Launch) {
  const kind = roomKind(token);
  if (kind === "native") return token.broadcastStatus === "live" ? "LIVE · Native" : token.broadcastStatus === "offline" ? "Offline · Native" : "Native · live status unavailable";
  if (kind === "sample") return "Sample data";
  return "Indexed onchain";
}

export type RoomMetric = { label: string; value: string; tone?: "positive" | "negative" };

export function roomCurvePercent(token: Launch) {
  const reserve = Number(token.nativeRealQuoteReserve);
  const threshold = Number(token.nativeGraduationThreshold);
  if (Number.isFinite(reserve) && reserve >= 0 && Number.isFinite(threshold) && threshold > 0) return Math.min(100, reserve / threshold * 100);
  return Math.min(100, Math.max(0, (token.curveProgressBps ?? 0) / 100));
}

export function roomMetrics(token: Launch): RoomMetric[] {
  const kind = roomKind(token);
  if (kind === "native") {
    return [
      { label: "CURVE", value: formatCurveProgress(token.nativeRealQuoteReserve, token.nativeGraduationThreshold, token.curveProgressBps, token.curvePhase) },
      { label: "RESERVE", value: formatEthCompact(token.nativeRealQuoteReserve) },
      { label: "RECENT TRADES", value: token.nativeTradeCount === undefined ? "—" : token.nativeTradeCount.toLocaleString() },
    ];
  }
  if (kind === "pons") {
    return [
      { label: "POOL PRICE", value: token.poolPriceQuote === undefined ? "—" : `${token.poolPriceQuote.toPrecision(3)} WETH` },
      { label: "SWAPS", value: token.ponsTradeCount === undefined ? "—" : token.ponsTradeCount.toLocaleString() },
      { label: "24H", value: "—" },
    ];
  }
  return [
    { label: "HYPE", value: String(token.hype) },
    { label: "MARKET CAP", value: formatUsd(token.marketCapUsd) },
    { label: "24H", value: `${token.change24h >= 0 ? "+" : ""}${token.change24h}%`, tone: token.change24h >= 0 ? "positive" : "negative" },
  ];
}

// One headline signal per room: graduation progress for native curves, HYPE for samples.
export function roomMeter(token: Launch): { label: string; percent: number; text: string } | null {
  const kind = roomKind(token);
  if (kind === "native") {
    const percent = roomCurvePercent(token);
    return { label: "Graduation", percent, text: formatCurveProgress(token.nativeRealQuoteReserve, token.nativeGraduationThreshold, token.curveProgressBps, token.curvePhase) };
  }
  if (kind === "sample") return { label: "HYPE", percent: Math.min(100, token.hype), text: `${token.hype}/100` };
  return null;
}

export function roomTickerValue(token: Launch): RoomMetric {
  const kind = roomKind(token);
  if (kind === "native") return { label: "curve", value: roomMetrics(token)[0].value };
  if (kind === "sample") return roomMetrics(token)[2];
  return { label: "swaps", value: token.ponsTradeCount === undefined ? "—" : token.ponsTradeCount.toLocaleString() };
}
