# V1 launch checklist

## Open House timing

The current HackQuest listing shows submissions from September 13, 2026 through October 4, 2026 at 15:59 as displayed by HackQuest. Target a stable qualifying deployment several days before the deadline. Confirm timezone and any terms directly in HackQuest before submitting.

## Product

- [x] Discover, Trending/Rising/New/Most HYPR views
- [x] Automatic room URL and social metadata
- [x] HYPE label with social-only disclaimer
- [x] Wallet connect and wrong-network messaging
- [x] Native curve buy/sell controls with exact quotes, slippage, deadlines, and receipt handling
- [x] Native browser live-room plumbing with signed creator authorization, subscribe-only viewers, and honest offline/setup states
- [x] Optional allowlisted external-stream fallback for compatibility
- [ ] Persisted realtime chat with RLS/rate limits (schema baseline is prepared; project and server adapter are not configured)
- [ ] Persisted follows and creator profiles (schema baseline is prepared; project and server adapter are not configured)
- [ ] Persisted room claim (optional server adapter and atomic claim RPCs are implemented; Supabase migration/application and live restart/replay verification remain open)
- [ ] Configure LiveKit project, deploy the app with server runtime secrets, and complete two-browser creator/viewer verification

## Chain

- [x] Official Robinhood Chain and pons constants verified
- [x] Idempotent event ID helper and bounded recent log reader
- [x] Native HYPR V0 contracts, adapter, Foundry harness, and v4 calldata boundary present
- [x] Testnet-only reproducible deployment script with chain guard and no embedded key
- [ ] Native HYPRFactory/HYPRToken/HYPRCurve reviewed for testnet deployment
- [ ] Native create → buy → sell → fee claim → graduation transaction proof on Robinhood Chain testnet (`46630`)
- [x] Local fork proof against the exact Uniswap v4 PoolManager/periphery deployment and real graduation adapter
- [ ] Supabase-backed checkpoints and event persistence (transactional batch RPC, server adapter, and opt-in one-shot worker are prepared; migration/project/scheduling are not applied/configured)
- [x] Bounded Pons token metadata and pool swap event counts
- [x] Bounded WETH-denominated Pons pool price and liquidity reads
- [ ] Holder and graduation reads
- [ ] Reorg/confirmation policy in the worker
- [x] Explicit pons version selection (the current adapter targets the original/current v1 factory; v2 is documented but not silently mixed in)
- [x] RPC failure and unsupported-version paths are labeled/fail-closed in automated tests

## Verification

- [x] Run typecheck, lint, build, and runtime smoke locally (hosted execution remains unverified here)
- [ ] Wallet connect/disconnect/wrong chain tested in a browser
- [ ] Mobile and desktop visual QA
- [x] RPC failure and empty-state QA (automated provider-boundary coverage; live provider capacity remains environment-dependent)
- [ ] Professional security/legal review before production claims or money movement
- [ ] Open House judging matrix and deterministic demo reviewed
- [ ] No mainnet deployment or real funds without explicit approval

## Missing credentials/setup

The repository has no LiveKit, Supabase, RPC-provider, or production-host credentials. Demo mode is intentionally credential-free. Before production, configure LiveKit and a server-capable host, use an archive-capable RPC endpoint, apply and verify the Supabase migration/RPCs, run the one-shot worker in a disposable environment, then implement the remaining chat/follow/profile/HYPE adapters and scheduling listed above.
