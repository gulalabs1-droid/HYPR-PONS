# Security notes

## Threat model

Assume malicious users can spoof token names and images, sybil social events, spam chat, submit forged claims, replay signatures, exploit weak RPC assumptions, or attempt to make the UI appear to endorse a token.

## Required mitigations

- Validate chain ID and checksum addresses server-side.
- Use server-issued, expiring, domain-bound nonces for wallet signatures.
- Recover the signer from the signature and compare it to the connected wallet.
- Verify the signer against the token deployer or an authorized payout/ownership path before claiming.
- Consume each nonce once and log claim attempts.
- Sanitize and length-limit user content; add report/mute hooks.
- Enforce RLS and server-side rate limits for chat, follows, claims, and analytics.
- Keep service-role credentials and RPC provider keys server-side.
- Deduplicate indexed events and wait for confirmations; design for reorg recovery.
- Never request, store, or transmit seed phrases or private keys.

## Known risks

Public RPC availability is not guaranteed. Token metadata and social links are user-controlled. A claim flow is not safe for production until server-side signature recovery and authorization checks exist. HYPE can be sybil-manipulated and must remain a limited social signal.

This system has not been audited. Obtain professional security and legal review before handling money, advertising claims, creator payouts, or production wallet actions.
