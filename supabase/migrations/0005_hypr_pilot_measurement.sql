-- Optional first-party measurement: anonymous browser IDs, not people or wallet identities.
begin;
create table public.hypr_growth_events (
  event_id uuid primary key,
  room_id uuid not null references public.hypr_rooms(room_id),
  actor_id uuid not null,
  kind text not null check(kind in ('room_viewed','stream_playback_started','stream_watch_threshold_reached','creator_followed','creator_unfollowed','room_shared','share_link_opened')),
  share_id uuid, created_at timestamptz not null default now()
);
create index hypr_growth_room_time on public.hypr_growth_events(room_id, created_at desc);
create index hypr_growth_actor_time on public.hypr_growth_events(actor_id, created_at desc);
create table public.hypr_growth_shares (
  share_id uuid primary key, room_id uuid not null references public.hypr_rooms(room_id),
  actor_id uuid not null, event_id uuid unique references public.hypr_growth_events(event_id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.hypr_growth_events enable row level security;
alter table public.hypr_growth_shares enable row level security;
revoke all on public.hypr_growth_events, public.hypr_growth_shares from public, anon, authenticated;
grant all on public.hypr_growth_events, public.hypr_growth_shares to service_role;

create function public.hypr_prepare_growth_share(p_chain_id bigint, p_token_address text, p_actor_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_share uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select r.room_id into v_room from public.hypr_rooms r join public.hypr_tokens t on t.token_id = r.token_id where t.chain_id = p_chain_id and lower(t.address) = lower(p_token_address) and t.origin = 'hypr' and t.data_status <> 'demo';
  if v_room is null or p_actor_id is null then raise exception 'room missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended('growth-share:' || p_actor_id::text, 0));
  delete from public.hypr_growth_shares where share_id in (select share_id from public.hypr_growth_shares where created_at < now() - interval '30 days' limit 500);
  if (select count(*) from public.hypr_growth_shares where actor_id = p_actor_id and created_at > now() - interval '1 minute') >= 10 then raise exception 'share rate limit'; end if;
  v_share := gen_random_uuid();
  insert into public.hypr_growth_shares(share_id,room_id,actor_id) values(v_share,v_room,p_actor_id);
  return v_share;
end;
$$;

create function public.hypr_record_growth_event(p_chain_id bigint, p_token_address text, p_actor_id uuid, p_event text, p_event_id uuid, p_share_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_share uuid; v_existing public.hypr_growth_events;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_event not in ('room_viewed','stream_playback_started','stream_watch_threshold_reached','creator_followed','creator_unfollowed','room_shared','share_link_opened') or p_actor_id is null then raise exception 'invalid event'; end if;
  select r.room_id into v_room from public.hypr_rooms r join public.hypr_tokens t on t.token_id = r.token_id where t.chain_id = p_chain_id and lower(t.address) = lower(p_token_address) and t.origin = 'hypr' and t.data_status <> 'demo';
  if v_room is null then raise exception 'room missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended('growth-event:' || p_actor_id::text, 0));
  select * into v_existing from public.hypr_growth_events where event_id = p_event_id;
  if found then
    if v_existing.actor_id <> p_actor_id or v_existing.room_id <> v_room or v_existing.kind <> p_event then raise exception 'event collision'; end if;
    return jsonb_build_object('shareId', (select share_id from public.hypr_growth_shares where event_id = p_event_id));
  end if;
  if (select count(*) from public.hypr_growth_events where actor_id = p_actor_id and created_at > now() - interval '1 minute') >= 20 then raise exception 'rate limit'; end if;
  -- 30-day retention, bounded cleanup per consenting write; no unrelated tables touched.
  delete from public.hypr_growth_events where event_id in (select event_id from public.hypr_growth_events where created_at < now() - interval '30 days' limit 500);
  if p_share_id is not null and exists(select 1 from public.hypr_growth_shares where share_id = p_share_id and room_id = v_room and ((p_event = 'room_shared' and actor_id = p_actor_id) or (p_event <> 'room_shared' and event_id is not null))) then v_share := p_share_id; end if;
  if p_event = 'share_link_opened' and v_share is null then raise exception 'unknown share'; end if;
  insert into public.hypr_growth_events(event_id, room_id, actor_id, kind, share_id) values(p_event_id, v_room, p_actor_id, p_event, v_share);
  if p_event = 'room_shared' then
    if v_share is not null then update public.hypr_growth_shares set event_id = coalesce(event_id, p_event_id) where share_id = v_share and actor_id = p_actor_id; end if;
  end if;
  return jsonb_build_object('shareId', v_share);
end;
$$;

create function public.hypr_forget_growth_actor(p_actor_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  delete from public.hypr_growth_events where actor_id = p_actor_id;
  delete from public.hypr_growth_shares where actor_id = p_actor_id;
  return true;
end;
$$;

create function public.hypr_growth_metrics(p_chain_id bigint, p_token_address text, p_wallet_address text, p_founder boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_token_address is not null then
    select r.room_id into v_room from public.hypr_rooms r join public.hypr_tokens t on t.token_id = r.token_id join public.hypr_wallets w on w.wallet_id = t.deployer_wallet_id
      where t.chain_id = p_chain_id and lower(t.address) = lower(p_token_address) and (p_founder or lower(w.address) = lower(p_wallet_address)) and t.origin = 'hypr' and t.data_status <> 'demo';
    if v_room is null then raise exception 'creator required'; end if;
  elsif not p_founder then raise exception 'founder required'; end if;
  with scoped as (
    select e.* from public.hypr_growth_events e join public.hypr_rooms r on r.room_id = e.room_id join public.hypr_tokens t on t.token_id = r.token_id
    where t.chain_id = p_chain_id and (v_room is null or e.room_id = v_room) and e.created_at >= now() - interval '30 days'
  ), viewers as (
    select actor_id, min(created_at) as first_watch from scoped where kind = 'stream_watch_threshold_reached' group by actor_id
  ), cohort as (
    select v.*, exists(select 1 from scoped e where e.actor_id = v.actor_id and e.kind = 'stream_watch_threshold_reached' and e.created_at >= v.first_watch + interval '1 day' and e.created_at < v.first_watch + interval '2 days') as returned1,
    exists(select 1 from scoped e where e.actor_id = v.actor_id and e.kind = 'stream_watch_threshold_reached' and e.created_at >= v.first_watch + interval '7 days' and e.created_at < v.first_watch + interval '8 days') as returned7,
    exists(select 1 from scoped e where e.actor_id = v.actor_id and e.kind = 'creator_followed' and e.created_at >= v.first_watch) as followed from viewers v
  ), summary as (
    select count(distinct actor_id) filter(where kind = 'stream_watch_threshold_reached' and created_at >= now() - interval '1 day') as daily,
    count(distinct actor_id) filter(where kind = 'stream_watch_threshold_reached' and created_at >= now() - interval '7 days') as weekly,
    count(distinct actor_id) filter(where kind = 'stream_watch_threshold_reached') as viewers,
    count(*) filter(where kind = 'room_shared') as shares,
    count(distinct (share_id,actor_id)) filter(where kind = 'share_link_opened') as arrivals,
    count(distinct actor_id) filter(where kind = 'creator_followed' and share_id is not null and exists(select 1 from scoped o where o.actor_id = scoped.actor_id and o.share_id = scoped.share_id and o.kind = 'share_link_opened' and o.created_at <= scoped.created_at)) as shared_follows
    from scoped
  ) select jsonb_build_object('dailyViewers', daily, 'weeklyViewers', weekly, 'uniqueViewers30d', summary.viewers, 'shares', shares, 'attributedArrivals', arrivals, 'attributedFollowers', shared_follows,
    'watchedThenFollowed', (select count(*) from cohort where followed),
    'day1Eligible', (select count(*) from cohort where first_watch < now() - interval '2 days'), 'day1Returned', (select count(*) from cohort where first_watch < now() - interval '2 days' and returned1),
    'day7Eligible', (select count(*) from cohort where first_watch < now() - interval '8 days'), 'day7Returned', (select count(*) from cohort where first_watch < now() - interval '8 days' and returned7),
    'scope', 'Consenting anonymous browsers only; client-reported 30-second visible playing/subscribed-media threshold. Not audited humans, audible playback, total traffic or trading results.',
    'averageWatchDuration', null, 'repeatCreatorRate', null, 'successfulBroadcasts', null, 'engagementWithoutTrade', null,
    'checkedAt', now()) into v_result from summary;
  return v_result;
end;
$$;
revoke all on function public.hypr_prepare_growth_share(bigint,text,uuid), public.hypr_record_growth_event(bigint,text,uuid,text,uuid,uuid), public.hypr_forget_growth_actor(uuid), public.hypr_growth_metrics(bigint,text,text,boolean) from public, anon, authenticated;
grant execute on function public.hypr_prepare_growth_share(bigint,text,uuid), public.hypr_record_growth_event(bigint,text,uuid,text,uuid,uuid), public.hypr_forget_growth_actor(uuid), public.hypr_growth_metrics(bigint,text,text,boolean) to service_role;
commit;
