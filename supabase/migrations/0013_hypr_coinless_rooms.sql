-- Rooms without a coin. A creator signs in with a wallet (a free signature,
-- no transaction or test ETH) and gets a permanent room right away. The room
-- reuses hypr_tokens/hypr_rooms with metadata.kind = 'room', so chat, follows,
-- shows, polls, alerts and stats work unchanged. Its address is a random ID in
-- address format, not a contract; nothing about it exists onchain. A coin can
-- still be created separately later. Run after 0012.
begin;

create index if not exists hypr_tokens_coinless_rooms on public.hypr_tokens (chain_id, created_at desc) where metadata->>'kind' = 'room';

create function public.hypr_create_coinless_room(p_chain_id bigint, p_wallet_address text, p_address text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_wallet_id uuid; v_token_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_address is null or lower(p_address) !~ '^0x[0-9a-f]{40}$' then raise exception 'invalid room address'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 60 then raise exception 'invalid room name'; end if;
  v_wallet_id := public.hypr_ensure_wallet(p_chain_id, p_wallet_address);
  perform pg_advisory_xact_lock(hashtextextended('coinless:' || v_wallet_id::text, 0));
  if (select count(*) from public.hypr_tokens where deployer_wallet_id = v_wallet_id and metadata->>'kind' = 'room') >= 3 then raise exception 'room limit'; end if;
  insert into public.hypr_tokens(chain_id, address, origin, data_status, name, symbol, deployer_wallet_id, launched_at, metadata)
    values(p_chain_id, lower(p_address), 'hypr', 'partial', trim(p_name), 'ROOM', v_wallet_id, now(), jsonb_build_object('kind', 'room', 'creator', lower(p_wallet_address)))
    returning token_id into v_token_id;
  insert into public.hypr_rooms(token_id, claimed_wallet_id, claim_verified_at) values(v_token_id, v_wallet_id, now());
  return jsonb_build_object('address', lower(p_address), 'name', trim(p_name));
end;
$$;

revoke all on function public.hypr_create_coinless_room(bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.hypr_create_coinless_room(bigint,text,text,text) to service_role;
commit;
