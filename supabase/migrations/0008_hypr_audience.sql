-- Audience features: wallet-free guest chat, creator chat settings (guest
-- access and slow mode), and anonymous "here now" presence. Additive; run
-- after 0007. Guest identities are random browser IDs with a nickname, never
-- linked to wallets. IP addresses are stored only as salted hashes in a
-- short-lived rate-limit table and are deleted after one hour.
begin;

alter table public.hypr_community_messages alter column wallet_id drop not null;
alter table public.hypr_community_messages add column if not exists guest_id uuid;
alter table public.hypr_community_messages add column if not exists guest_name text;
alter table public.hypr_community_messages add constraint hypr_community_messages_guest_name check (guest_name is null or guest_name ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,23}$');
alter table public.hypr_community_messages add constraint hypr_community_messages_author check (wallet_id is not null or (guest_id is not null and guest_name is not null));
create index if not exists hypr_community_messages_guest_time on public.hypr_community_messages(guest_id, created_at desc) where guest_id is not null;

create table public.hypr_room_chat_settings (
  room_id uuid primary key references public.hypr_rooms(room_id),
  guests_allowed boolean not null default true,
  slow_mode_seconds integer not null default 0 check (slow_mode_seconds in (0, 5, 15, 30, 60)),
  updated_at timestamptz not null default now()
);
create table public.hypr_guest_chat_limits (
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  room_id uuid not null references public.hypr_rooms(room_id),
  created_at timestamptz not null default now()
);
create index hypr_guest_chat_limits_ip_time on public.hypr_guest_chat_limits(ip_hash, created_at desc);
create index hypr_guest_chat_limits_room_time on public.hypr_guest_chat_limits(room_id, created_at desc);
create table public.hypr_room_presence (
  room_id uuid not null references public.hypr_rooms(room_id),
  viewer_key text not null check (viewer_key ~ '^[a-f0-9]{64}$'),
  last_seen timestamptz not null default now(),
  primary key (room_id, viewer_key)
);
create index hypr_room_presence_room_seen on public.hypr_room_presence(room_id, last_seen desc);

alter table public.hypr_room_chat_settings enable row level security;
alter table public.hypr_guest_chat_limits enable row level security;
alter table public.hypr_room_presence enable row level security;
revoke all on public.hypr_room_chat_settings, public.hypr_guest_chat_limits, public.hypr_room_presence from public, anon, authenticated;
grant all on public.hypr_room_chat_settings, public.hypr_guest_chat_limits, public.hypr_room_presence to service_role;

create function public.hypr_room_for_token(p_chain_id bigint, p_token_address text)
returns table(room_id uuid, creator_wallet_id uuid) language sql stable security definer set search_path = public as $$
  select r.room_id, t.deployer_wallet_id from public.hypr_rooms r join public.hypr_tokens t on t.token_id = r.token_id
  where t.chain_id = p_chain_id and lower(t.address) = lower(p_token_address) and t.data_status <> 'demo';
$$;

create function public.hypr_chat_slow_mode(p_room_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select slow_mode_seconds from public.hypr_room_chat_settings where room_id = p_room_id), 0);
$$;

create function public.hypr_write_guest_message(p_chain_id bigint, p_token_address text, p_guest_id uuid, p_guest_name text, p_body text, p_ip_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_guests_allowed boolean; v_gap integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_guest_id is null then raise exception 'guest required'; end if;
  if p_guest_name is null or p_guest_name !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,23}$' then raise exception 'invalid guest name'; end if;
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid client'; end if;
  if p_body is null or char_length(trim(p_body)) not between 1 and 280 then raise exception 'invalid message'; end if;
  select room_id into v_room_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  select coalesce((select guests_allowed from public.hypr_room_chat_settings where room_id = v_room_id), true) into v_guests_allowed;
  if not v_guests_allowed then raise exception 'guest chat off'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_chain_id::text || ':guest:' || p_ip_hash, 0));
  -- Guests always wait at least 5 seconds; creators can slow everyone further.
  v_gap := greatest(5, public.hypr_chat_slow_mode(v_room_id));
  if exists(select 1 from public.hypr_community_messages where guest_id = p_guest_id and created_at > now() - make_interval(secs => v_gap))
    or (select count(*) from public.hypr_community_messages where guest_id = p_guest_id and created_at > now() - interval '1 minute') >= 6
    or (select count(*) from public.hypr_guest_chat_limits where ip_hash = p_ip_hash and created_at > now() - interval '1 minute') >= 10
    or (select count(*) from public.hypr_guest_chat_limits where room_id = v_room_id and created_at > now() - interval '1 minute') >= 60
    then raise exception 'message rate limit'; end if;
  insert into public.hypr_community_messages(room_id, wallet_id, guest_id, guest_name, body) values(v_room_id, null, p_guest_id, p_guest_name, trim(p_body));
  insert into public.hypr_guest_chat_limits(ip_hash, room_id) values(p_ip_hash, v_room_id);
  delete from public.hypr_guest_chat_limits where ctid in (select ctid from public.hypr_guest_chat_limits where created_at < now() - interval '1 hour' limit 500);
  return true;
end;
$$;

-- Wallet chat keeps its existing limits and also honors creator slow mode.
create or replace function public.hypr_write_community(p_chain_id bigint, p_token_address text, p_wallet_address text, p_action text, p_body text default null, p_follow boolean default null, p_message_id uuid default null)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_room_id uuid; v_wallet_id uuid; v_creator_wallet_id uuid; v_gap integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_wallet_address is null or lower(p_wallet_address) !~ '^0x[0-9a-f]{40}$' then raise exception 'invalid wallet'; end if;
  select room_id, creator_wallet_id into v_room_id, v_creator_wallet_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_chain_id::text || ':community:' || lower(p_wallet_address), 0));
  v_wallet_id := public.hypr_ensure_wallet(p_chain_id, p_wallet_address);
  if p_action = 'message' then
    if p_body is null or char_length(trim(p_body)) not between 1 and 280 then raise exception 'invalid message'; end if;
    v_gap := case when v_wallet_id = v_creator_wallet_id then 0 else public.hypr_chat_slow_mode(v_room_id) end;
    if exists(select 1 from public.hypr_community_messages where wallet_id = v_wallet_id and created_at > now() - interval '3 seconds')
      or (v_gap > 0 and exists(select 1 from public.hypr_community_messages where wallet_id = v_wallet_id and room_id = v_room_id and created_at > now() - make_interval(secs => v_gap)))
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
    delete from public.hypr_community_pins where room_id = v_room_id and message_id = p_message_id;
  elsif p_action = 'pin' then
    if v_creator_wallet_id is distinct from v_wallet_id then raise exception 'creator required'; end if;
    if not exists(select 1 from public.hypr_community_messages where message_id = p_message_id and room_id = v_room_id and deleted_at is null) then raise exception 'message not found'; end if;
    insert into public.hypr_community_pins(room_id, message_id) values(v_room_id, p_message_id)
      on conflict (room_id) do update set message_id = excluded.message_id, pinned_at = now();
  elsif p_action = 'unpin' then
    if v_creator_wallet_id is distinct from v_wallet_id then raise exception 'creator required'; end if;
    delete from public.hypr_community_pins where room_id = v_room_id;
  else raise exception 'invalid action'; end if;
  return true;
end;
$$;

create function public.hypr_write_chat_settings(p_chain_id bigint, p_token_address text, p_wallet_address text, p_guests_allowed boolean, p_slow_mode_seconds integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_creator_wallet_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select room_id, creator_wallet_id into v_room_id, v_creator_wallet_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  if v_creator_wallet_id is distinct from public.hypr_ensure_wallet(p_chain_id, p_wallet_address) then raise exception 'creator required'; end if;
  if p_guests_allowed is null or p_slow_mode_seconds is null or p_slow_mode_seconds not in (0, 5, 15, 30, 60) then raise exception 'invalid settings'; end if;
  insert into public.hypr_room_chat_settings(room_id, guests_allowed, slow_mode_seconds) values(v_room_id, p_guests_allowed, p_slow_mode_seconds)
    on conflict (room_id) do update set guests_allowed = excluded.guests_allowed, slow_mode_seconds = excluded.slow_mode_seconds, updated_at = now();
  return jsonb_build_object('guestsAllowed', p_guests_allowed, 'slowMode', p_slow_mode_seconds);
end;
$$;

-- viewer_key is a server-side hash of a random per-tab ID: no wallet, IP or cookie.
create function public.hypr_touch_presence(p_chain_id bigint, p_token_address text, p_viewer_key text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_viewer_key is null or p_viewer_key !~ '^[a-f0-9]{64}$' then raise exception 'invalid viewer'; end if;
  select room_id into v_room_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  insert into public.hypr_room_presence(room_id, viewer_key) values(v_room_id, p_viewer_key)
    on conflict (room_id, viewer_key) do update set last_seen = now();
  delete from public.hypr_room_presence where ctid in (select ctid from public.hypr_room_presence where room_id = v_room_id and last_seen < now() - interval '5 minutes' limit 200);
  select count(*) into v_count from public.hypr_room_presence where room_id = v_room_id and last_seen > now() - interval '50 seconds';
  return v_count;
end;
$$;

create or replace function public.hypr_read_community_feed(p_chain_id bigint, p_token_address text, p_wallet_address text default null, p_before uuid default null, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_before timestamptz; v_messages jsonb; v_following boolean; v_follower_count bigint; v_pinned jsonb; v_has_more boolean; v_settings jsonb; v_here integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_limit is null or p_limit < 50 or p_limit > 500 then raise exception 'invalid message limit'; end if;
  select room_id into v_room_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  if p_before is not null then
    select created_at into v_before from public.hypr_community_messages where message_id = p_before and room_id = v_room_id;
    if v_before is null then raise exception 'invalid message cursor'; end if;
  end if;
  select coalesce(jsonb_agg(row_to_json(m) order by m.created_at, m.id), '[]'::jsonb) into v_messages from (
    select c.message_id as id, w.address as wallet, c.guest_name as guest, c.body, c.created_at
    from public.hypr_community_messages c left join public.hypr_wallets w on w.wallet_id = c.wallet_id
    where c.room_id = v_room_id and c.deleted_at is null and (v_before is null or (c.created_at, c.message_id) < (v_before, p_before))
    order by c.created_at desc, c.message_id desc limit p_limit
  ) m;
  select exists(
    select 1 from public.hypr_community_messages c
    where c.room_id = v_room_id and c.deleted_at is null and (v_before is null or (c.created_at, c.message_id) < (v_before, p_before))
    order by c.created_at desc, c.message_id desc
    offset p_limit
  ) into v_has_more;
  select count(*) into v_follower_count from public.hypr_community_follows f where f.room_id = v_room_id;
  select exists(select 1 from public.hypr_community_follows f join public.hypr_wallets w on w.wallet_id = f.wallet_id
    where f.room_id = v_room_id and lower(w.address) = lower(p_wallet_address)) into v_following;
  select jsonb_build_object('id', c.message_id, 'wallet', w.address, 'guest', c.guest_name, 'body', c.body, 'created_at', c.created_at) into v_pinned
    from public.hypr_community_pins p join public.hypr_community_messages c on c.message_id = p.message_id
    left join public.hypr_wallets w on w.wallet_id = c.wallet_id
    where p.room_id = v_room_id and c.deleted_at is null;
  select jsonb_build_object('guestsAllowed', coalesce(s.guests_allowed, true), 'slowMode', coalesce(s.slow_mode_seconds, 0)) into v_settings
    from (select 1) one left join public.hypr_room_chat_settings s on s.room_id = v_room_id;
  select count(*) into v_here from public.hypr_room_presence where room_id = v_room_id and last_seen > now() - interval '50 seconds';
  return jsonb_build_object('messages', v_messages, 'followers', v_follower_count, 'following', v_following, 'hasMore', coalesce(v_has_more, false), 'pinned', v_pinned, 'settings', v_settings, 'here', v_here);
end;
$$;

revoke all on function public.hypr_room_for_token(bigint,text), public.hypr_chat_slow_mode(uuid), public.hypr_write_guest_message(bigint,text,uuid,text,text,text), public.hypr_write_chat_settings(bigint,text,text,boolean,integer), public.hypr_touch_presence(bigint,text,text), public.hypr_read_community_feed(bigint,text,text,uuid,integer), public.hypr_write_community(bigint,text,text,text,text,boolean,uuid) from public, anon, authenticated;
grant execute on function public.hypr_room_for_token(bigint,text), public.hypr_chat_slow_mode(uuid), public.hypr_write_guest_message(bigint,text,uuid,text,text,text), public.hypr_write_chat_settings(bigint,text,text,boolean,integer), public.hypr_touch_presence(bigint,text,text), public.hypr_read_community_feed(bigint,text,text,uuid,integer), public.hypr_write_community(bigint,text,text,text,text,boolean,uuid) to service_role;
commit;
