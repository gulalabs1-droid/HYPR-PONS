-- Test fixtures, policies, object metadata and wallet writes are all rolled back.
begin;
set local request.jwt.claim.role='service_role';
do $$
declare
  token text:='0xea3b5d2cf6eacd3dd6241736082b7698e519a675'; creator text; room uuid;
  viewer text:='0x0000000000000000000000000000000000000009'; result jsonb; asset uuid; path text;
begin
  select lower(w.address),r.room_id into creator,room from public.hypr_rooms r join public.hypr_tokens t on t.token_id=r.token_id join public.hypr_wallets w on w.wallet_id=t.deployer_wallet_id where t.chain_id=46630 and lower(t.address)=token;
  if creator is null then raise exception 'canonical native room missing'; end if;
  if has_function_privilege('anon','public.hypr_media(bigint,text,text,text,jsonb)','execute') then raise exception 'anonymous RPC execution allowed'; end if;
  if exists(select 1 from storage.buckets where id in ('hypr-clips','hypr-replays') and public) then raise exception 'media bucket is public'; end if;
  begin
    perform public.hypr_media(46630,token,viewer,'policy','{"broadcastId":"synthetic-rollback-only","allowClips":true}');
    raise exception 'viewer changed creator permissions';
  exception when others then if sqlerrm<>'creator required' then raise; end if; end;
  begin
    perform public.hypr_media(46630,token,viewer,'reserve','{"broadcastId":"synthetic-rollback-only","kind":"clip","mime":"video/webm","title":"Permission check","consent":true}');
    raise exception 'clip recorded without creator permission';
  exception when others then if sqlerrm<>'creator has not enabled clipping' then raise; end if; end;
  perform public.hypr_media(46630,token,creator,'policy','{"broadcastId":"synthetic-rollback-only","allowClips":true}');
  result:=public.hypr_media(46630,token,viewer,'reserve','{"broadcastId":"synthetic-rollback-only","kind":"clip","mime":"video/webm","title":"Rollback fixture only","consent":true}');
  asset:=(result->>'id')::uuid; path:=result->>'path';
  if position(asset::text in path)=0 or result->>'bucket'<>'hypr-clips' then raise exception 'unscoped object path'; end if;
  begin
    perform public.hypr_media(46630,token,viewer,'complete',jsonb_build_object('id',asset,'durationSeconds',2));
    raise exception 'missing storage object accepted';
  exception when others then if sqlerrm<>'uploaded file verification failed' then raise; end if; end;
  -- Transaction-local metadata only: no bytes are uploaded or made public by this test.
  insert into storage.objects(bucket_id,name,metadata) values('hypr-clips',path,'{"size":4096,"mimetype":"video/webm"}');
  perform public.hypr_media(46630,token,viewer,'complete',jsonb_build_object('id',asset,'durationSeconds',2));
  begin
    perform public.hypr_media(46630,token,null,'asset',jsonb_build_object('id',asset));
    raise exception 'private draft leaked';
  exception when others then if sqlerrm<>'recording unavailable' then raise; end if; end;
  begin
    perform public.hypr_media(46630,token,viewer,'publish',jsonb_build_object('id',asset));
    raise exception 'viewer published without review';
  exception when others then if sqlerrm<>'creator required' then raise; end if; end;
  perform public.hypr_media(46630,token,creator,'publish',jsonb_build_object('id',asset));
  result:=public.hypr_media(46630,token,null,'asset',jsonb_build_object('id',asset));
  if result->'published'<>'true'::jsonb then raise exception 'published playback unavailable'; end if;
  result:=public.hypr_media(46630,token,viewer,'upload',jsonb_build_object('id',asset));
  if result->'ready'<>'true'::jsonb then raise exception 'completed upload retry not idempotent'; end if;
  perform public.hypr_media(46630,token,creator,'policy','{"allowClips":false}');
  begin
    perform public.hypr_media(46630,token,null,'asset',jsonb_build_object('id',asset));
    raise exception 'withdrawn clipping consent ignored';
  exception when others then if sqlerrm<>'recording unavailable' then raise; end if; end;
  result:=public.hypr_media(46630,token,creator,'list','{}');
  if position(path in result::text)>0 then raise exception 'private object path leaked into directory'; end if;
end;
$$;
rollback;
