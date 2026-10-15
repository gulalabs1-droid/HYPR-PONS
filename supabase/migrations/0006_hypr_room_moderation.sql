-- Additive chat history, creator pins, operator-visible room reports, and per-show metrics.
begin;

create table public.hypr_community_pins (
  room_id uuid primary key references public.hypr_rooms(room_id),
  message_id uuid not null references public.hypr_community_messages(message_id),
  pinned_at timestamptz not null default now()
);
alter table public.hypr_community_pins enable row level security;
revoke all on public.hypr_community_pins from public, anon, authenticated;
grant all on public.hypr_community_pins to service_role;

alter table public.hypr_community_reports add column if not exists operator_inbox boolean not null default false;
create index if not exists hypr_operator_inbox_time on public.hypr_community_reports(created_at desc) where operator_inbox and resolved_at is null;

create function public.hypr_flag_operator_room_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if new.message_id is null then new.operator_inbox := true; end if;
  return new;
end;
$$;
create trigger hypr_flag_operator_room_report before insert on public.hypr_community_reports
  for each row execute procedure public.hypr_flag_operator_room_report();

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

create function public.hypr_read_community_feed(p_chain_id bigint, p_token_address text, p_wallet_address text default null, p_before uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_before timestamptz; v_messages jsonb; v_following boolean; v_follower_count bigint; v_pinned jsonb; v_has_more boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select r.room_id into v_room_id from public.hypr_rooms r join public.hypr_tokens t on t.token_id = r.token_id
    where t.chain_id = p_chain_id and lower(t.address) = lower(p_token_address) and t.data_status <> 'demo';
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  if p_before is not null then
    select created_at into v_before from public.hypr_community_messages where message_id = p_before and room_id = v_room_id;
  end if;
  select coalesce(jsonb_agg(row_to_json(m) order by m.created_at), '[]'::jsonb) into v_messages from (
    select c.message_id as id, w.address as wallet, c.body, c.created_at
    from public.hypr_community_messages c join public.hypr_wallets w on w.wallet_id = c.wallet_id
    where c.room_id = v_room_id and c.deleted_at is null and (v_before is null or c.created_at < v_before)
    order by c.created_at desc limit 50
  ) m;
  select exists(
    select 1 from public.hypr_community_messages c
    where c.room_id = v_room_id and c.deleted_at is null and (v_before is null or c.created_at < v_before)
    order by c.created_at desc
    offset 50
  ) into v_has_more;
  select count(*) into v_follower_count from public.hypr_community_follows f where f.room_id = v_room_id;
  select exists(select 1 from public.hypr_community_follows f join public.hypr_wallets w on w.wallet_id = f.wallet_id
    where f.room_id = v_room_id and lower(w.address) = lower(p_wallet_address)) into v_following;
  select jsonb_build_object('id', c.message_id, 'wallet', w.address, 'body', c.body, 'created_at', c.created_at) into v_pinned
    from public.hypr_community_pins p join public.hypr_community_messages c on c.message_id = p.message_id
    join public.hypr_wallets w on w.wallet_id = c.wallet_id
    where p.room_id = v_room_id and c.deleted_at is null;
  return jsonb_build_object('messages', v_messages, 'followers', v_follower_count, 'following', v_following, 'hasMore', coalesce(v_has_more, false), 'pinned', v_pinned);
end;
$$;

create function public.hypr_read_operator_reports(p_chain_id bigint, p_allowed boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_allowed is not true then raise exception 'operator required'; end if;
  select coalesce(jsonb_agg(q), '[]'::jsonb) into v_result from (
    select c.report_id as id, lower(t.address) as "roomId", t.name as room, c.reason, c.details, c.created_at, m.body as message, c.message_id as "messageId"
    from public.hypr_community_reports c
      join public.hypr_rooms r on r.room_id = c.room_id
      join public.hypr_tokens t on t.token_id = r.token_id
      left join public.hypr_community_messages m on m.message_id = c.message_id
    where t.chain_id = p_chain_id and c.operator_inbox and c.resolved_at is null
    order by c.created_at desc limit 50
  ) q;
  return v_result;
end;
$$;

create or replace function public.hypr_growth_metrics(p_chain_id bigint, p_token_address text, p_wallet_address text, p_founder boolean default false)
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
  ), shows as (
    select coalesce(jsonb_agg(row_to_json(s) order by s."startsAt" desc), '[]'::jsonb) as list from (
      select s.show_id as id, s.title, s.starts_at as "startsAt", s.status,
        count(distinct e.actor_id) filter (where e.kind = 'stream_watch_threshold_reached') as viewers,
        count(*) filter (where e.kind = 'creator_followed') as follows
      from public.hypr_creator_shows s
      left join public.hypr_growth_events e on e.room_id = s.room_id and e.created_at >= s.starts_at - interval '15 minutes' and e.created_at < s.starts_at + interval '4 hours'
      where v_room is not null and s.room_id = v_room and s.starts_at >= now() - interval '30 days'
      group by s.show_id
      order by s.starts_at desc
      limit 12
    ) s
  )
  select jsonb_build_object('dailyViewers', daily, 'weeklyViewers', weekly, 'uniqueViewers30d', summary.viewers, 'shares', shares, 'attributedArrivals', arrivals, 'attributedFollowers', shared_follows,
    'watchedThenFollowed', (select count(*) from cohort where followed),
    'day1Eligible', (select count(*) from cohort where first_watch < now() - interval '2 days'), 'day1Returned', (select count(*) from cohort where first_watch < now() - interval '2 days' and returned1),
    'day7Eligible', (select count(*) from cohort where first_watch < now() - interval '8 days'), 'day7Returned', (select count(*) from cohort where first_watch < now() - interval '8 days' and returned7),
    'shows', shows.list,
    'scope', 'Consenting anonymous browsers only; client-reported 30-second visible playing/subscribed-media threshold. Not audited humans, audible playback, total traffic or trading results. Per-show counts use the scheduled start ±15 minutes / +4 hours, not a provider-certified broadcast log.',
    'averageWatchDuration', null, 'repeatCreatorRate', null, 'successfulBroadcasts', null, 'engagementWithoutTrade', null,
    'checkedAt', now()) into v_result from summary, shows;
  return v_result;
end;
$$;

revoke all on function public.hypr_flag_operator_room_report(), public.hypr_read_community_feed(bigint,text,text,uuid), public.hypr_read_operator_reports(bigint,boolean) from public, anon, authenticated;
grant execute on function public.hypr_write_community(bigint,text,text,text,text,boolean,uuid), public.hypr_read_community_feed(bigint,text,text,uuid), public.hypr_read_operator_reports(bigint,boolean), public.hypr_growth_metrics(bigint,text,text,boolean) to service_role;
commit;
