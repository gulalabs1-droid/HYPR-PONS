export type ReviewedHyprLaunchConfig = {
  totalSupply: bigint;
  tradableSupply: bigint;
  virtualQuoteReserve: bigint;
  graduationThreshold: bigint;
  totalFeeBps: bigint;
  creatorFeeBps: bigint;
  protocolFeeBps: bigint;
  protocolRecipient: string;
};

export const REVIEWED_HYPR_V0 = {
  totalSupply: 1_000_000n * 10n ** 18n,
  tradableSupply: 800_000n * 10n ** 18n,
  virtualQuoteReserve: 100n * 10n ** 18n,
  graduationThreshold: 10n * 10n ** 18n,
  totalFeeBps: 125n,
  creatorFeeBps: 30n,
  protocolFeeBps: 95n,
} as const;

export function isReviewedHyprV0Config(config: ReviewedHyprLaunchConfig) {
  return config.totalSupply === REVIEWED_HYPR_V0.totalSupply
    && config.tradableSupply === REVIEWED_HYPR_V0.tradableSupply
    && config.virtualQuoteReserve === REVIEWED_HYPR_V0.virtualQuoteReserve
    && config.graduationThreshold === REVIEWED_HYPR_V0.graduationThreshold
    && config.totalFeeBps === REVIEWED_HYPR_V0.totalFeeBps
    && config.creatorFeeBps === REVIEWED_HYPR_V0.creatorFeeBps
    && config.protocolFeeBps === REVIEWED_HYPR_V0.protocolFeeBps
    && /^0x[a-fA-F0-9]{40}$/.test(config.protocolRecipient)
    && !/^0x0{40}$/i.test(config.protocolRecipient);
}
