export type Launch = {
  address: `0x${string}`;
  pool: `0x${string}`;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  deployer: `0x${string}`;
  priceUsd: number;
  marketCapUsd: number;
  change24h: number;
  holders: number;
  activeNow: number;
  followers: number;
  hype: number;
  rank: number;
  launchedAt: string;
  trades24h: number;
  officialLinks: { label: string; href: string }[];
};

export type HypeSignals = {
  uniqueViewers: number;
  viewerGrowth: number;
  chatMessages: number;
  follows: number;
  shares: number;
  returningVisitors: number;
  onchainActivity: number;
};
