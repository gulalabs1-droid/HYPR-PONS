# HYPE scoring

HYPE is HYPR's transparent social/activity metric. It is not investment advice and does not represent token quality, safety, expected returns, or liquidity.

## V1 signals and weights

Each input is normalized to 0–100 over a rolling window, then combined:

| Signal | Weight | Meaning |
| --- | ---: | --- |
| Unique viewers | 23% | Distinct room visitors |
| Viewer growth | 18% | Recent change in distinct visitors |
| Chat activity | 18% | Human-authored room messages |
| Follows | 12% | New room follows |
| Shares | 12% | Share actions and clean-link opens |
| Returning visitors | 10% | Visitors who come back |
| Onchain activity | 7% | Measured pool activity, capped |

The implementation lives in `src/lib/hype.ts`. Weights are intentionally centralized so they can be tuned without redesigning the product.

## Anti-spam handling

- Count unique wallet/user identities, not raw page refreshes.
- Apply per-user and per-IP rate limits to chat, follows, shares, and event emission.
- Deduplicate events with an idempotency key.
- Cap each signal's contribution at 100 before applying weights.
- Downweight bursts from newly created identities and repeated identical messages.
- Do not let market cap, trade size, or spend directly buy rank. Onchain activity is a small, capped context signal only.

## Update intervals

V1 can calculate event counters continuously and publish HYPE snapshots every 5 minutes. Discover can cache the latest snapshot for 30–60 seconds. Recompute historical snapshots when weights change.

## Limitations

Wallets can still sybil, RPC data can be delayed, and social activity can be coordinated. HYPE must be labeled as an activity signal everywhere it appears, with no claims of financial merit.
