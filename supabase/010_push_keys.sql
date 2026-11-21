-- =====================================================================================================
-- NURSE AT HOME · DATABASE, PART 10: PUSH KEYS KEPT IN THE DATABASE VAULT (version 1.9.1)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Needs parts 1 to 9 first.
--
-- The phone-notification keys are made by the "push-setup" server program and kept in Supabase Vault
-- (encrypted). Nobody has to copy a private key anywhere: the admin panel's "Make push keys" button
-- does everything. The "push" program reads the keys from here.
-- =====================================================================================================

-- For the server programs only (service key): the public and private push keys.
create or replace function public.push_keys() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'public', (select value ->> 'publicKey' from public.settings where key = 'push'),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key' limit 1)) $$;

-- For push-setup only: save a new key pair. Old phone addresses do not work with new keys, so they are removed
-- (each person turns notifications on again; the apps offer it).
create or replace function public.save_push_keys(p_public text, p_private text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if length(coalesce(p_public, '')) < 80 or length(coalesce(p_private, '')) < 40 then raise exception 'Bad keys'; end if;
  select id into sid from vault.secrets where name = 'vapid_private_key' limit 1;
  if sid is null then perform vault.create_secret(p_private, 'vapid_private_key', 'Web Push private key, made by push-setup');
  else perform vault.update_secret(sid, p_private); end if;
  insert into public.settings (key, value) values ('push', jsonb_build_object('publicKey', p_public))
    on conflict (key) do update set value = public.settings.value || jsonb_build_object('publicKey', p_public);
  delete from public.push_subscriptions where true; -- "where true": the API refuses a delete without a where
end $$;

-- For the admin panel: are the keys ready? (yes or no only)
create or replace function public.push_ready() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.secrets where name = 'vapid_private_key')
     and exists (select 1 from public.settings where key = 'push' and value ? 'publicKey') $$;

revoke execute on function public.push_keys(), public.save_push_keys(text, text) from public, anon, authenticated;
grant execute on function public.push_keys(), public.save_push_keys(text, text) to service_role;
revoke execute on function public.push_ready() from public, anon;
grant execute on function public.push_ready() to authenticated;

select 'Push keys can be made from the admin panel' as result;
