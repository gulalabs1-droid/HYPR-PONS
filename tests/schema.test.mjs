import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/0001_hypr_v1.sql", import.meta.url), "utf8");

test("SQL migrations contain unique function declarations and intact dollar quotes", () => {
  for (const filename of ["0001_hypr_v1.sql", "0002_hypr_rpc_column_resolution.sql"]) {
    const sql = readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8");
    const names = [...sql.matchAll(/^create or replace function public\.(\w+)/gm)].map(match => match[1]);
    assert.equal(new Set(names).size, names.length, "functions must not be duplicated during generation");
    assert.equal([...sql.matchAll(/^as \$\$$/gm)].length, names.length, "function openings must retain both dollar signs");
    assert.equal([...sql.matchAll(/^\$\$;$/gm)].length, names.length, "function closures must retain both dollar signs");
  }
});

test("Supabase migration preserves the HYPR persistence and RLS boundaries", () => {
  for (const table of ["chains", "wallets", "profiles", "tokens", "token_events", "rooms", "room_claims", "follows", "chat_messages", "hype_events", "hype_snapshots", "indexing_state"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.hypr_${table}\\s*\\(`));
    assert.match(migration, new RegExp(`alter table public\\.hypr_${table} enable row level security`));
    assert.doesNotMatch(migration, new RegExp(`public\\.${table}\\b`));
  }
  assert.match(migration, /tokens_chain_address_unique/);
  assert.match(migration, /token_events_identity_unique/);
  assert.match(migration, /auth\.uid\(\) = user_id/);
  assert.match(migration, /claimed_wallet_id in \(/);
  assert.match(migration, /wallet_id in \(/);
  assert.match(migration, /status in \('pending', 'verified', 'revoked', 'rejected'\)/);
  assert.match(migration, /challenge_message text not null/);
  assert.match(migration, /expires_at timestamptz not null/);
  for (const rpc of ["hypr_ensure_wallet", "hypr_create_room_claim", "hypr_get_room_claim", "hypr_reject_room_claim", "hypr_finalize_room_claim", "hypr_apply_index_batch", "hypr_mark_index_error"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}\\s*\\(`));
  }
  assert.match(migration, /for update of rc/);
  assert.match(migration, /room is already claimed/);
  assert.match(migration, /intentionally unapplied/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(trim\(p_source\)/);
  assert.match(migration, /token_events_identity_unique/);
  assert.match(migration, /greatest\(cursor_block, p_to_block\)/);
  assert.match(migration, /grant execute on function public\.hypr_apply_index_batch/);
  assert.match(migration, /last_error = left\(trim\(p_error\), 2_000\)/);
  assert.match(migration, /grant execute on function public\.hypr_mark_index_error/);
  assert.match(migration, /status = 'error'/);
});

test("the one-shot Pons adapter persists bounded metadata instead of replacing it with demo placeholders", () => {
  const worker = readFileSync(new URL("../scripts/indexer-once.ts", import.meta.url), "utf8");
  assert.match(worker, /name: launch\.name \|\| "Unresolved Robinhood token"/);
  assert.match(worker, /symbol: launch\.symbol \|\| "—"/);
  assert.match(worker, /swapCount: launch\.swapCount/);
  assert.match(worker, /poolPriceQuote: launch\.poolPriceQuote/);
  assert.match(worker, /poolLiquidity: launch\.poolLiquidity/);
});

test("the one-shot indexer exposes a credential-free dry-run boundary", () => {
  const worker = readFileSync(new URL("../scripts/indexer-once.ts", import.meta.url), "utf8");
  assert.match(worker, /HYPR_INDEXER_DRY_RUN/);
  assert.match(worker, /no database or chain write attempted/);
  assert.match(worker, /if \(!dryRun && !applyStarted\)/);
  assert.match(worker, /async function main\(\)/);
});
