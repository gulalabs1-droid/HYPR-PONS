export const ROBINHOOD_CHAIN = {
  id: 4663,
  name: "Robinhood Chain",
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: "https://robinhoodchain.blockscout.com",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Robinhood Chain Explorer", url: "https://robinhoodchain.blockscout.com" } },
} as const;

export const PONS = {
  activeFactory: "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB" as `0x${string}`,
  activeFactoryStartBlock: 8991118n,
  legacyFactory: "0x0c37a24F5D23A486FA692d1500881d698B1F77a4" as `0x${string}`,
  legacyFactoryStartBlock: 8600612n,
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as `0x${string}`,
  tokenLaunchedTopic: "0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a" as `0x${string}`,
  swapTopic: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67" as `0x${string}`,
} as const;

export const PONS_TOKEN_LAUNCHED_ABI = [
  "event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)",
] as const;
