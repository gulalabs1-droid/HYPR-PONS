# HYPR cloud setup status

Verified on 2026-10-12.

## Accounts and resources

- Vercel browser session: signed in to `gulas-projects-212c0e1d`.
- Vercel: dedicated `hypr-pons` project `prj_1L8h18XGZFxjPqsrM77azdi53pHj`
  created and published at `https://hypr-pons.vercel.app`.
- Deployment client: authenticated with one-hour team-scoped access. No
  deployment token was written into the repository or application environment.
- Source backup: private `https://github.com/gulalabs1-droid/HYPR-PONS`.
- Git commits now use the authenticated owner's GitHub noreply identity;
  existing commit history is preserved. This resolves Vercel's Hobby author gate.
- Supabase: existing healthy `hypr` project `vxusuxsdjdsqgizilmrz`, US East,
  in the `hypr` Free organization.
- LiveKit: dedicated `HYPR` project `p_21t6pqqhae2` created in United States.
  Endpoint: `wss://hypr-xyv8dfkb.livekit.cloud`.
- No paid plan or billing change was selected.

## Prepared changes

- `vercel.json` selects Next.js, `npm ci`, and the production build command.
- `.vercelignore` excludes environment files, generated artifacts, contracts,
  database migrations, tests, and unrelated local output from deployment.
- `.vercel` is ignored by Git.
- The migration creates 12 separate `public.hypr_*` tables, a dedicated
  `hypr_set_updated_at` trigger function, and the existing HYPR RPC interface.
- Migration execution is atomic (`begin` / `commit`). It does not modify the
  existing Solana application's unprefixed tables.
- Migrations `0001` and `0002` applied successfully. All 12 HYPR tables have
  RLS enabled, all seven privileged RPCs are server-only, and legacy profiles
  retain their original columns.
- Supabase and LiveKit credentials are stored as server-only Vercel variables
  for production and preview. Secret values are marked sensitive.
- Mobile launch-form grid overflow was repaired and tested in the browser.

## Why the existing database needs isolation

The cloud project contains the earlier Solana application's tables, including
`public.profiles` keyed by a wallet string and legacy wagering records. The
current protocol expects profiles keyed by `auth.users.id`. Applying the earlier
unprefixed baseline directly would conflict with the existing table shape.
The prepared migration therefore prefixes every HYPR table reference.

## Verification

- Application tests cover the existing 36 checks plus streaming provider,
  token-access boundaries, and migration-generation regressions.
- TypeScript, ESLint, production build and bundle-security check passed.
- Production runtime smoke passed on localhost in unconfigured mode.
- Phone viewport: 390px viewport and 390px document width on both the launch
  page and a room page, with no overflowing elements.
- The prepared SQL editor content was copied back and compared byte-for-byte
  with the source migration: exact match.
- Live service checks passed: seeded chains, server claim RPC access, anonymous
  claim RPC denial, and authenticated LiveKit room-service access.
- Live database regression passed: index replay/deduplication, checkpoint,
  durable claim, claim replay rejection, and anonymous-write denial. Generated
  regression records were rolled back.
- The real Pons indexer persisted its checkpoint through block `86840236`,
  finding zero recent launch events. No launch data was invented.
- Production dependencies report zero vulnerabilities. Five advisory entries
  remain in the development-only Next ESLint/fast-glob/braces chain; the current
  upstream braces release has no patched replacement. Avoid forced framework
  downgrades or weakened lint rules to hide this result.
- Native room controls now sit inside the LiveKit provider. Token issuance
  rejects sample/unindexed rooms and invalid roles; viewers require a live host.

## Pending execution

1. Complete the final hardening deployment and hosted acceptance check.
2. Deploy and verify the native contracts using an approved funded Robinhood
   testnet signer. Configure factory addresses only after verification.
3. Complete a real creator/viewer and create/trade/fee/graduation demo.
4. Persistent chat/follows, production moderation, durable indexer scheduling,
   and professional review remain later rollout work; their schemas alone do
   not make these features operational.

The frontend is deployed and its external services are connected. Native token
creation and broadcasting still await deployed HYPR contracts and a real
creator wallet. No contract was broadcast and no live media session was claimed.
