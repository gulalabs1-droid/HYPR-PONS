export function formatCurveProgress(reserve?: string, threshold?: string, basisPoints?: number, phase?: string) {
  if (phase === "Graduated") return "100%";
  if (reserve !== undefined && threshold !== undefined) {
    try {
      if (!/^[0-9]+$/.test(reserve) || !/^[0-9]+$/.test(threshold)) return "—";
      const amount = BigInt(reserve);
      const target = BigInt(threshold);
      if (target === 0n) return "—";
      if (amount >= target) return "100%";
      if (amount === 0n) return "0%";
      const millionthsOfPercent = amount * 100_000_000n / target;
      if (millionthsOfPercent === 0n) return "<0.000001%";
      return `${(Number(millionthsOfPercent) / 1_000_000).toFixed(6).replace(/\.?0+$/, "")}%`;
    } catch { return "—"; }
  }
  return basisPoints !== undefined && Number.isFinite(basisPoints) && basisPoints >= 0 && basisPoints <= 10000
    ? `${basisPoints / 100}%` : "—";
}
