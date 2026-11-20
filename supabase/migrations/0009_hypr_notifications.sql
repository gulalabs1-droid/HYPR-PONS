-- Web push reminders: "creator is live" and "show starts soon". Additive; run
-- after 0008. A subscription is a browser push endpoint, not a person or a
-- wallet. Each delivery is recorded once so retries never double-notify.
begin;

create table public.hypr_push_subscriptions (
  subscription_id uuid primary key default gen_random_uuid(),
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  created_at timestamptz not null default now(),
  failures integer not null default 0
);
create table public.hypr_push_rooms (
  subscription_id uuid not null references public.hypr_push_subscriptions(subscription_id) on delete cascade,
  room_id uuid not null references public.hypr_rooms(room_id),
  created_at timestamptz not null default now(),
  primary key (subscription_id, room_id)
);
create index hypr_push_rooms_room on public.hypr_push_rooms(room_id);
create table public.hypr_push_deliveries (
  subscription_id uuid not null references public.hypr_push_subscriptions(subscription_id) on delete cascade,
  kind text not null check (kind in ('live', 'show')),
  ref text not null check (char_length(ref) between 1 and 100),
  sent_at timestamptz not null default now(),
  primary key (subscription_id, kind, ref)
);
create table public.hypr_show_reminders (
  show_id uuid primary key references public.hypr_creator_shows(show_id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.hypr_push_subscriptions enable row level security;
alter table public.hypr_push_rooms enable row level security;
alter table public.hypr_push_deliveries enable row level security;
alter table public.hypr_show_reminders enable row level security;
revoke all on public.hypr_push_subscriptions, public.hypr_push_rooms, public.hypr_push_deliveries, public.hypr_show_reminders from public, anon, authenticated;
grant all on public.hypr_push_subscriptions, public.hypr_push_rooms, public.hypr_push_deliveries, public.hypr_show_reminders to service_role;

create function public.hypr_push_follow(p_chain_id bigint, p_token_address text, p_endpoint text, p_p256dh text, p_auth text, p_follow boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_subscription uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select room_id into v_room_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  insert into public.hypr_push_subscriptions(endpoint, p256dh, auth) values(p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, failures = 0
    returning subscription_id into v_subscription;
  if p_follow then
    if (select count(*) from public.hypr_push_rooms where subscription_id = v_subscription) >= 100 then raise exception 'too many rooms'; end if;
    insert into public.hypr_push_rooms(subscription_id, room_id) values(v_subscription, v_room_id) on conflict do nothing;
  else
    delete from public.hypr_push_rooms where subscription_id = v_subscription and room_id = v_room_id;
  end if;
  return p_follow;
end;
$$;

-- Claims recipients for one event. Each (subscription, kind, ref) is returned at most once.
create function public.hypr_push_claim(p_chain_id bigint, p_token_address text, p_kind text, p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_kind not in ('live', 'show') or p_ref is null or char_length(p_ref) not between 1 and 100 then raise exception 'invalid push event'; end if;
  select room_id into v_room_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  with claimed as (
    insert into public.hypr_push_deliveries(subscription_id, kind, ref)
    select r.subscription_id, p_kind, p_ref from public.hypr_push_rooms r where r.room_id = v_room_id
    on conflict do nothing
    returning subscription_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb) into v_result
    from claimed c join public.hypr_push_subscriptions s on s.subscription_id = c.subscription_id;
  delete from public.hypr_push_deliveries where ctid in (select ctid from public.hypr_push_deliveries where sent_at < now() - interval '30 days' limit 500);
  return v_result;
end;
$$;

-- A push service said the endpoint is gone (404/410), or it failed repeatedly.
create function public.hypr_push_failed(p_endpoint text, p_gone boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_gone then delete from public.hypr_push_subscriptions where endpoint = p_endpoint;
  else
    update public.hypr_push_subscriptions set failures = failures + 1 where endpoint = p_endpoint;
    delete from public.hypr_push_subscriptions where endpoint = p_endpoint and failures >= 5;
  end if;
  return true;
end;
$$;

-- Shows starting within the next 15 minutes that have not been announced yet.
create function public.hypr_claim_show_reminders(p_chain_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  with due as (
    insert into public.hypr_show_reminders(show_id)
    select s.show_id from public.hypr_creator_shows s
      join public.hypr_rooms r on r.room_id = s.room_id join public.hypr_tokens t on t.token_id = r.token_id
    where t.chain_id = p_chain_id and s.status = 'scheduled' and s.starts_at between now() and now() + interval '15 minutes'
    on conflict do nothing
    returning show_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('showId', s.show_id, 'title', s.title, 'startsAt', s.starts_at, 'roomId', lower(t.address), 'name', coalesce(p.display_name, t.name))), '[]'::jsonb) into v_result
    from due d join public.hypr_creator_shows s on s.show_id = d.show_id
    join public.hypr_rooms r on r.room_id = s.room_id join public.hypr_tokens t on t.token_id = r.token_id
    left join public.hypr_creator_profiles p on p.room_id = s.room_id;
  return v_result;
end;
$$;

revoke all on function public.hypr_push_follow(bigint,text,text,text,text,boolean), public.hypr_push_claim(bigint,text,text,text), public.hypr_push_failed(text,boolean), public.hypr_claim_show_reminders(bigint) from public, anon, authenticated;
grant execute on function public.hypr_push_follow(bigint,text,text,text,text,boolean), public.hypr_push_claim(bigint,text,text,text), public.hypr_push_failed(text,boolean), public.hypr_claim_show_reminders(bigint) to service_role;
commit;
