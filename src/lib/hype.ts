import type { HypeSignals } from "./types";

// Social/activity score only. Weights are intentionally explicit and tunable.
const weights = {
  uniqueViewers: 0.23,
  viewerGrowth: 0.18,
  chatMessages: 0.18,
  follows: 0.12,
  shares: 0.12,
  returningVisitors: 0.1,
  onchainActivity: 0.07,
} satisfies Record<keyof HypeSignals, number>;

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const signalScore = (value: number) => clamp(value);

export function calculateHype(signals: HypeSignals): number {
  return Math.round((Object.keys(weights) as (keyof HypeSignals)[]).reduce((score, key) => score + signalScore(signals[key]) * weights[key], 0));
}

export { weights as hypeWeights };
