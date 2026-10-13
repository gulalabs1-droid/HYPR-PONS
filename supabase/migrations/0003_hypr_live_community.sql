-- Wallet-authenticated community data. Existing auth.users/social tables are untouched.
begin;

create table if not exists public.hypr_community_auth_nonces (
  nonce uuid primary key,
  used_at timestamptz not null default now()
);
create table if not exists public.hypr_community_messages (
  message_id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.hypr_rooms(room_id),
  wallet_id uuid not null references public.hypr_wallets(wallet_id),
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists hypr_community_messages_room_time on public.hypr_community_messages(room_id, created_at desc);
create index if not exists hypr_community_messages_wallet_time on public.hypr_community_messages(wallet_id, created_at desc);
create table if not exists public.hypr_community_follows (
  room_id uuid not null references public.hypr_rooms(room_id),
  wallet_id uuid not null references public.hypr_wallets(wallet_id),
  created_at timestamptz not null default now(),
  primary key (room_id, wallet_id)
);
alter table public.hypr_community_auth_nonces enable row level security;
alter table public.hypr_community_messages enable row level security;
alter table public.hypr_community_follows enable row level security;
revoke all on public.hypr_community_auth_nonces, public.hypr_community_messages, public.hypr_community_follows from anon, authenticated;
grant all on public.hypr_community_auth_nonces, public.hypr_community_messages, public.hypr_community_follows to service_role;

create or replace function public.hypr_consume_community_nonce(p_nonce uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  insert into public.hypr_community_auth_nonces(nonce) values (p_nonce) on conflict do nothing;
  return found;
end;
$$;

create or replace function public.hypr_read_community(p_chain_id bigint, p_token_address text, p_wallet_address text default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_room_id uuid; v_messages jsonb; v_following boolean; v_follower_count bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select r.room_id into v_room_id from public.hypr_rooms r join public.hypr_tokens t on t.token_id = r.token_id
    where t.chain_id = p_chain_id and lower(t.address) = lower(p_token_address) and t.data_status <> 'demo';
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  select coalesce(jsonb_agg(row_to_json(m) order by m.created_at), '[]'::jsonb) into v_messages from (
    select c.message_id as id, w.address as wallet, c.body, c.created_at
    from public.hypr_community_messages c join public.hypr_wallets w on w.wallet_id = c.wallet_id
    where c.room_id = v_room_id and c.deleted_at is null order by c.created_at desc limit 50
  ) m;
  select count(*) into v_follower_count from public.hypr_community_follows f where f.room_id = v_room_id;
  select exists(select 1 from public.hypr_community_follows f join public.hypr_wallets w on w.wallet_id = f.wallet_id
    where f.room_id = v_room_id and lower(w.address) = lower(p_wallet_address)) into v_following;
  return jsonb_build_object('messages', v_messages, 'followers', v_follower_count, 'following', v_following);
end;
$$;

create or replace function public.hypr_write_community(p_chain_id bigint, p_token_address text, p_wallet_address text, p_action text, p_body text default null, p_follow boolean default null, p_message_id uuid default null)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_room_id uuid; v_wallet_id uuid; v_creator_wallet_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_wallet_address is null or lower(p_wallet_address) !~ '^0x[0-9a-f]{40}$' then raise exception 'invalid wallet'; end if;
  select r.room_id, t.deployer_wallet_id into v_room_id, v_creator_wallet_id from public.hypr_rooms r join public.hypr_tokens t on t.token_id = r.token_id
    where t.chain_id = p_chain_id and lower(t.address) = lower(p_token_address) and t.data_status <> 'demo';
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_chain_id::text || ':community:' || lower(p_wallet_address), 0));
  v_wallet_id := public.hypr_ensure_wallet(p_chain_id, p_wallet_address);
  if p_action = 'message' then
    if p_body is null or char_length(trim(p_body)) not between 1 and 280 then raise exception 'invalid message'; end if;
    if exists(select 1 from public.hypr_community_messages where wallet_id = v_wallet_id and created_at > now() - interval '3 seconds')
      or (select count(*) from public.hypr_community_messages where wallet_id = v_wallet_id and created_at > now() - interval '1 minute') >= 10
      then raise exception 'message rate limit'; end if;
    insert into public.hypr_community_messages(room_id, wallet_id, body) values(v_room_id, v_wallet_id, trim(p_body));
  elsif p_action = 'follow' then
    if p_follow is null then raise exception 'follow state required'; end if;
    if p_follow then insert into public.hypr_community_follows(room_id, wallet_id) values(v_room_id, v_wallet_id) on conflict do nothing;
    else delete from public.hypr_community_follows where room_id = v_room_id and wallet_id = v_wallet_id; end if;
  elsif p_action = 'hide' then
    update public.hypr_community_messages set deleted_at = now()
    where message_id = p_message_id and room_id = v_room_id and deleted_at is null and (wallet_id = v_wallet_id or v_creator_wallet_id = v_wallet_id);
    if not found then raise exception 'message not found or not authorized'; end if;
  else raise exception 'invalid action'; end if;
  return true;
end;
$$;

revoke all on function public.hypr_consume_community_nonce(uuid) from public, anon, authenticated;
revoke all on function public.hypr_read_community(bigint, text, text) from public, anon, authenticated;
revoke all on function public.hypr_write_community(bigint, text, text, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.hypr_consume_community_nonce(uuid) to service_role;
grant execute on function public.hypr_read_community(bigint, text, text) to service_role;
grant execute on function public.hypr_write_community(bigint, text, text, text, text, boolean, uuid) to service_role;
commit;
