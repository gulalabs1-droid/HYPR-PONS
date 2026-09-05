# V1 launch checklist

## Product

- [x] Discover, Trending/Rising/New/Most HYPR views
- [x] Automatic room URL and social metadata
- [x] HYPE label with social-only disclaimer
- [x] Wallet connect and wrong-network messaging
- [ ] Persisted realtime chat with RLS/rate limits
- [ ] Persisted follows and creator profiles
- [ ] Server-verified room claim

## Chain

- [x] Official Robinhood Chain and pons constants verified
- [x] Idempotent event ID helper and bounded recent log reader
- [ ] Supabase-backed checkpoints and event persistence
- [ ] Token metadata, holder, pool swap, and graduation reads
- [ ] Reorg/confirmation policy in the worker

## Verification

- [ ] Run typecheck, lint, build, and tests in CI
- [ ] Wallet connect/disconnect/wrong chain tested in a browser
- [ ] Mobile and desktop visual QA
- [ ] RPC failure and empty-state QA
- [ ] Professional security/legal review before production claims or money movement

## Missing credentials/setup

The repository has no Supabase project or RPC provider credentials. Demo mode is intentionally credential-free. Before production, configure Supabase server credentials and an archive-capable RPC endpoint, then implement the server-side persistence and claim verification listed above.
