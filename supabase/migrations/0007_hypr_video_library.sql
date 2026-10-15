-- Private, creator-controlled video storage. No LiveKit egress jobs or billing changes.
begin;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('hypr-replays', 'hypr-replays', false, 41943040, array['video/webm','video/mp4','audio/webm','audio/mp4']),
       ('hypr-clips', 'hypr-clips', false, 8388608, array['video/webm','video/mp4','audio/webm','audio/mp4']);

create table public.hypr_media_policy (
  room_id uuid not null references public.hypr_rooms(room_id),
  broadcast_id text not null check(length(broadcast_id) between 1 and 150),
  allow_clips boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(room_id, broadcast_id)
);
create table public.hypr_media_assets (
  asset_id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.hypr_rooms(room_id),
  wallet_id uuid not null references public.hypr_wallets(wallet_id),
  broadcast_id text not null,
  kind text not null check(kind in ('replay','clip')),
  title text not null check(length(title) between 1 and 80),
  mime text not null check(mime in ('video/webm','video/mp4','audio/webm','audio/mp4')),
  object_path text not null unique,
  status text not null default 'uploading' check(status in ('uploading','draft','published','hidden')),
  duration_seconds numeric not null default 0 check(duration_seconds between 0 and 601),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index hypr_media_room_time on public.hypr_media_assets(room_id, created_at desc);
alter table public.hypr_media_policy enable row level security;
alter table public.hypr_media_assets enable row level security;
revoke all on public.hypr_media_policy, public.hypr_media_assets from public, anon, authenticated;
grant all on public.hypr_media_policy, public.hypr_media_assets to service_role;

create function public.hypr_media(p_chain_id bigint, p_token_address text, p_wallet_address text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_room uuid; v_creator uuid; v_wallet uuid; v_owned boolean; v_asset public.hypr_media_assets;
  v_id uuid; v_kind text; v_mime text; v_bucket text; v_epoch text; v_limit bigint; v_used bigint; v_size bigint; v_type text; v_allowed boolean; v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  select r.room_id, t.deployer_wallet_id into v_room, v_creator from public.hypr_rooms r join public.hypr_tokens t on t.token_id=r.token_id
    where t.chain_id=p_chain_id and lower(t.address)=lower(p_token_address) and t.origin='hypr' and t.data_status<>'demo';
  if v_room is null then raise exception 'native indexed room required'; end if;
  if p_wallet_address is not null then
    select wallet_id into v_wallet from public.hypr_wallets where chain_id=p_chain_id and lower(address)=lower(p_wallet_address);
  end if;
  v_owned := coalesce(v_wallet=v_creator, false);
  v_epoch := nullif(p_data->>'broadcastId','');
  select coalesce(bool_or(allow_clips),false) into v_allowed from public.hypr_media_policy where room_id=v_room and broadcast_id=v_epoch;
  if p_action='list' then
    select coalesce(jsonb_agg(q order by q."createdAt" desc),'[]'::jsonb) into v_result from (
      select a.asset_id as id, a.kind, a.title, a.duration_seconds as "durationSeconds", a.created_at as "createdAt", a.status='published' as published,
        v_owned as manageable, coalesce(a.wallet_id=v_wallet,false) as own
      from public.hypr_media_assets a where a.room_id=v_room and a.status<>'uploading' and (
        v_owned or a.wallet_id=v_wallet or (a.status='published' and (a.kind='replay' or exists(select 1 from public.hypr_media_policy p where p.room_id=v_room and p.broadcast_id=a.broadcast_id and p.allow_clips)))
      ) order by a.created_at desc limit 50
    ) q;
    return jsonb_build_object('enabled',true,'creator',v_owned,'clipsAllowed',v_allowed,'assets',v_result);
  end if;
  if p_action='policy' then
    if not v_owned then raise exception 'creator required'; end if;
    if jsonb_typeof(p_data->'allowClips') is distinct from 'boolean' then raise exception 'invalid clipping permission'; end if;
    if (p_data->>'allowClips')::boolean then
      if v_epoch is null or length(v_epoch)>150 then raise exception 'live broadcast required'; end if;
      insert into public.hypr_media_policy(room_id,broadcast_id,allow_clips) values(v_room,v_epoch,true)
        on conflict(room_id,broadcast_id) do update set allow_clips=true,updated_at=now();
    else
      update public.hypr_media_policy set allow_clips=false,updated_at=now() where room_id=v_room;
    end if;
    return jsonb_build_object('saved',true);
  end if;
  if p_action<>'asset' and (p_wallet_address is null or lower(p_wallet_address)!~'^0x[0-9a-f]{40}$') then raise exception 'wallet required'; end if;
  if p_action='reserve' then
    v_kind:=p_data->>'kind'; v_mime:=p_data->>'mime';
    if v_kind not in ('replay','clip') or v_kind is null or v_mime not in ('video/webm','video/mp4','audio/webm','audio/mp4') or v_mime is null
      or length(trim(p_data->>'title')) not between 1 and 80 or p_data->>'title' is null then raise exception 'invalid recording'; end if;
    if v_epoch is null or length(v_epoch)>150 then raise exception 'live broadcast required'; end if;
    if v_kind='replay' and not v_owned then raise exception 'creator required'; end if;
    if v_kind='clip' and not v_allowed then raise exception 'creator has not enabled clipping'; end if;
    if p_data->'consent' is distinct from 'true'::jsonb then raise exception 'recording consent required'; end if;
    perform pg_advisory_xact_lock(hashtextextended('hypr-media-global-budget',0));
    v_wallet:=public.hypr_ensure_wallet(p_chain_id,p_wallet_address);
    if (select count(*) from public.hypr_media_assets where wallet_id=v_wallet and created_at>now()-interval '1 day')>=6
      or (select count(*) from public.hypr_media_assets where room_id=v_room and created_at>now()-interval '1 day')>=16
      then raise exception 'daily recording limit reached'; end if;
    if exists(select 1 from public.hypr_media_assets where room_id=v_room and wallet_id=v_wallet and status='uploading' and created_at>now()-interval '30 minutes') then raise exception 'finish the pending recording first'; end if;
    v_limit:=case when v_kind='replay' then 41943040 else 8388608 end;
    -- Count actual objects, including abandoned uploads. Unfinished reservations retain capacity until reconciled;
    -- do not assume an expired signing token also cancels an already-created resumable upload.
    select coalesce(sum((metadata->>'size')::bigint),0) into v_used from storage.objects where bucket_id in ('hypr-replays','hypr-clips');
    select v_used+coalesce(sum(case when a.kind='replay' then 41943040 else 8388608 end),0) into v_used from public.hypr_media_assets a
      where a.status='uploading' and not exists(select 1 from storage.objects o where o.name=a.object_path and o.bucket_id=case when a.kind='replay' then 'hypr-replays' else 'hypr-clips' end);
    if v_used+v_limit>268435456 then raise exception 'pilot video storage is full'; end if;
    v_id:=gen_random_uuid();
    insert into public.hypr_media_assets(asset_id,room_id,wallet_id,broadcast_id,kind,title,mime,object_path)
      values(v_id,v_room,v_wallet,v_epoch,v_kind,trim(p_data->>'title'),v_mime,lower(p_token_address)||'/'||v_id::text||case when v_mime like '%webm' then '.webm' else '.mp4' end) returning * into v_asset;
  else
    v_id:=(p_data->>'id')::uuid;
    select * into v_asset from public.hypr_media_assets where asset_id=v_id and room_id=v_room for update;
    if v_asset.asset_id is null then raise exception 'recording unavailable'; end if;
    if p_action='asset' then
      if not v_owned and v_asset.wallet_id is distinct from v_wallet and not (v_asset.status='published' and (v_asset.kind='replay' or exists(select 1 from public.hypr_media_policy where room_id=v_room and broadcast_id=v_asset.broadcast_id and allow_clips))) then raise exception 'recording unavailable'; end if;
      if v_asset.status='uploading' then raise exception 'recording not ready'; end if;
    elsif p_action='upload' then
      if v_asset.wallet_id is distinct from v_wallet or (v_asset.status='uploading' and v_asset.created_at<now()-interval '30 minutes') then raise exception 'upload unavailable'; end if;
    elsif p_action='complete' then
      if v_asset.wallet_id is distinct from v_wallet then raise exception 'owner required'; end if;
      if v_asset.status<>'uploading' then return jsonb_build_object('saved',true); end if;
      if v_asset.created_at<now()-interval '30 minutes' then raise exception 'upload expired'; end if;
      select (metadata->>'size')::bigint,metadata->>'mimetype' into v_size,v_type from storage.objects where name=v_asset.object_path and bucket_id=case when v_asset.kind='replay' then 'hypr-replays' else 'hypr-clips' end;
      if v_size is null or v_size<32 or v_size>(case when v_asset.kind='replay' then 41943040 else 8388608 end) or v_type is distinct from v_asset.mime then raise exception 'uploaded file verification failed'; end if;
      if coalesce((p_data->>'durationSeconds')::numeric,0) not between 0.2 and (case when v_asset.kind='replay' then 601 else 31 end) then raise exception 'invalid recording duration'; end if;
      update public.hypr_media_assets set status='draft',duration_seconds=(p_data->>'durationSeconds')::numeric,completed_at=now() where asset_id=v_id;
      return jsonb_build_object('saved',true);
    elsif p_action in ('publish','hide') then
      if not v_owned then raise exception 'creator required'; end if;
      if v_asset.status='uploading' then raise exception 'recording not ready'; end if;
      if p_action='publish' and v_asset.kind='clip' and not exists(select 1 from public.hypr_media_policy where room_id=v_room and broadcast_id=v_asset.broadcast_id and allow_clips) then raise exception 'clipping consent was withdrawn'; end if;
      update public.hypr_media_assets set status=case when p_action='publish' then 'published' else 'hidden' end where asset_id=v_id;
      return jsonb_build_object('saved',true);
    else raise exception 'invalid media action'; end if;
  end if;
  return jsonb_build_object('id',v_asset.asset_id,'kind',v_asset.kind,'title',v_asset.title,'mime',v_asset.mime,'path',v_asset.object_path,
    'bucket',case when v_asset.kind='replay' then 'hypr-replays' else 'hypr-clips' end,'published',v_asset.status='published','ready',v_asset.status<>'uploading',
    'uploaded',exists(select 1 from storage.objects where name=v_asset.object_path and bucket_id=case when v_asset.kind='replay' then 'hypr-replays' else 'hypr-clips' end),'durationSeconds',v_asset.duration_seconds);
end;
$$;
revoke all on function public.hypr_media(bigint,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.hypr_media(bigint,text,text,text,jsonb) to service_role;
commit;
