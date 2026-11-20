-- Anonymous daily counters and creator stats. No identifiers, cookies, IPs or
-- wallets are stored here: each row is a per-day total for one room and one
-- event. Replaces the opt-in pilot banner for basic product numbers (the 0005
-- pilot tables stay untouched). Run after 0010.
begin;

create table public.hypr_daily_counts (
  day date not null default current_date,
  room_id uuid not null references public.hypr_rooms(room_id),
  event text not null check (event in ('room_view', 'play_start', 'watch_30s', 'chat_message', 'guest_message', 'follow', 'share', 'alert_on', 'poll_vote')),
  total bigint not null default 0,
  primary key (day, room_id, event)
);
create table public.hypr_broadcast_peaks (
  room_id uuid not null references public.hypr_rooms(room_id),
  broadcast_ref text not null check (char_length(broadcast_ref) between 1 and 100),
  peak_viewers integer not null default 0 check (peak_viewers >= 0),
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (room_id, broadcast_ref)
);
create index hypr_broadcast_peaks_recent on public.hypr_broadcast_peaks(room_id, started_at desc);
alter table public.hypr_daily_counts enable row level security;
alter table public.hypr_broadcast_peaks enable row level security;
revoke all on public.hypr_daily_counts, public.hypr_broadcast_peaks from public, anon, authenticated;
grant all on public.hypr_daily_counts, public.hypr_broadcast_peaks to service_role;

create function public.hypr_count_event(p_chain_id bigint, p_token_address text, p_event text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_room_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select room_id into v_room_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then return false; end if;
  insert into public.hypr_daily_counts(day, room_id, event, total) values(current_date, v_room_id, p_event, 1)
    on conflict (day, room_id, event) do update set total = public.hypr_daily_counts.total + 1;
  return true;
end;
$$;

create function public.hypr_record_peak(p_chain_id bigint, p_token_address text, p_broadcast_ref text, p_viewers integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_room_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_viewers is null or p_viewers < 0 or p_viewers > 1000000 then raise exception 'invalid viewers'; end if;
  select room_id into v_room_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then return false; end if;
  insert into public.hypr_broadcast_peaks(room_id, broadcast_ref, peak_viewers) values(v_room_id, p_broadcast_ref, p_viewers)
    on conflict (room_id, broadcast_ref) do update set peak_viewers = greatest(public.hypr_broadcast_peaks.peak_viewers, excluded.peak_viewers), last_seen = now();
  return true;
end;
$$;

-- Creator-only summary. "Came back" counts people who chatted on two or more
-- different days in 30 days (wallet or guest identity): a floor, not all returns.
create function public.hypr_creator_stats(p_chain_id bigint, p_token_address text, p_wallet_address text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_creator_wallet_id uuid; v_counts jsonb; v_last jsonb; v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select room_id, creator_wallet_id into v_room_id, v_creator_wallet_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  if v_creator_wallet_id is distinct from public.hypr_ensure_wallet(p_chain_id, p_wallet_address) then raise exception 'creator required'; end if;
  select coalesce(jsonb_object_agg(event, total), '{}'::jsonb) into v_counts from (
    select event, sum(total) as total from public.hypr_daily_counts where room_id = v_room_id and day > current_date - 7 group by event
  ) c;
  select jsonb_build_object('peakViewers', peak_viewers, 'startedAt', started_at, 'endedAt', last_seen) into v_last
    from public.hypr_broadcast_peaks where room_id = v_room_id order by started_at desc limit 1;
  select jsonb_build_object(
    'last7Days', v_counts,
    'followers', (select count(*) from public.hypr_community_follows where room_id = v_room_id),
    'newFollowers7d', (select count(*) from public.hypr_community_follows where room_id = v_room_id and created_at > now() - interval '7 days'),
    'lastBroadcast', v_last,
    'bestPeak30d', (select max(peak_viewers) from public.hypr_broadcast_peaks where room_id = v_room_id and started_at > now() - interval '30 days'),
    'cameBack30d', (select count(*) from (
      select coalesce(wallet_id::text, guest_id::text) as who from public.hypr_community_messages
      where room_id = v_room_id and created_at > now() - interval '30 days' and deleted_at is null
      group by 1 having count(distinct created_at::date) >= 2) returning_people),
    'checkedAt', now()) into v_result;
  return v_result;
end;
$$;

revoke all on function public.hypr_count_event(bigint,text,text), public.hypr_record_peak(bigint,text,text,integer), public.hypr_creator_stats(bigint,text,text) from public, anon, authenticated;
grant execute on function public.hypr_count_event(bigint,text,text), public.hypr_record_peak(bigint,text,text,integer), public.hypr_creator_stats(bigint,text,text) to service_role;
commit;
