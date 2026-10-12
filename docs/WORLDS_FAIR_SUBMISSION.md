# HYPR — Crypto World's Fair submission package

Prepared October 12, 2026. This replaces the older Singapore/Open House package
for the current contest, but does not claim a completed submission.

## Authoritative deadline and actual portal requirements

- [Official contest](https://colosseum.com/worldsfair)
- [Rules](https://colosseum.com/legal/Crypto%20World%27s%20Fair%20Hackathon%20Rules.pdf)
- Deadline: October 12, 2026, 11:59 p.m. PDT / October 13, 2:59 a.m. EDT.
- Created project: [HYPR](https://colosseum.com/arena/projects/hypr), project ID 17723.
- Category: Consumer Apps. Integrated chain: Robinhood Chain (testnet 46630).
- Actual authenticated form requires a **pitch of at most 2 minutes**, separate
  from a **live-product demo of at most 3 minutes**, on YouTube, Loom or Vimeo.
  The generic FAQ's 2–3 minute presentation wording is superseded by this form.
- Private code is permitted with judge access for hackathon@colosseum.com.
- Founder submission profile is separate from the public Arena profile.
- Accelerator application remains off: no full-time/relocation commitment inferred.

## Product

HYPR is a native live launchpad for Robinhood Chain. Creators launch fixed-supply
tokens, trade on a transparent bonding curve, and get a persistent room with
browser-native broadcasting. The current public-testnet prototype has verified
create, buy, sell and fee-claim receipts. Shared social features, actual media
acceptance and public-chain graduation remain separately tracked release gates.

Audience: early onchain creators and their communities. The product insight is
that a token launch should open a lasting place to gather, not require users to
assemble a launchpad, explorer, trading chart and external video destination.

## Judge links

- [Live app](https://hypr-pons.vercel.app)
- [Clean demonstration room](https://hypr-pons.vercel.app/room/0xeA3b5d2Cf6EAcD3dd6241736082b7698E519a675)
- [Read-only protocol accounting](https://hypr-pons.vercel.app/protocol)
- [Repository](https://github.com/gulalabs1-droid/HYPR-PONS) — private until authorized access is granted.
- [Factory](https://explorer.testnet.chain.robinhood.com/address/0x6461786C6a62e2b7E40917312Cc35bb3Df127d14)
- [Graduation adapter](https://explorer.testnet.chain.robinhood.com/address/0x77bc7Ed4B59F9D8B68104F7F4dB673D2777B19eE)
- [Demo token](https://explorer.testnet.chain.robinhood.com/address/0xeA3b5d2Cf6EAcD3dd6241736082b7698E519a675)
- [Demo curve](https://explorer.testnet.chain.robinhood.com/address/0x706b4b7F544762Fe609B648450b5F92bA1028b34)

Access: no login needed to browse. An EVM wallet on Robinhood testnet is needed
to sign transactions; free test ETH is needed for transaction gas. Only a room's
onchain creator can authorize broadcasting. Judges should not import our demo
wallet or request private keys. Fee withdrawal is contract/CLI-proven, not a
frontend payout feature.

## Evidence and honest scope

- `docs/HYPR_CONTROLLED_DEMO.md`: six successful public testnet transactions.
- `docs/evidence/hypr-testnet-demo-20261012.json`: public receipts and accounting.
- `docs/HYPR_CREATOR_FLOW_ACCEPTANCE.md`: receipt recovery and wallet journey.
- `docs/HYPR_READINESS_AUDIT_20261012.md`: fresh checks and remaining limitations.
- Fresh audit at bd4d280: 71 app tests and 37 unique local/fork contract tests
  passed; production dependency scan, build and hosted smoke passed.
- Verified contract source is not a professional security audit.
- No mainnet, public graduation, million-user capacity, traction or revenue claim.
- Actual camera/audio reception must be observed separately; token issuance alone
  is not media evidence. Chat and follows are local previews, not shared services.

## Development history and tools

Pre-existing baseline: bootstrap commit bd3d073, September 5, 2026, before the
September 14 contest start. Submit subsequent work with that history disclosed;
do not describe all HYPR code as written during the competition.

Next.js/React/TypeScript, viem, Solidity/Foundry, Robinhood testnet RPC/Blockscout,
Uniswap v4, Supabase/Postgres/RLS, LiveKit, Vercel and GitHub Actions. Codex was
used as an AI engineering/testing assistant. The public founder bio need not
mention AI, but the portal explicitly requests AI tools and development disclosure.

## Distribution and business hypothesis — not existing traction

Start with a small personally recruited creator testnet pilot. Help each creator
complete the launch-to-room journey, observe viewers, collect feedback, and
measure successful launches, repeat visits, broadcast reliability and costs.
Do not pay for acquisition or promise financial returns before validating utility.
The implemented trade fee split is 1.25% total: 0.30% creator, 0.95% protocol.
Potential mainnet fee revenue is a business hypothesis, not present revenue.
Abuse controls, streaming unit economics, security review and appropriate hosting
plans precede a commercial release.

## Items that must not be guessed

Founder legal/contact/background fields, funding history, outside human work,
eligibility declarations, video URLs, repository access acceptance, actual media
test result, and final rules acceptance. Complete from founder input and visible
confirmation, not placeholders or invented information.
