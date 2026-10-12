# Security notes

## Protocol status

HYPR's native token/curve/graduation protocol is a testnet design target, not a deployed or audited system. The web app can submit wallet-signed native curve trades only when a verified factory-created room and the expected Robinhood network are configured; it never receives private keys or custody of user funds. Do not deploy to mainnet or describe testnet behavior as production safety.

## Threat model

Assume malicious users can spoof token names and images, sybil social events, spam chat, submit forged claims, replay signatures, exploit weak RPC assumptions, or attempt to make the UI appear to endorse a token.

## Required mitigations

### Native protocol gates

- Keep V0 fixed-supply, single-quote, fixed-parameter, and non-upgradeable unless a later review changes that decision.
- Use checked integer math, explicit rounding, reserve floors, minimum-output/deadline checks, and reentrancy protection.
- Separate reserves from creator/protocol fee liabilities; claims must be pull-based and non-reentrant.
- Guard graduation as a one-way, failure-atomic state transition and verify every external Uniswap v4 interface/address before calling it.
- Test malicious tokens, recipients, external manager failures, threshold ordering, and repeated graduation with Foundry fuzz/invariant tests.

- Validate chain ID and EVM hex-address syntax server-side, then canonicalize addresses before signing, persistence, and comparisons. Checksum presentation is not an identity boundary.
- Use server-issued, expiring, domain-bound nonces for wallet signatures. The `/api/room-claims` path uses the optional Supabase-backed pending-claim/RPC path when configured and a five-minute, one-time process-local challenge otherwise.
- Recover the signer from the signature and compare it to the claimant wallet.
- Verify the signer against the indexed launch deployer/creator address before acknowledging a claim.
- Consume each nonce once. The Supabase path atomically finalizes a pending claim and room ownership; durable audit logging, deployment/migration verification, RLS/rate limits, and independent review remain required before production.
- Sanitize and length-limit user content; add report/mute hooks.
- Enforce RLS and server-side rate limits for chat, follows, claims, and analytics.
- Keep service-role credentials and RPC provider keys server-side.
- Deduplicate indexed events and wait for confirmations; design for reorg recovery.
- Never request, store, or transmit seed phrases or private keys.

## Known risks

Public RPC availability is not guaranteed. Token metadata and social links are user-controlled. If Supabase is not configured, the current claim verifier remains process-local: restarts, multiple instances, and missing persistence can lose durable room state. The optional durable path still depends on a correctly applied migration and indexed token/room records. Pons' indexed deployer is an attribution signal, not a general-purpose governance or payout authority. HYPE can be sybil-manipulated and must remain a limited social signal.

The browser launchpad and native curve trade controls are explicitly locked to Robinhood Chain testnet (`46630`) in this MVP. Pons discovery remains a separate read-only mainnet reference path. A mainnet `NEXT_PUBLIC_HYPR_NETWORK` value disables native launch/trade controls rather than enabling real-money movement.

The Next.js shell sends a restrictive baseline CSP, denies framing, disables unnecessary browser permissions, and limits outbound RPC/iframe origins to the configured public chain endpoints and validated YouTube/Twitch players. This is defense-in-depth; it does not replace stream moderation, dependency review, or independent security review.

After each production build, `npm run security:smoke` scans the emitted client assets and fails if the Supabase service-role variable name or private-key material is present. CI runs this check immediately after `npm run build`.

This system has not been audited. Obtain professional security and legal review before handling money, advertising claims, creator payouts, or production wallet actions.
