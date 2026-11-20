-- Emoji reactions on chat messages. One of each emoji per person per message
-- (wallet, guest or anonymous hashed tab key, like poll votes). Run after 0013.
begin;

create table public.hypr_message_reactions (
  message_id uuid not null references public.hypr_community_messages(message_id) on delete cascade,
  reactor_key text not null check (reactor_key ~ '^[a-f0-9]{64}$'),
  emoji text not null check (emoji in ('heart', 'fire', 'laugh', 'clap')),
  created_at timestamptz not null default now(),
  primary key (message_id, reactor_key, emoji)
);
create index hypr_message_reactions_message on public.hypr_message_reactions(message_id);
alter table public.hypr_message_reactions enable row level security;
revoke all on public.hypr_message_reactions from public, anon, authenticated;
grant all on public.hypr_message_reactions to service_role;

create function public.hypr_react(p_chain_id bigint, p_token_address text, p_message_id uuid, p_reactor_key text, p_emoji text, p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_room_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_reactor_key is null or p_reactor_key !~ '^[a-f0-9]{64}$' then raise exception 'invalid reactor'; end if;
  if p_emoji not in ('heart', 'fire', 'laugh', 'clap') then raise exception 'invalid emoji'; end if;
  select room_id into v_room_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if not exists(select 1 from public.hypr_community_messages where message_id = p_message_id and room_id = v_room_id and deleted_at is null) then raise exception 'message not found'; end if;
  if p_on then
    if (select count(*) from public.hypr_message_reactions where reactor_key = p_reactor_key and created_at > now() - interval '1 minute') >= 30 then raise exception 'reaction rate limit'; end if;
    insert into public.hypr_message_reactions(message_id, reactor_key, emoji) values(p_message_id, p_reactor_key, p_emoji) on conflict do nothing;
  else
    delete from public.hypr_message_reactions where message_id = p_message_id and reactor_key = p_reactor_key and emoji = p_emoji;
  end if;
  return p_on;
end;
$$;

-- Counts for the given messages, plus which ones this person added.
create function public.hypr_read_reactions(p_message_ids uuid[], p_reactor_key text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_message_ids is null or cardinality(p_message_ids) > 500 then raise exception 'invalid messages'; end if;
  select coalesce(jsonb_object_agg(message_id::text, counts), '{}'::jsonb) into v_result from (
    select message_id, jsonb_object_agg(emoji, jsonb_build_object('count', total, 'mine', mine)) as counts from (
      select message_id, emoji, count(*) as total, bool_or(reactor_key = p_reactor_key) as mine
      from public.hypr_message_reactions where message_id = any(p_message_ids) group by message_id, emoji
    ) grouped group by message_id
  ) per_message;
  return v_result;
end;
$$;

revoke all on function public.hypr_react(bigint,text,uuid,text,text,boolean), public.hypr_read_reactions(uuid[],text) from public, anon, authenticated;
grant execute on function public.hypr_react(bigint,text,uuid,text,text,boolean), public.hypr_read_reactions(uuid[],text) to service_role;
commit;
