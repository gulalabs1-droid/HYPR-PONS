-- Additive creator-room growth slice. Existing financial/auth/community RPCs unchanged.
begin;
create table public.hypr_creator_profiles (
  room_id uuid primary key references public.hypr_rooms(room_id),
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar text not null default 'H' check (avatar in ('H','★','◉','♫','✦')),
  moment_title text check (moment_title is null or char_length(moment_title) between 1 and 100),
  updated_at timestamptz not null default now()
);
create table public.hypr_creator_shows (
  show_id uuid primary key,
  room_id uuid not null references public.hypr_rooms(room_id),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  starts_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','ended','canceled')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index hypr_one_next_show on public.hypr_creator_shows(room_id) where status = 'scheduled';
create index hypr_upcoming_shows on public.hypr_creator_shows(starts_at) where status = 'scheduled';
create table public.hypr_community_reports (
  report_id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.hypr_rooms(room_id),
  reporter_wallet_id uuid not null references public.hypr_wallets(wallet_id),
  message_id uuid references public.hypr_community_messages(message_id),
  reason text not null check (reason in ('spam','harassment','unsafe','copyright','other')),
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create index hypr_report_room_time on public.hypr_community_reports(room_id, created_at desc);
create table public.hypr_growth_write_limits (
  wallet_address text primary key, window_at timestamptz not null, attempts integer not null
);
alter table public.hypr_creator_profiles enable row level security;
alter table public.hypr_creator_shows enable row level security;
alter table public.hypr_community_reports enable row level security;
alter table public.hypr_growth_write_limits enable row level security;
revoke all on public.hypr_creator_profiles, public.hypr_creator_shows, public.hypr_community_reports, public.hypr_growth_write_limits from public, anon, authenticated;
grant all on public.hypr_creator_profiles, public.hypr_creator_shows, public.hypr_community_reports, public.hypr_growth_write_limits to service_role;

create function public.hypr_read_growth(p_chain_id bigint, p_wallet_address text default null, p_token_address text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select coalesce(jsonb_agg(q.data order by q.created_at desc), '[]'::jsonb) into v_result from (
    select r.created_at, jsonb_build_object(
      'address', lower(t.address), 'creator', lower(w.address), 'name', t.name,
      'displayName', p.display_name, 'bio', p.bio, 'avatar', coalesce(p.avatar, 'H'),
      'moment', p.moment_title,
      'followers', (select count(*) from public.hypr_community_follows f where f.room_id = r.room_id),
      'following', exists(select 1 from public.hypr_community_follows f join public.hypr_wallets fw on fw.wallet_id = f.wallet_id where f.room_id = r.room_id and lower(fw.address) = lower(p_wallet_address)),
      'owned', lower(w.address) = lower(coalesce(p_wallet_address, '')),
      'show', (select jsonb_build_object('id', s.show_id, 'title', s.title, 'description', s.description, 'startsAt', s.starts_at, 'revision', s.revision, 'status', s.status) from public.hypr_creator_shows s where s.room_id = r.room_id and s.status = 'scheduled' limit 1)
    ) as data
    from public.hypr_rooms r join public.hypr_tokens t on t.token_id = r.token_id
    join public.hypr_wallets w on w.wallet_id = t.deployer_wallet_id
    left join public.hypr_creator_profiles p on p.room_id = r.room_id
    where t.chain_id = p_chain_id and t.origin = 'hypr' and t.data_status <> 'demo'
      and (p_token_address is null or lower(t.address) = lower(p_token_address))
    order by r.created_at desc limit 500
  ) q;
  return v_result;
end;
$$;

create function public.hypr_write_growth(p_chain_id bigint, p_token_address text, p_wallet_address text, p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_creator text; v_wallet uuid; v_show public.hypr_creator_shows; v_start timestamptz; v_count integer; v_report public.hypr_community_reports;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_wallet_address is null or lower(p_wallet_address) !~ '^0x[0-9a-f]{40}$' then raise exception 'invalid wallet'; end if;
  select r.room_id, lower(w.address) into v_room, v_creator from public.hypr_rooms r
    join public.hypr_tokens t on t.token_id = r.token_id join public.hypr_wallets w on w.wallet_id = t.deployer_wallet_id
    where t.chain_id = p_chain_id and lower(t.address) = lower(p_token_address) and t.origin = 'hypr' and t.data_status <> 'demo';
  if v_room is null then raise exception 'room missing'; end if;
  if p_action <> 'report' and v_creator <> lower(p_wallet_address) then raise exception 'creator required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('growth:' || lower(p_wallet_address), 0));
  insert into public.hypr_growth_write_limits(wallet_address, window_at, attempts) values(lower(p_wallet_address), now(), 1)
    on conflict (wallet_address) do update set attempts = case when hypr_growth_write_limits.window_at < now() - interval '1 minute' then 1 else hypr_growth_write_limits.attempts + 1 end,
    window_at = case when hypr_growth_write_limits.window_at < now() - interval '1 minute' then now() else hypr_growth_write_limits.window_at end
    returning attempts into v_count;
  if v_count > 20 then raise exception 'rate limit'; end if;
  perform pg_advisory_xact_lock(hashtextextended('growth-room:' || v_room::text, 0));
  if p_action = 'profile' then
    insert into public.hypr_creator_profiles(room_id, display_name, bio, avatar) values(v_room, trim(p_payload->>'displayName'), trim(p_payload->>'bio'), p_payload->>'avatar')
    on conflict(room_id) do update set display_name = excluded.display_name, bio = excluded.bio, avatar = excluded.avatar, updated_at = now();
  elsif p_action = 'moment' then
    if not exists(select 1 from public.hypr_creator_profiles where room_id = v_room) then raise exception 'save creator profile first'; end if;
    update public.hypr_creator_profiles set moment_title = nullif(trim(p_payload->>'title'), ''), updated_at = now() where room_id = v_room;
  elsif p_action = 'schedule' then
    v_start := (p_payload->>'startsAt')::timestamptz;
    if v_start is null or v_start <= now() or v_start > now() + interval '90 days' then raise exception 'invalid show time'; end if;
    select * into v_show from public.hypr_creator_shows where show_id = (p_payload->>'id')::uuid;
    if found then
      if v_show.room_id <> v_room or v_show.status <> 'scheduled' then raise exception 'show conflict'; end if;
      -- Identical retry is idempotent, including a response lost after commit.
      if v_show.title = trim(p_payload->>'title') and v_show.description = trim(p_payload->>'description') and v_show.starts_at = v_start then return jsonb_build_object('id', v_show.show_id); end if;
      if v_show.revision <> (p_payload->>'revision')::integer then raise exception 'show revision conflict'; end if;
      update public.hypr_creator_shows set title = trim(p_payload->>'title'), description = trim(p_payload->>'description'), starts_at = v_start, revision = revision + 1, updated_at = now() where show_id = v_show.show_id;
    else
      if (p_payload->>'revision')::integer <> 0 then raise exception 'new show revision'; end if;
      insert into public.hypr_creator_shows(show_id, room_id, title, description, starts_at) values((p_payload->>'id')::uuid, v_room, trim(p_payload->>'title'), trim(p_payload->>'description'), v_start);
    end if;
  elsif p_action in ('cancel','finish') then
    select * into v_show from public.hypr_creator_shows where show_id = (p_payload->>'id')::uuid;
    if not found or v_show.room_id <> v_room then raise exception 'show missing'; end if;
    if v_show.status = (case when p_action = 'cancel' then 'canceled' else 'ended' end) then return jsonb_build_object('id', v_show.show_id); end if;
    if v_show.status <> 'scheduled' or v_show.revision <> (p_payload->>'revision')::integer then raise exception 'show revision conflict'; end if;
    update public.hypr_creator_shows set status = case when p_action = 'cancel' then 'canceled' else 'ended' end, revision = revision + 1, updated_at = now() where show_id = v_show.show_id;
  elsif p_action = 'report' then
    v_wallet := public.hypr_ensure_wallet(p_chain_id, p_wallet_address);
    if p_payload->>'messageId' is not null and not exists(select 1 from public.hypr_community_messages where message_id = (p_payload->>'messageId')::uuid and room_id = v_room) then raise exception 'message not in room'; end if;
    if (select count(*) from public.hypr_community_reports where reporter_wallet_id = v_wallet and created_at > now() - interval '1 hour') >= 5 then raise exception 'report rate limit'; end if;
    if not exists(select 1 from public.hypr_community_reports where room_id = v_room and reporter_wallet_id = v_wallet and message_id is not distinct from (p_payload->>'messageId')::uuid and resolved_at is null) then
      insert into public.hypr_community_reports(room_id, reporter_wallet_id, message_id, reason, details) values(v_room, v_wallet, (p_payload->>'messageId')::uuid, p_payload->>'reason', trim(p_payload->>'details'));
    end if;
  elsif p_action = 'resolve-report' then
    select * into v_report from public.hypr_community_reports where report_id = (p_payload->>'id')::uuid and room_id = v_room;
    if not found then raise exception 'report missing'; end if;
    if coalesce((p_payload->>'hideMessage')::boolean, false) and v_report.message_id is not null then
      update public.hypr_community_messages set deleted_at = coalesce(deleted_at, now()) where message_id = v_report.message_id and room_id = v_room;
    end if;
    update public.hypr_community_reports set resolved_at = coalesce(resolved_at, now()) where report_id = v_report.report_id;
  else raise exception 'invalid action'; end if;
  return jsonb_build_object('saved', true);
end;
$$;

create function public.hypr_read_reports(p_chain_id bigint, p_token_address text, p_wallet_address text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select r.room_id into v_room from public.hypr_rooms r join public.hypr_tokens t on t.token_id = r.token_id join public.hypr_wallets w on w.wallet_id = t.deployer_wallet_id
    where t.chain_id = p_chain_id and lower(t.address) = lower(p_token_address) and lower(w.address) = lower(p_wallet_address) and t.origin = 'hypr' and t.data_status <> 'demo';
  if v_room is null then raise exception 'creator required'; end if;
  select coalesce(jsonb_agg(q), '[]'::jsonb) into v_result from (
    select c.report_id as id, c.reason, c.details, c.created_at, m.body as message, c.message_id as "messageId" from public.hypr_community_reports c
      left join public.hypr_community_messages m on m.message_id = c.message_id where c.room_id = v_room and c.resolved_at is null order by c.created_at desc limit 50
  ) q;
  return v_result;
end;
$$;
revoke all on function public.hypr_read_growth(bigint,text,text), public.hypr_write_growth(bigint,text,text,text,jsonb), public.hypr_read_reports(bigint,text,text) from public, anon, authenticated;
grant execute on function public.hypr_read_growth(bigint,text,text), public.hypr_write_growth(bigint,text,text,text,jsonb), public.hypr_read_reports(bigint,text,text) to service_role;
commit;
