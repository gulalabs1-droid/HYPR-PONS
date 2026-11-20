-- Live polls: one open poll per room, created and closed by the room creator.
-- Anyone in the room can vote once (wallet, guest ID or an anonymous hashed
-- tab key). Votes are for fun and engagement, not governance. Run after 0009.
begin;

create table public.hypr_room_polls (
  poll_id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.hypr_rooms(room_id),
  question text not null check (char_length(question) between 3 and 120),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index hypr_one_open_poll on public.hypr_room_polls(room_id) where closed_at is null;
create index hypr_room_polls_recent on public.hypr_room_polls(room_id, created_at desc);
create table public.hypr_poll_votes (
  poll_id uuid not null references public.hypr_room_polls(poll_id) on delete cascade,
  voter_key text not null check (voter_key ~ '^[a-f0-9]{64}$'),
  option_index integer not null check (option_index between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (poll_id, voter_key)
);
alter table public.hypr_room_polls enable row level security;
alter table public.hypr_poll_votes enable row level security;
revoke all on public.hypr_room_polls, public.hypr_poll_votes from public, anon, authenticated;
grant all on public.hypr_room_polls, public.hypr_poll_votes to service_role;

create function public.hypr_write_poll(p_chain_id bigint, p_token_address text, p_wallet_address text, p_action text, p_question text default null, p_options jsonb default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_creator_wallet_id uuid; v_option jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select room_id, creator_wallet_id into v_room_id, v_creator_wallet_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  if v_creator_wallet_id is distinct from public.hypr_ensure_wallet(p_chain_id, p_wallet_address) then raise exception 'creator required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('poll:' || v_room_id::text, 0));
  if p_action = 'open' then
    if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 4 then raise exception 'invalid poll'; end if;
    for v_option in select * from jsonb_array_elements(p_options) loop
      if jsonb_typeof(v_option) <> 'string' or char_length(trim(v_option #>> '{}')) not between 1 and 40 then raise exception 'invalid poll'; end if;
    end loop;
    update public.hypr_room_polls set closed_at = now() where room_id = v_room_id and closed_at is null;
    insert into public.hypr_room_polls(room_id, question, options) values(v_room_id, trim(p_question), p_options);
  elsif p_action = 'close' then
    update public.hypr_room_polls set closed_at = now() where room_id = v_room_id and closed_at is null;
  else raise exception 'invalid action'; end if;
  return true;
end;
$$;

create function public.hypr_vote_poll(p_chain_id bigint, p_token_address text, p_poll_id uuid, p_voter_key text, p_option integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_options integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_voter_key is null or p_voter_key !~ '^[a-f0-9]{64}$' then raise exception 'invalid voter'; end if;
  select room_id into v_room_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  select jsonb_array_length(options) into v_options from public.hypr_room_polls where poll_id = p_poll_id and room_id = v_room_id and closed_at is null;
  if v_options is null then raise exception 'poll closed'; end if;
  if p_option is null or p_option < 0 or p_option >= v_options then raise exception 'invalid option'; end if;
  insert into public.hypr_poll_votes(poll_id, voter_key, option_index) values(p_poll_id, p_voter_key, p_option)
    on conflict (poll_id, voter_key) do update set option_index = excluded.option_index, created_at = now();
  return true;
end;
$$;

-- The open poll, or the most recent one closed within the last 10 minutes, with tallies.
create function public.hypr_read_poll(p_chain_id bigint, p_token_address text, p_voter_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_poll public.hypr_room_polls; v_counts jsonb; v_mine integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select room_id into v_room_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  select * into v_poll from public.hypr_room_polls where room_id = v_room_id and (closed_at is null or closed_at > now() - interval '10 minutes') order by created_at desc limit 1;
  if v_poll.poll_id is null then return null; end if;
  select coalesce(jsonb_agg(coalesce(c.votes, 0) order by i.idx), '[]'::jsonb) into v_counts
    from generate_series(0, jsonb_array_length(v_poll.options) - 1) as i(idx)
    left join (select option_index, count(*) as votes from public.hypr_poll_votes where poll_id = v_poll.poll_id group by option_index) c on c.option_index = i.idx;
  select option_index into v_mine from public.hypr_poll_votes where poll_id = v_poll.poll_id and voter_key = p_voter_key;
  return jsonb_build_object('id', v_poll.poll_id, 'question', v_poll.question, 'options', v_poll.options, 'counts', v_counts, 'open', v_poll.closed_at is null, 'mine', v_mine);
end;
$$;

revoke all on function public.hypr_write_poll(bigint,text,text,text,text,jsonb), public.hypr_vote_poll(bigint,text,uuid,text,integer), public.hypr_read_poll(bigint,text,text) from public, anon, authenticated;
grant execute on function public.hypr_write_poll(bigint,text,text,text,text,jsonb), public.hypr_vote_poll(bigint,text,uuid,text,integer), public.hypr_read_poll(bigint,text,text) to service_role;
commit;
