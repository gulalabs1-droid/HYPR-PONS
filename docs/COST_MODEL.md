# V1 cost model

| Component | Bootstrap choice | Expected cost | Upgrade trigger |
| --- | --- | ---: | --- |
| Web hosting | Existing or free Next.js host | $0 | sustained traffic or build limits |
| Database/auth/realtime | Supabase free tier, when connected | $0 | storage, egress, or realtime limits |
| Chain reads | Public Robinhood RPC | $0 | throttling, latency, or historical backfill |
| RPC provider | Archive-capable free tier | $0 initially | rate limits or reliability requirements |
| Analytics | First-party event tables | $0 | need for advanced funnels/retention |
| Video | External stream embed only | $0 | community loop proves demand |

Target: $0–$25/month. Paid dependencies require a documented reason, a free alternative, and a clear upgrade trigger. Do not build native video, paid ads infrastructure, or a custom chain indexer in V1.
