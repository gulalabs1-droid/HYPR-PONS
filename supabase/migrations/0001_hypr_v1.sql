-- HYPR V1 persistence baseline.
-- This migration is intentionally unapplied by the repository. Apply it only to
-- an explicitly configured Supabase project after reviewing the policies below.
-- HYPR tables are prefixed to coexist with the earlier Solana application.
-- Existing unprefixed application tables are never modified.

begin;

create extension if not exists pgcrypto;

create or replace function public.hypr_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.hypr_chains (
  chain_id bigint primary key,
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.hypr_chains (chain_id, name)
values (4663, 'Robinhood Chain'), (46630, 'Robinhood Chain testnet')
on conflict (chain_id) do update set name = excluded.name;

create table if not exists public.hypr_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 64),
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.hypr_wallets (
  wallet_id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  chain_id bigint not null references public.hypr_chains(chain_id),
  address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists wallets_chain_address_unique
  on public.hypr_wallets (chain_id, lower(address));
create index if not exists wallets_user_idx on public.hypr_wallets (user_id);

create table if not exists public.hypr_tokens (
  token_id uuid primary key default gen_random_uuid(),
  chain_id bigint not null references public.hypr_chains(chain_id),
  address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),
  pool_address text check (pool_address is null or pool_address ~ '^0x[0-9a-fA-F]{40}$'),
  origin text not null check (origin in ('pons', 'hypr')),
  data_status text not null default 'partial' check (data_status in ('demo', 'partial', 'verified')),
  name text not null check (char_length(name) between 1 and 128),
  symbol text not null check (char_length(symbol) between 1 and 32),
  deployer_wallet_id uuid references public.hypr_wallets(wallet_id) on delete set null,
  launched_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists tokens_chain_address_unique
  on public.hypr_tokens (chain_id, lower(address));
create index if not exists tokens_origin_status_idx
  on public.hypr_tokens (origin, data_status, launched_at desc);

create table if not exists public.hypr_token_events (
  event_id uuid primary key default gen_random_uuid(),
  token_id uuid references public.hypr_tokens(token_id) on delete cascade,
  chain_id bigint not null references public.hypr_chains(chain_id),
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  log_index bigint not null check (log_index >= 0),
  block_number bigint not null check (block_number >= 0),
  event_type text not null check (char_length(event_type) between 1 and 64),
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists token_events_identity_unique
  on public.hypr_token_events (chain_id, lower(transaction_hash), log_index);
create index if not exists token_events_token_block_idx
  on public.hypr_token_events (token_id, block_number desc);

create table if not exists public.hypr_rooms (
  room_id uuid primary key default gen_random_uuid(),
  token_id uuid not null unique references public.hypr_tokens(token_id) on delete cascade,
  description text,
  official_links jsonb not null default '[]'::jsonb,
  stream_url text,
  claimed_wallet_id uuid references public.hypr_wallets(wallet_id) on delete set null,
  claim_verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists rooms_claimed_wallet_idx on public.hypr_rooms (claimed_wallet_id);

create table if not exists public.hypr_room_claims (
  claim_id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.hypr_rooms(room_id) on delete cascade,
  wallet_id uuid not null references public.hypr_wallets(wallet_id) on delete cascade,
  nonce_hash text not null unique check (char_length(nonce_hash) between 32 and 128),
  challenge_message text not null check (char_length(challenge_message) between 64 and 2_000),
  signature text check (signature is null or signature ~ '^0x[0-9a-fA-F]{128,}$'),
  status text not null default 'pending' check (status in ('pending', 'verified', 'revoked', 'rejected')),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists room_claims_room_wallet_unique
  on public.hypr_room_claims (room_id, wallet_id)
  where status = 'verified';
create index if not exists room_claims_wallet_idx on public.hypr_room_claims (wallet_id, created_at desc);

-- The web claim adapter calls these functions with the Supabase service role.
-- Keeping wallet resolution, challenge creation, and finalization here makes
-- the ownership transition atomic even when multiple app instances race.
create or replace function public.hypr_ensure_wallet(
  p_chain_id bigint,
  p_address text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_address text := lower(trim(p_address));
  v_wallet_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if v_address !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid wallet address';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_chain_id::text || ':' || v_address, 0));
  select wallet_id into v_wallet_id
  from public.hypr_wallets
  where chain_id = p_chain_id and lower(address) = v_address
  for update;

  if v_wallet_id is not null then
    update public.hypr_wallets
    set last_seen_at = timezone('utc', now())
    where wallet_id = v_wallet_id;
    return v_wallet_id;
  end if;

  insert into public.hypr_wallets (chain_id, address)
  values (p_chain_id, v_address)
  returning wallet_id into v_wallet_id;
  return v_wallet_id;
end;
$$;

create or replace function public.hypr_create_room_claim(
  p_claim_id uuid,
  p_chain_id bigint,
  p_token_address text,
  p_claimant_address text,
  p_creator_address text,
  p_nonce_hash text,
  p_challenge_message text,
  p_expires_at timestamptz
)
returns table (
  claim_id uuid,
  room_id uuid,
  chain_id bigint,
  token_address text,
  claimant_address text,
  creator_address text,
  challenge_message text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_room_id uuid;
  v_creator_wallet_id uuid;
  v_claimant_wallet_id uuid;
  v_token_address text;
  v_creator_address text;
  v_claimant_address text := lower(trim(p_claimant_address));
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_claim_id is null or p_expires_at is null or p_expires_at <= timezone('utc', now()) then
    raise exception 'invalid claim expiry';
  end if;
  if p_nonce_hash is null or p_challenge_message is null
    or p_nonce_hash !~ '^[0-9a-f]{64}$'
    or char_length(p_challenge_message) not between 64 and 2_000 then
    raise exception 'invalid claim challenge';
  end if;

  select r.room_id, t.address, t.deployer_wallet_id, creator.address
    into v_room_id, v_token_address, v_creator_wallet_id, v_creator_address
  from public.hypr_tokens t
  join public.hypr_rooms r on r.token_id = t.token_id
  left join public.hypr_wallets creator on creator.wallet_id = t.deployer_wallet_id
  where t.chain_id = p_chain_id and lower(t.address) = lower(trim(p_token_address));

  if v_room_id is null or v_creator_wallet_id is null or v_creator_address is null then
    raise exception 'indexed room or creator is missing';
  end if;
  if lower(v_creator_address) <> lower(trim(p_creator_address)) then
    raise exception 'indexed creator changed';
  end if;
  if v_claimant_address !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid claimant address';
  end if;

  v_claimant_wallet_id := public.hypr_ensure_wallet(p_chain_id, v_claimant_address);
  if exists (select 1 from public.hypr_rooms where room_id = v_room_id and claimed_wallet_id is not null) then
    raise exception 'room is already claimed';
  end if;
  insert into public.hypr_room_claims (
    claim_id, room_id, wallet_id, nonce_hash, challenge_message, status, expires_at
  ) values (
    p_claim_id, v_room_id, v_claimant_wallet_id, lower(p_nonce_hash), p_challenge_message, 'pending', p_expires_at
  );

  return query select
    p_claim_id,
    v_room_id,
    p_chain_id,
    v_token_address,
    v_claimant_address,
    lower(v_creator_address),
    p_challenge_message,
    p_expires_at;
end;
$$;

create or replace function public.hypr_get_room_claim(p_nonce_hash text)
returns table (
  claim_id uuid,
  room_id uuid,
  chain_id bigint,
  token_address text,
  claimant_address text,
  creator_address text,
  challenge_message text,
  expires_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  return query
  select rc.claim_id, rc.room_id, t.chain_id, t.address,
    lower(claimant.address), lower(creator.address), rc.challenge_message,
    rc.expires_at, rc.status
  from public.hypr_room_claims rc
  join public.hypr_rooms r on r.room_id = rc.room_id
  join public.hypr_tokens t on t.token_id = r.token_id
  join public.hypr_wallets claimant on claimant.wallet_id = rc.wallet_id
  join public.hypr_wallets creator on creator.wallet_id = t.deployer_wallet_id
  where rc.nonce_hash = lower(p_nonce_hash);
end;
$$;

create or replace function public.hypr_reject_room_claim(p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  update public.hypr_room_claims
  set status = 'rejected'
  where claim_id = p_claim_id and status = 'pending';
  return found;
end;
$$;

create or replace function public.hypr_finalize_room_claim(
  p_claim_id uuid,
  p_signature text,
  p_verified_at timestamptz
)
returns table (
  room_id uuid,
  chain_id bigint,
  token_address text,
  claimant_address text,
  creator_address text,
  verified_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_room_id uuid;
  v_claimant_wallet_id uuid;
  v_claimant_address text;
  v_creator_address text;
  v_chain_id bigint;
  v_token_address text;
  v_claimed_wallet_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_signature is null or p_signature !~ '^0x[0-9a-fA-F]{128,130}$' or p_verified_at is null then
    raise exception 'invalid claim verification';
  end if;

  select rc.room_id, rc.wallet_id, t.chain_id, t.address,
    lower(claimant.address), lower(creator.address)
    into v_room_id, v_claimant_wallet_id, v_chain_id, v_token_address,
      v_claimant_address, v_creator_address
  from public.hypr_room_claims rc
  join public.hypr_rooms r on r.room_id = rc.room_id
  join public.hypr_tokens t on t.token_id = r.token_id
  join public.hypr_wallets claimant on claimant.wallet_id = rc.wallet_id
  join public.hypr_wallets creator on creator.wallet_id = t.deployer_wallet_id
  where rc.claim_id = p_claim_id
    and rc.status = 'pending'
    and rc.expires_at > timezone('utc', now())
  for update of rc;

  if v_room_id is null then
    raise exception 'claim is missing, expired, or already consumed';
  end if;
  if v_claimant_address <> v_creator_address then
    raise exception 'claimant is not the indexed creator';
  end if;

  select claimed_wallet_id into v_claimed_wallet_id
  from public.hypr_rooms
  where room_id = v_room_id
  for update;
  if v_claimed_wallet_id is not null and v_claimed_wallet_id <> v_claimant_wallet_id then
    raise exception 'room is already claimed';
  end if;

  update public.hypr_room_claims
  set status = 'verified', signature = p_signature, verified_at = p_verified_at
  where claim_id = p_claim_id and status = 'pending';
  if not found then
    raise exception 'claim was consumed concurrently';
  end if;

  update public.hypr_rooms
  set claimed_wallet_id = v_claimant_wallet_id, claim_verified_at = p_verified_at
  where room_id = v_room_id;

  return query select v_room_id, v_chain_id, v_token_address,
    v_claimant_address, v_creator_address, p_verified_at;
end;
$$;

revoke all on function public.hypr_ensure_wallet(bigint, text) from public, anon, authenticated;
revoke all on function public.hypr_create_room_claim(uuid, bigint, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.hypr_get_room_claim(text) from public, anon, authenticated;
revoke all on function public.hypr_reject_room_claim(uuid) from public, anon, authenticated;
revoke all on function public.hypr_finalize_room_claim(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.hypr_ensure_wallet(bigint, text) to service_role;
grant execute on function public.hypr_create_room_claim(uuid, bigint, text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.hypr_get_room_claim(text) to service_role;
grant execute on function public.hypr_reject_room_claim(uuid) to service_role;
grant execute on function public.hypr_finalize_room_claim(uuid, text, timestamptz) to service_role;

create table if not exists public.hypr_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.hypr_rooms(room_id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, room_id)
);
create index if not exists follows_room_idx on public.hypr_follows (room_id, created_at desc);

create table if not exists public.hypr_chat_messages (
  message_id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.hypr_rooms(room_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid references public.hypr_wallets(wallet_id) on delete set null,
  body text not null check (char_length(body) between 1 and 1_000),
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);
create index if not exists chat_messages_room_created_idx
  on public.hypr_chat_messages (room_id, created_at desc);

create table if not exists public.hypr_hype_events (
  hype_event_id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.hypr_rooms(room_id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('view', 'return', 'chat', 'follow', 'share', 'stream_open', 'onchain_activity')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 256),
  occurred_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create unique index if not exists hype_events_idempotency_unique
  on public.hypr_hype_events (room_id, idempotency_key);
create index if not exists hype_events_room_time_idx
  on public.hypr_hype_events (room_id, occurred_at desc);

create table if not exists public.hypr_hype_snapshots (
  room_id uuid not null references public.hypr_rooms(room_id) on delete cascade,
  window_start timestamptz not null,
  score integer not null check (score between 0 and 100),
  signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, window_start)
);

create table if not exists public.hypr_indexing_state (
  source text not null,
  chain_id bigint not null references public.hypr_chains(chain_id),
  cursor_block bigint not null default 0 check (cursor_block >= 0),
  status text not null default 'idle' check (status in ('idle', 'running', 'ok', 'error')),
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (source, chain_id)
);

-- Apply one confirmed, bounded batch in a single transaction. Replaying a
-- range is safe because token/event identities are unique and the checkpoint
-- never advances unless every row in the batch succeeds.
create or replace function public.hypr_apply_index_batch(
  p_source text,
  p_chain_id bigint,
  p_from_block bigint,
  p_to_block bigint,
  p_tokens jsonb,
  p_events jsonb
)
returns table (
  source text,
  chain_id bigint,
  cursor_block bigint,
  processed_events bigint
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_token jsonb;
  v_event jsonb;
  v_token_id uuid;
  v_wallet_id uuid;
  v_token_address text;
  v_deployer text;
  v_pool text;
  v_origin text;
  v_data_status text;
  v_name text;
  v_symbol text;
  v_tx_hash text;
  v_event_token text;
  v_event_type text;
  v_log_index bigint;
  v_block_number bigint;
  v_event_payload jsonb;
  v_processed_events bigint := 0;
  v_cursor_block bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_source is null or char_length(trim(p_source)) not between 1 and 64
    or p_chain_id is null or p_chain_id <= 0
    or p_from_block is null or p_from_block < 0
    or p_to_block is null or p_to_block < p_from_block
    or jsonb_typeof(coalesce(p_tokens, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_events, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid index batch';
  end if;
  if not exists (select 1 from public.hypr_chains where chain_id = p_chain_id) then
    raise exception 'unsupported index chain';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(trim(p_source) || ':' || p_chain_id::text, 0));
  insert into public.hypr_indexing_state (source, chain_id)
  values (trim(p_source), p_chain_id)
  on conflict (source, chain_id) do nothing;

  for v_token in select value from jsonb_array_elements(p_tokens) loop
    v_token_address := lower(trim(v_token->>'address'));
    v_origin := v_token->>'origin';
    v_data_status := coalesce(v_token->>'dataStatus', 'partial');
    v_name := coalesce(nullif(trim(v_token->>'name'), ''), 'Unresolved Robinhood token');
    v_symbol := coalesce(nullif(trim(v_token->>'symbol'), ''), '—');
    v_deployer := nullif(lower(trim(v_token->>'deployer')), '');
    v_pool := nullif(lower(trim(v_token->>'pool')), '');
    if v_token_address !~ '^0x[0-9a-f]{40}$'
      or v_origin not in ('pons', 'hypr')
      or v_data_status not in ('partial', 'verified')
      or char_length(v_name) not between 1 and 128
      or char_length(v_symbol) not between 1 and 32
      or (v_deployer is not null and v_deployer !~ '^0x[0-9a-f]{40}$')
      or (v_pool is not null and v_pool !~ '^0x[0-9a-f]{40}$') then
      raise exception 'invalid index token';
    end if;

    v_wallet_id := null;
    if v_deployer is not null then
      v_wallet_id := public.hypr_ensure_wallet(p_chain_id, v_deployer);
    end if;

    insert into public.hypr_tokens (
      chain_id, address, pool_address, origin, data_status, name, symbol,
      deployer_wallet_id, launched_at, metadata
    ) values (
      p_chain_id, v_token_address, v_pool, v_origin, v_data_status, v_name, v_symbol,
      v_wallet_id, nullif(v_token->>'launchedAt', '')::timestamptz,
      case when jsonb_typeof(v_token->'metadata') = 'object' then v_token->'metadata' else '{}'::jsonb end
    )
    on conflict (chain_id, lower(address)) do update set
      pool_address = coalesce(excluded.pool_address, public.hypr_tokens.pool_address),
      origin = excluded.origin,
      data_status = case
        when public.hypr_tokens.data_status = 'verified' or excluded.data_status = 'verified' then 'verified'
        else excluded.data_status
      end,
      name = case when excluded.name = 'Unresolved Robinhood token' then public.hypr_tokens.name else excluded.name end,
      symbol = case when excluded.symbol = '—' then public.hypr_tokens.symbol else excluded.symbol end,
      deployer_wallet_id = coalesce(excluded.deployer_wallet_id, public.hypr_tokens.deployer_wallet_id),
      launched_at = coalesce(excluded.launched_at, public.hypr_tokens.launched_at),
      metadata = case when excluded.metadata = '{}'::jsonb then public.hypr_tokens.metadata else excluded.metadata end
    returning token_id into v_token_id;

    insert into public.hypr_rooms (token_id)
    values (v_token_id)
    on conflict (token_id) do nothing;
  end loop;

  for v_event in select value from jsonb_array_elements(p_events) loop
    v_tx_hash := lower(trim(v_event->>'transactionHash'));
    v_event_token := nullif(lower(trim(v_event->>'tokenAddress')), '');
    v_event_type := trim(v_event->>'eventType');
    v_log_index := (v_event->>'logIndex')::bigint;
    v_block_number := (v_event->>'blockNumber')::bigint;
    v_event_payload := case when jsonb_typeof(v_event->'payload') = 'object' then v_event->'payload' else '{}'::jsonb end;
    if v_tx_hash !~ '^0x[0-9a-f]{64}$'
      or (v_event_token is not null and v_event_token !~ '^0x[0-9a-f]{40}$')
      or v_event_type is null or char_length(v_event_type) not between 1 and 64
      or v_log_index is null or v_log_index < 0
      or v_block_number is null or v_block_number < p_from_block
      or v_block_number > p_to_block then
      raise exception 'invalid index event';
    end if;

    select token_id into v_token_id
    from public.hypr_tokens
    where chain_id = p_chain_id and (v_event_token is not null and lower(address) = v_event_token);

    insert into public.hypr_token_events (
      token_id, chain_id, transaction_hash, log_index, block_number, event_type, payload
    ) values (
      v_token_id, p_chain_id, v_tx_hash, v_log_index, v_block_number, v_event_type, v_event_payload
    )
    on conflict (chain_id, lower(transaction_hash), log_index) do update set
      token_id = coalesce(excluded.token_id, public.hypr_token_events.token_id),
      block_number = excluded.block_number,
      event_type = excluded.event_type,
      payload = excluded.payload,
      observed_at = timezone('utc', now());
    v_processed_events := v_processed_events + 1;
  end loop;

  update public.hypr_indexing_state
  set cursor_block = greatest(cursor_block, p_to_block),
      status = 'ok',
      last_success_at = timezone('utc', now()),
      last_error = null
  where source = trim(p_source) and chain_id = p_chain_id
  returning cursor_block into v_cursor_block;

  return query select trim(p_source), p_chain_id, v_cursor_block, v_processed_events;
end;
$$;

revoke all on function public.hypr_apply_index_batch(text, bigint, bigint, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.hypr_apply_index_batch(text, bigint, bigint, bigint, jsonb, jsonb) to service_role;

create or replace function public.hypr_mark_index_error(
  p_source text,
  p_chain_id bigint,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_source is null or char_length(trim(p_source)) not between 1 and 64
    or p_chain_id is null or p_chain_id <= 0
    or p_error is null or char_length(trim(p_error)) = 0 then
    raise exception 'invalid index error';
  end if;
  update public.hypr_indexing_state
  set status = 'error',
      last_error = left(trim(p_error), 2_000)
  where source = trim(p_source) and chain_id = p_chain_id;
  return found;
end;
$$;

revoke all on function public.hypr_mark_index_error(text, bigint, text) from public, anon, authenticated;
grant execute on function public.hypr_mark_index_error(text, bigint, text) to service_role;

drop trigger if exists profiles_set_updated_at on public.hypr_profiles;
create trigger profiles_set_updated_at before update on public.hypr_profiles
for each row execute function public.hypr_set_updated_at();
drop trigger if exists tokens_set_updated_at on public.hypr_tokens;
create trigger tokens_set_updated_at before update on public.hypr_tokens
for each row execute function public.hypr_set_updated_at();
drop trigger if exists rooms_set_updated_at on public.hypr_rooms;
create trigger rooms_set_updated_at before update on public.hypr_rooms
for each row execute function public.hypr_set_updated_at();
drop trigger if exists indexing_state_set_updated_at on public.hypr_indexing_state;
create trigger indexing_state_set_updated_at before update on public.hypr_indexing_state
for each row execute function public.hypr_set_updated_at();

alter table public.hypr_chains enable row level security;
alter table public.hypr_profiles enable row level security;
alter table public.hypr_wallets enable row level security;
alter table public.hypr_tokens enable row level security;
alter table public.hypr_token_events enable row level security;
alter table public.hypr_rooms enable row level security;
alter table public.hypr_room_claims enable row level security;
alter table public.hypr_follows enable row level security;
alter table public.hypr_chat_messages enable row level security;
alter table public.hypr_hype_events enable row level security;
alter table public.hypr_hype_snapshots enable row level security;
alter table public.hypr_indexing_state enable row level security;

create policy chains_public_read on public.hypr_chains for select using (true);
create policy profiles_public_read on public.hypr_profiles for select using (true);
create policy profiles_owner_insert on public.hypr_profiles for insert with check (auth.uid() = user_id);
create policy profiles_owner_update on public.hypr_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy wallets_owner_read on public.hypr_wallets for select using (auth.uid() = user_id);
create policy wallets_owner_insert on public.hypr_wallets for insert with check (auth.uid() = user_id);
create policy wallets_owner_update on public.hypr_wallets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy tokens_public_read on public.hypr_tokens for select using (true);
create policy token_events_public_read on public.hypr_token_events for select using (true);
create policy rooms_public_read on public.hypr_rooms for select using (true);
create policy rooms_claimed_owner_update on public.hypr_rooms for update
using (claimed_wallet_id is not null and claimed_wallet_id in (
  select w.wallet_id from public.hypr_wallets w where w.user_id = auth.uid()
))
with check (claimed_wallet_id is not null and claimed_wallet_id in (
  select w.wallet_id from public.hypr_wallets w where w.user_id = auth.uid()
));

create policy room_claims_owner_read on public.hypr_room_claims for select
using (wallet_id in (select w.wallet_id from public.hypr_wallets w where w.user_id = auth.uid()));

create policy follows_owner_read on public.hypr_follows for select using (auth.uid() = user_id);
create policy follows_owner_insert on public.hypr_follows for insert with check (auth.uid() = user_id);
create policy follows_owner_delete on public.hypr_follows for delete using (auth.uid() = user_id);

create policy chat_authenticated_read on public.hypr_chat_messages for select
using (deleted_at is null and auth.uid() is not null);
create policy chat_owner_insert on public.hypr_chat_messages for insert
with check (
  auth.uid() = user_id
  and (wallet_id is null or wallet_id in (
    select w.wallet_id from public.hypr_wallets w where w.user_id = auth.uid()
  ))
);
create policy chat_owner_update on public.hypr_chat_messages for update
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy hype_owner_read on public.hypr_hype_events for select using (auth.uid() = user_id);
create policy hype_owner_insert on public.hypr_hype_events for insert
with check (auth.uid() = user_id);
create policy hype_snapshots_public_read on public.hypr_hype_snapshots for select using (true);

-- Indexing state and server-verified claims are service-role/server-only.

grant usage on schema public to anon, authenticated;
grant select on public.hypr_chains, public.hypr_profiles, public.hypr_tokens, public.hypr_token_events,
  public.hypr_rooms, public.hypr_hype_snapshots to anon, authenticated;
grant select, insert, update, delete on public.hypr_profiles, public.hypr_wallets,
  public.hypr_follows, public.hypr_chat_messages, public.hypr_hype_events to authenticated;

grant all on public.hypr_chains, public.hypr_profiles, public.hypr_wallets,
  public.hypr_tokens, public.hypr_token_events, public.hypr_rooms,
  public.hypr_room_claims, public.hypr_follows, public.hypr_chat_messages,
  public.hypr_hype_events, public.hypr_hype_snapshots, public.hypr_indexing_state
  to service_role;

commit;
