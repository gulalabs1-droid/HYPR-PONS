# V1 cost model

| Component | Bootstrap choice | Expected cost | Upgrade trigger |
| --- | --- | ---: | --- |
| Web hosting | Existing or free Next.js host | $0 | sustained traffic or build limits |
| Database/auth/realtime | Supabase free tier, when connected | $0 | storage, egress, or realtime limits |
| Chain reads | Public Robinhood RPC | $0 | throttling, latency, or historical backfill |
| Solidity toolchain | Foundry/local fork | $0 | install only when protocol work begins; use CI or a reviewed provider for reproducible builds |
| Robinhood testnet gas | Testnet ETH/faucet | $0 | never use real funds for the first protocol proof |
| Contract verification | Robinhood testnet explorer/Blockscout | $0 | production deployment review and verified source workflow |
| RPC provider | Archive-capable free tier | $0 initially | rate limits or reliability requirements |
| Analytics | First-party event tables | $0 | need for advanced funnels/retention |
| Video | LiveKit native browser room on usage-based/free pilot tier; external embed remains fallback | $0 initially | sustained viewer minutes or recording requirements |

Target: $0–$25/month for a small testnet pilot. Paid dependencies require a documented reason, a free alternative, and a clear upgrade trigger. Protocol fees are product economics, not a hosting budget, and must not be counted as revenue until real activity exists. Do not add recording, paid ads infrastructure, or a custom chain indexer in V1.
