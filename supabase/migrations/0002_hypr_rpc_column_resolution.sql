-- Resolve collisions between RETURNS TABLE names and SQL table columns.
-- Function-local resolution preserves the existing server-only permissions.
begin;

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

commit;
