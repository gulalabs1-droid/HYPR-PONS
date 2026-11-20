-- Tips: a viewer sends test ETH directly from their wallet to the room
-- creator's wallet (HYPR never holds funds). After the server verifies the
-- onchain transfer, it is recorded once and announced in chat. Run after 0011.
begin;

create table public.hypr_tips (
  tx_hash text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  room_id uuid not null references public.hypr_rooms(room_id),
  from_wallet_id uuid not null references public.hypr_wallets(wallet_id),
  amount_wei numeric(78, 0) not null check (amount_wei > 0),
  created_at timestamptz not null default now()
);
create index hypr_tips_room_time on public.hypr_tips(room_id, created_at desc);
alter table public.hypr_tips enable row level security;
revoke all on public.hypr_tips from public, anon, authenticated;
grant all on public.hypr_tips to service_role;

-- Callers must verify the receipt first (sender, creator recipient, amount, success).
create function public.hypr_record_tip(p_chain_id bigint, p_token_address text, p_tx_hash text, p_from text, p_amount_wei numeric, p_announcement text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_room_id uuid; v_wallet_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_tx_hash is null or lower(p_tx_hash) !~ '^0x[0-9a-f]{64}$' then raise exception 'invalid transaction'; end if;
  if p_amount_wei is null or p_amount_wei <= 0 then raise exception 'invalid amount'; end if;
  if p_announcement is null or char_length(p_announcement) not between 1 and 280 then raise exception 'invalid message'; end if;
  select room_id into v_room_id from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then raise exception 'indexed room missing'; end if;
  v_wallet_id := public.hypr_ensure_wallet(p_chain_id, p_from);
  insert into public.hypr_tips(tx_hash, room_id, from_wallet_id, amount_wei) values(lower(p_tx_hash), v_room_id, v_wallet_id, p_amount_wei)
    on conflict (tx_hash) do nothing;
  if not found then return false; end if;
  insert into public.hypr_community_messages(room_id, wallet_id, body) values(v_room_id, v_wallet_id, p_announcement);
  return true;
end;
$$;

revoke all on function public.hypr_record_tip(bigint,text,text,text,numeric,text) from public, anon, authenticated;
grant execute on function public.hypr_record_tip(bigint,text,text,text,numeric,text) to service_role;
commit;
