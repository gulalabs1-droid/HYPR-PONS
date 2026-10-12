# Pump versus HYPR

Pump is a useful launchpad benchmark, not HYPR's product specification.

| Dimension | Pump documentation describes | HYPR direction |
|---|---|---|
| Launch | A coin begins on a deterministic bonding curve. | A creator launches a fixed-supply HYPR token through the factory. |
| Trading | Curve trades are onchain and do not use an orderbook. | Same clarity, with one quote asset and explicit reserve accounting. |
| Fees | Current curve fee is 1.25%, split between creator and protocol. | Start from a reviewed, transparent benchmark; no hidden or user-defined taxes. |
| Graduation | Graduation is atomic/irreversible to PumpSwap. | Graduate once to the verified Robinhood Chain Uniswap v4 path. |
| Discovery | Launchpad-first token discovery. | Live launch rooms combine creation, creator presence, chat, activity, and trading context. |
| Differentiation | Exchange/launchpad mechanics. | Consumer live-launch experience and Robinhood Chain-native creator/community loop. |

HYPR should not claim identical liquidity, fee, or market behavior. A contest-quality implementation earns credibility by making the core loop inspectable: contract events, exact transactions, curve progress, fee accounting, and graduation state.

Reference: [Pump bonding curve docs](https://pump.fun/docs/bonding-curve) and [Pump fee docs](https://pump.fun/docs/fees).
