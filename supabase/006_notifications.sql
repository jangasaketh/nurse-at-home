-- =====================================================================================================
-- NURSE AT HOME · DATABASE, PART 6: NOTIFICATIONS ON THE PHONE (version 1.6.0)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Needs parts 1 to 5 first.
--
-- Every notification the apps already show (new request, accepted, on the way, arrived, visit record,
-- cancelled, payout, verification decisions...) can also ring the phone, even when the app is closed:
--   1. The phone says yes to notifications; its "push address" is saved here (push_subscriptions).
--   2. A new row in notifications calls the "push" Edge Function (a Database Webhook you add once in the
--      dashboard, see supabase/README.md), which sends it to each of that person's phones.
-- The message is sent as a key and values, and the phone shows it in its own language.
-- =====================================================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app text not null check (app in ('patient', 'caregiver')),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  lang text not null default 'en',
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push addresses" on public.push_subscriptions;
create policy "own push addresses" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Each notification is sent to the phone once.
alter table public.notifications add column if not exists pushed_at timestamptz;

-- The public half of the push key (the private half is a secret of the push Edge Function).
insert into public.settings (key, value) values ('push', '{"publicKey": ""}') on conflict (key) do nothing;

-- For the push Edge Function only: take a notification to send (once), with the person's phones.
create or replace function public.push_take(p_notification uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n public.notifications%rowtype;
begin
  update public.notifications set pushed_at = now()
    where id = p_notification and pushed_at is null and created_at > now() - interval '30 minutes'
    returning * into n;
  if not found then return null; end if;
  return jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'target', n.target,
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'app', s.app, 'endpoint', s.endpoint, 'p256dh', s.p256dh,
      'auth', s.auth, 'lang', coalesce((select lang from public.profiles where id = s.user_id), s.lang)))
      from public.push_subscriptions s where s.user_id = n.user_id), '[]'::jsonb));
end $$;

create or replace function public.push_done(p_ok uuid[], p_gone uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.push_subscriptions set last_ok_at = now() where id = any(p_ok);
  delete from public.push_subscriptions where id = any(p_gone);
$$;

revoke execute on function public.push_take(uuid), public.push_done(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.push_take(uuid), public.push_done(uuid[], uuid[]) to service_role;

select 'Notification tables are ready' as result;
