# HYPR cloud setup status

Verified on 2026-10-12.

## Accounts and resources

- Vercel browser session: signed in to `gulas-projects-212c0e1d`.
- Vercel CLI: authorization pending. No HYPR project or deployment was created.
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
- The migration is prepared in the Supabase SQL editor but has not been run.
- Mobile launch-form grid overflow was repaired and tested in the browser.

## Why the existing database needs isolation

The cloud project contains the earlier Solana application's tables, including
`public.profiles` keyed by a wallet string and legacy wagering records. The
current protocol expects profiles keyed by `auth.users.id`. Applying the earlier
unprefixed baseline directly would conflict with the existing table shape.
The prepared migration therefore prefixes every HYPR table reference.

## Verification

- Application tests: 36 passed.
- TypeScript, ESLint, production build and bundle-security check passed.
- Production runtime smoke passed on localhost in unconfigured mode.
- Phone viewport: 390px viewport and 390px document width on both the launch
  page and a room page, with no overflowing elements.
- The prepared SQL editor content was copied back and compared byte-for-byte
  with the source migration: exact match.

## Pending execution

1. Authorize Vercel CLI on this Mac, then create/link a dedicated HYPR project.
2. Approve and apply the isolated database migration and verify HYPR tables,
   RPC permissions, and the unchanged legacy table shapes.
3. Obtain an available LiveKit secret for this dedicated project. The
   automatically created key shows a masked secret that cannot be retrieved
   from its details dialog; a new key may be required.
4. Configure Supabase and LiveKit credentials as server-only Vercel variables,
   deploy and test the exact hosted URL.
5. Deploy and verify the native contracts using an approved funded Robinhood
   testnet signer. Configure factory addresses only after verification.
6. Complete a real creator/viewer and create/trade/fee/graduation demo.

Browser login is complete, but credential authorization, database policies,
hosting publication and wallet signing are separate operations. Do not describe
the application as deployed or live until their verification is recorded here.
