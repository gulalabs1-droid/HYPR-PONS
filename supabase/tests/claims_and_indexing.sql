-- Runtime regression only. All generated records are rolled back.
-- This is database behavior evidence, never launch or transaction evidence.
begin;

do $test$
declare
  v_token text := '0x' || replace(gen_random_uuid()::text, '-', '') || '00000000';
  v_creator text := '0x' || replace(gen_random_uuid()::text, '-', '') || '00000000';
  v_tx text := '0x' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_claim uuid := gen_random_uuid();
  v_nonce text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_tokens jsonb;
  v_events jsonb;
  v_cursor bigint;
  v_status text;
  v_count bigint;
  v_denied boolean := false;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_tokens := jsonb_build_array(jsonb_build_object(
    'address', v_token, 'origin', 'hypr', 'dataStatus', 'partial',
    'name', 'Rollback regression', 'symbol', 'TEST', 'deployer', v_creator
  ));
  v_events := jsonb_build_array(jsonb_build_object(
    'transactionHash', v_tx, 'logIndex', 0, 'blockNumber', 1,
    'eventType', 'RegressionOnly', 'tokenAddress', v_token, 'payload', '{}'::jsonb
  ));

  perform public.hypr_apply_index_batch('rollback-regression', 46630, 0, 1, v_tokens, v_events);
  perform public.hypr_apply_index_batch('rollback-regression', 46630, 0, 1, v_tokens, v_events);
  select count(*) into v_count from public.hypr_tokens where address = v_token;
  assert v_count = 1, 'token replay must deduplicate';
  select count(*) into v_count from public.hypr_token_events where transaction_hash = v_tx;
  assert v_count = 1, 'event replay must deduplicate';
  select cursor_block into v_cursor from public.hypr_indexing_state where source = 'rollback-regression' and chain_id = 46630;
  assert v_cursor = 1, 'checkpoint must match the batch';

  perform public.hypr_create_room_claim(
    v_claim, 46630, v_token, v_creator, v_creator, v_nonce,
    repeat('Regression authorization ', 4), now() + interval '5 minutes'
  );
  select status into v_status from public.hypr_get_room_claim(v_nonce);
  assert v_status = 'pending', 'claim must be persisted';
  -- SQL finalization is called only after the Node signature verifier in the app.
  -- Here a shape-valid placeholder tests the atomic SQL transition alone.
  perform public.hypr_finalize_room_claim(v_claim, '0x' || repeat('11', 65), now());
  select status into v_status from public.hypr_get_room_claim(v_nonce);
  assert v_status = 'verified', 'claim must be finalized';
  begin
    perform public.hypr_finalize_room_claim(v_claim, '0x' || repeat('11', 65), now());
  exception when others then
    if sqlerrm not like '%already consumed%' then raise; end if;
    v_denied := true;
  end;
  assert v_denied, 'claim replay must be rejected';

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_denied := false;
  begin
    perform public.hypr_ensure_wallet(46630, v_creator);
  exception when others then
    if sqlerrm <> 'service role required' then raise; end if;
    v_denied := true;
  end;
  assert v_denied, 'anonymous write must be rejected';
end;
$test$;

rollback;

select 'PASS: replay, checkpoint, durable claim, claim replay, role guard; test rows rolled back' as regression_result;
