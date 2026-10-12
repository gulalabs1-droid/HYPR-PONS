# Singapore submission freeze list

Audit date: 2026-10-01

2026-10-12 update: frontend hosting, cloud persistence/service setup, approved
testnet adapter/factory deployment, source verification and the independent
deployment checker are completed. See [current evidence](HYPR_TESTNET_EVIDENCE.md)
and [cloud status](HYPR_CLOUD_SETUP_STATUS.md). The list below records the original
audit gates; deployment does not close the actual live/launch/graduation or
submission-eligibility gates.

The freeze rule is simple: protect the smallest verifiable path and stop adding
surface area. The target demo is:

`CREATE → LIVE → BUY → SELL → EARN → GRADUATE`

## P0 — must fix before submission

- Deploy the HYPR adapter and factory on Robinhood Chain testnet (`46630`) with
  an approved throwaway deployer and an explicitly confirmed protocol-recipient
  address. Do not broadcast mainnet.
- Run the read-only deployment checker and publish the adapter/factory addresses,
  deployment transaction hashes, chain ID, explorer links, compiler settings,
  and verified source links.
- Create one real native launch and capture independent evidence for the
  `LaunchCreated`, buy, sell, fee-ledger/claim, and graduation transactions.
- Configure `HYPR_RPC_URL`, `HYPR_FACTORY_ADDRESS`, and the browser testnet
  factory address only after the deployed addresses pass the checker.
- Configure server-only LiveKit credentials and complete a creator-browser /
  viewer-browser test. Record the result and a fallback if media is unavailable.
- Put the frontend on a reachable host and verify the exact deployed URL from a
  clean browser. The current checkout has only local runtime evidence.
- Complete mobile/desktop smoke QA on the deployed build.
- Fill the submission package with only real values: project description,
  repository URL, frontend URL, contract addresses, explorer links, demo script,
  screenshots/video, founder/contact information, and honest status language.
- Keep all fixture, partial, fork, and testnet labels visible. Never present
  fork-created transactions or sample activity as public-chain transactions.

## P1 — should fix if time allows

- Apply and verify the Supabase migration in a disposable project, then run a
  restart/replay test for durable creator claims.
- Replace browser-local chat and follows with server-backed, rate-limited,
  authenticated persistence.
- Add a small persisted creator profile/metadata path.
- Add stronger indexer coverage for reorg recovery, holder reads, and graduation
  history beyond the bounded recent window.
- Add a recorded fallback walkthrough of the actual working testnet deployment.
- Add a lightweight operational status panel for RPC, indexer, and LiveKit health.
- Expand adversarial/fuzz coverage only where a new test targets a discovered
  risk; do not weaken an existing test to improve the report.

## P2 — after submission

- USDG support, beginning with a separately reviewed stable-quote design.
- Scheduled launches and countdowns.
- Native notification/analytics systems.
- Broader Pons version support and long-range historical indexing.
- Creator monetization, grants, and a possible protocol-token design after usage
  evidence and legal review.
- Production moderation, abuse tooling, and multi-region media operations.

## Do not build for this submission

- A publicly marketed HYPR protocol coin or presale.
- A Pons-style treasury-backed currency, buyback/burn system, staking yield, or
  revenue-sharing promise.
- Mainnet deployment or real-money liquidity without a separate approval gate.
- A custom AMM, second graduation route, or decorative registry contract.
- Fake transaction feeds, fake users, fabricated traction, or unlabeled fixtures.
- A feature that makes the demo depend on uncontrolled external timing.
- Any new social surface that competes with deployment, live-room verification,
  or evidence capture.
