-- HYPR Pulse, step one: public, aggregate engagement numbers for a room.
-- Only community signals count. Coin price, trading volume and holdings are
-- deliberately excluded, so a room whose coin falls can still show a strong Pulse.
-- Manipulation limits:
--   * followers are signed-in members only (guest follows stay in the browser);
--   * the creator's own wallet never counts;
--   * removed (moderated) messages never count;
--   * "regulars" must chat on two or more different days, so spam bursts don't count.
-- Returns aggregates only, never who. Run after 0015.
begin;

create function public.hypr_room_pulse(p_chain_id bigint, p_token_address text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_room_id uuid; v_creator uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select room_id, creator_wallet_id into v_room_id, v_creator from public.hypr_room_for_token(p_chain_id, p_token_address);
  if v_room_id is null then return null; end if;
  return jsonb_build_object(
    'followers', (select count(*) from public.hypr_community_follows where room_id = v_room_id and wallet_id is distinct from v_creator),
    'newFollowers30d', (select count(*) from public.hypr_community_follows where room_id = v_room_id and wallet_id is distinct from v_creator and created_at > now() - interval '30 days'),
    'chatters30d', (select count(distinct coalesce(wallet_id::text, 'g:' || guest_id::text)) from public.hypr_community_messages
      where room_id = v_room_id and deleted_at is null and created_at > now() - interval '30 days' and wallet_id is distinct from v_creator),
    'regulars30d', (select count(*) from (
      select coalesce(wallet_id::text, 'g:' || guest_id::text) from public.hypr_community_messages
      where room_id = v_room_id and deleted_at is null and created_at > now() - interval '30 days' and wallet_id is distinct from v_creator
      group by 1 having count(distinct created_at::date) >= 2) regulars),
    'shows30d', (select count(*) from public.hypr_broadcast_peaks where room_id = v_room_id and started_at > now() - interval '30 days'),
    'lastShowAt', (select max(started_at) from public.hypr_broadcast_peaks where room_id = v_room_id),
    'checkedAt', now());
end;
$$;

revoke all on function public.hypr_room_pulse(bigint,text) from public, anon, authenticated;
grant execute on function public.hypr_room_pulse(bigint,text) to service_role;
commit;
