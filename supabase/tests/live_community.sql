-- Integration assertions create only transaction-local test rows; all are rolled back.
begin;
set local request.jwt.claim.role = 'service_role';
do $$
declare
  v_token text := '0xea3b5d2cf6eacd3dd6241736082b7698e519a675';
  v_wallet text := '0x0000000000000000000000000000000000000001';
  v_other text := '0x0000000000000000000000000000000000000002';
  v_nonce uuid := gen_random_uuid();
  v_state jsonb;
  v_id uuid;
  v_before bigint;
  v_limited boolean := false;
  v_denied boolean := false;
begin
  if not public.hypr_consume_community_nonce(v_nonce) then raise exception 'first nonce failed'; end if;
  if public.hypr_consume_community_nonce(v_nonce) then raise exception 'nonce replay allowed'; end if;
  v_state := public.hypr_read_community(46630, v_token, v_wallet);
  v_before := (v_state->>'followers')::bigint;
  perform public.hypr_write_community(46630, v_token, v_wallet, 'follow', null, true);
  perform public.hypr_write_community(46630, v_token, v_wallet, 'follow', null, true);
  v_state := public.hypr_read_community(46630, v_token, v_wallet);
  if not (v_state->>'following')::boolean or (v_state->>'followers')::bigint <> v_before + 1 then raise exception 'follow not idempotent'; end if;
  perform public.hypr_write_community(46630, v_token, v_wallet, 'message', 'HYPR transaction-local integration check');
  begin
    perform public.hypr_write_community(46630, v_token, v_wallet, 'message', 'Must be rate limited');
  exception when others then v_limited := sqlerrm = 'message rate limit'; end;
  if not v_limited then raise exception 'message rate limit failed'; end if;
  v_state := public.hypr_read_community(46630, v_token, v_other);
  select (value->>'id')::uuid into v_id from jsonb_array_elements(v_state->'messages') where value->>'body' = 'HYPR transaction-local integration check';
  if v_id is null then raise exception 'message not shared'; end if;
  begin
    perform public.hypr_write_community(46630, v_token, v_other, 'hide', null, null, v_id);
  exception when others then v_denied := sqlerrm = 'message not found or not authorized'; end;
  if not v_denied then raise exception 'foreign wallet could hide message'; end if;
  perform public.hypr_write_community(46630, v_token, v_wallet, 'hide', null, null, v_id);
  v_state := public.hypr_read_community(46630, v_token, v_other);
  if exists(select 1 from jsonb_array_elements(v_state->'messages') where value->>'id' = v_id::text) then raise exception 'hidden message still public'; end if;
  perform public.hypr_write_community(46630, v_token, v_wallet, 'follow', null, false);
  if (public.hypr_read_community(46630, v_token, v_wallet)->>'followers')::bigint <> v_before then raise exception 'unfollow failed'; end if;
  if has_function_privilege('anon', 'public.hypr_write_community(bigint,text,text,text,text,boolean,uuid)', 'EXECUTE') then raise exception 'anonymous write granted'; end if;
  if has_table_privilege('anon', 'public.hypr_community_messages', 'SELECT') then raise exception 'anonymous database access granted'; end if;
end;
$$;
select 'PASS: shared reads, idempotent follows, rate limits, owner moderation, nonce replay and server-only access' as result;
rollback;
