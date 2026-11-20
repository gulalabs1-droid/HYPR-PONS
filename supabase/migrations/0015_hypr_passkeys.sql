-- Passkey accounts for viewers without a wallet (Face ID, Touch ID, Windows
-- Hello, security keys). Each account gets a random ID in address format
-- ("member address") so chat, follows, polls and reactions work unchanged.
-- It is not a blockchain wallet: it cannot sign transactions, create coins,
-- open rooms or broadcast. Run after 0014.
begin;

create table public.hypr_passkey_accounts (
  account_id uuid primary key default gen_random_uuid(),
  member_address text not null unique check (member_address ~ '^0x[0-9a-f]{40}$'),
  display_name text not null check (display_name ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,23}$'),
  created_at timestamptz not null default now()
);
create table public.hypr_passkey_credentials (
  credential_id text primary key check (credential_id ~ '^[A-Za-z0-9_-]{16,1400}$'),
  account_id uuid not null references public.hypr_passkey_accounts(account_id) on delete cascade,
  public_key text not null check (char_length(public_key) between 40 and 2000),
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index hypr_passkey_credentials_account on public.hypr_passkey_credentials(account_id);
alter table public.hypr_passkey_accounts enable row level security;
alter table public.hypr_passkey_credentials enable row level security;
revoke all on public.hypr_passkey_accounts, public.hypr_passkey_credentials from public, anon, authenticated;
grant all on public.hypr_passkey_accounts, public.hypr_passkey_credentials to service_role;

-- Called only after the server verified the WebAuthn registration.
create function public.hypr_passkey_register(p_chain_id bigint, p_member_address text, p_display_name text, p_credential_id text, p_public_key text, p_counter bigint, p_transports text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_account uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  insert into public.hypr_passkey_accounts(member_address, display_name) values(lower(p_member_address), trim(p_display_name)) returning account_id into v_account;
  insert into public.hypr_passkey_credentials(credential_id, account_id, public_key, counter, transports) values(p_credential_id, v_account, p_public_key, greatest(p_counter, 0), coalesce(p_transports, '{}'));
  perform public.hypr_ensure_wallet(p_chain_id, lower(p_member_address));
  return jsonb_build_object('memberAddress', lower(p_member_address), 'name', trim(p_display_name));
end;
$$;

create function public.hypr_passkey_lookup(p_credential_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('memberAddress', a.member_address, 'name', a.display_name, 'publicKey', c.public_key, 'counter', c.counter, 'transports', c.transports)
  from public.hypr_passkey_credentials c join public.hypr_passkey_accounts a on a.account_id = c.account_id
  where c.credential_id = p_credential_id;
$$;

-- Signature counters must not go backwards (cloned-authenticator check); synced passkeys report 0.
create function public.hypr_passkey_used(p_credential_id text, p_counter bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  update public.hypr_passkey_credentials set counter = greatest(counter, p_counter), last_used_at = now() where credential_id = p_credential_id;
  return found;
end;
$$;

-- Display names for member addresses that appear in chat.
create function public.hypr_member_names(p_addresses text[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(member_address, display_name), '{}'::jsonb) from public.hypr_passkey_accounts
  where member_address = any(select lower(value) from unnest(coalesce(p_addresses, '{}')) as value limit 500);
$$;

revoke all on function public.hypr_passkey_register(bigint,text,text,text,text,bigint,text[]), public.hypr_passkey_lookup(text), public.hypr_passkey_used(text,bigint), public.hypr_member_names(text[]) from public, anon, authenticated;
grant execute on function public.hypr_passkey_register(bigint,text,text,text,text,bigint,text[]), public.hypr_passkey_lookup(text), public.hypr_passkey_used(text,bigint), public.hypr_member_names(text[]) to service_role;
commit;
