-- Run after 0006. All fixtures/edits are transaction-local and rolled back.
begin;
set local request.jwt.claim.role = 'service_role';
do $$
declare
  token text := '0xea3b5d2cf6eacd3dd6241736082b7698e519a675';
  creator text; other text := '0x0000000000000000000000000000000000000008';
  room uuid; msg uuid; show uuid := gen_random_uuid(); state jsonb;
begin
  select lower(w.address), r.room_id into creator, room from public.hypr_rooms r join public.hypr_tokens t on t.token_id=r.token_id join public.hypr_wallets w on w.wallet_id=t.deployer_wallet_id where t.chain_id=46630 and lower(t.address)=token;
  if creator is null then raise exception 'canonical testnet fixture missing'; end if;
  perform public.hypr_ensure_wallet(46630, other);
  perform public.hypr_write_community(46630, token, other, 'message', 'Older line');
  perform public.hypr_write_community(46630, token, other, 'message', 'Newer line');
  select message_id into msg from public.hypr_community_messages where room_id=room order by created_at desc limit 1;
  perform public.hypr_write_community(46630, token, creator, 'pin', null, null, msg);
  state := public.hypr_read_community_feed(46630, token, creator, null);
  if state->'pinned'->>'body' <> 'Newer line' then raise exception 'pin missing'; end if;
  begin
    perform public.hypr_write_community(46630, token, other, 'pin', null, null, msg);
    raise exception 'viewer pin allowed';
  exception when others then if sqlerrm <> 'creator required' then raise; end if;
  end;
  perform public.hypr_write_growth(46630, token, other, 'report', jsonb_build_object('messageId', null, 'reason', 'unsafe', 'details', 'Room-level operator check'));
  if not exists(select 1 from public.hypr_community_reports where room_id=room and operator_inbox) then raise exception 'room report not flagged for operators'; end if;
  begin
    perform public.hypr_read_operator_reports(46630, false);
    raise exception 'operator flag ignored';
  exception when others then if sqlerrm <> 'operator required' then raise; end if;
  end;
  state := public.hypr_read_operator_reports(46630, true);
  if jsonb_typeof(state) <> 'array' or jsonb_array_length(state) < 1 then raise exception 'operator inbox empty'; end if;
  perform public.hypr_write_growth(46630, token, creator, 'schedule', jsonb_build_object('id', show, 'revision', 0, 'title', 'Show window', 'description', '', 'startsAt', now()+interval '1 hour'));
  state := public.hypr_growth_metrics(46630, token, creator, false);
  if jsonb_typeof(state->'shows') <> 'array' then raise exception 'shows missing'; end if;
  if state->>'averageWatchDuration' is not null then raise exception 'invented duration'; end if;
end;
$$;
rollback;
