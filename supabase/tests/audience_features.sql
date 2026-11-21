-- Run after migrations 0008–0015 in a disposable database, or inside a
-- rollback-only migration rehearsal. Every diagnostic record is rolled back.
begin;

do $hypr_check$
declare
  creator text := '0x' || substr(md5(random()::text) || md5(random()::text), 1, 40);
  room text := '0x' || substr(md5(random()::text) || md5(random()::text), 1, 40);
  member text := '0x' || substr(md5(random()::text) || md5(random()::text), 1, 40);
  feed jsonb;
  poll jsonb;
  message_id uuid;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  if auth.role() is distinct from 'service_role' then raise exception 'service role test setup failed'; end if;
  if has_function_privilege('anon', 'public.hypr_create_coinless_room(bigint,text,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.hypr_create_coinless_room(bigint,text,text,text)', 'execute')
    then raise exception 'room function privileges incorrect'; end if;

  perform public.hypr_create_coinless_room(46630, creator, room, 'HYPR Diagnostic Room');
  perform public.hypr_write_guest_message(46630, room, gen_random_uuid(), 'HYPRcheck', 'Temporary diagnostic message', repeat('a', 64));
  feed := public.hypr_read_community_feed(46630, room, null, null, 50);
  select (value->>'id')::uuid into message_id from jsonb_array_elements(feed->'messages')
    where value->>'body' = 'Temporary diagnostic message' limit 1;
  if message_id is null then raise exception 'guest message not returned'; end if;
  perform public.hypr_react(46630, room, message_id, repeat('b', 64), 'heart', true);
  if public.hypr_read_reactions(array[message_id], repeat('b', 64))->(message_id::text)->'heart'->>'count' <> '1'
    then raise exception 'reaction failed'; end if;
  perform public.hypr_write_poll(46630, room, creator, 'open', 'Ready to watch?', '["Yes","No"]'::jsonb);
  poll := public.hypr_read_poll(46630, room, repeat('b', 64));
  if poll->>'question' <> 'Ready to watch?' then raise exception 'poll failed'; end if;
  perform public.hypr_vote_poll(46630, room, (poll->>'id')::uuid, repeat('b', 64), 0);

  -- PostgreSQL rejects regex repetition bounds above 255 at insertion time.
  -- Exercise both a typical and a maximum-length ID against the real table.
  perform public.hypr_passkey_register(46630, member, 'HYPRcheck', repeat('a', 24), repeat('b', 80), 0, array[]::text[]);
  if public.hypr_passkey_lookup(repeat('a', 24))->>'memberAddress' <> member then raise exception 'passkey storage failed'; end if;
  update public.hypr_passkey_credentials set credential_id = repeat('a', 1400) where credential_id = repeat('a', 24);
  begin
    update public.hypr_passkey_credentials set credential_id = repeat('a', 1401) where credential_id = repeat('a', 1400);
    raise exception 'overlong credential ID accepted';
  exception when check_violation then null;
  end;
  begin
    update public.hypr_passkey_credentials set credential_id = repeat('a', 16) || '!' where credential_id = repeat('a', 1400);
    raise exception 'invalid credential ID accepted';
  exception when check_violation then null;
  end;
end
$hypr_check$;

rollback;
