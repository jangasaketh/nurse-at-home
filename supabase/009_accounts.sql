-- =====================================================================================================
-- NURSE AT HOME · DATABASE, PART 9: ACCOUNTS AND SAFETY (version 1.9.0)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Needs parts 1 to 8 first.
--
--   1. Two-step sign-in for the team: once a team member has set up an authenticator app, the team pages
--      only open after the 6-digit code (the database checks it, not just the screen).
--   2. Family members and addresses that have past visits are hidden instead of deleted (the visit
--      history and payments stay correct).
--   3. "Delete my account" for patients and caregivers: personal details are removed, the phone number
--      is freed, and only what the law requires for payments is kept, without the name.
--   4. Phone notifications are handed to the "push" server program by the database itself.
--   5. Safety tidy-up: trigger functions cannot be called directly; fixed search paths.
-- =====================================================================================================

-- 1. Team pages need the second step once it is set up -------------------------------------------------
create or replace function public.is_admin(roles text[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid() and active and (roles is null or role = 'owner' or role = any(roles))
  ) and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
  ) $$;

-- 2. Hide instead of delete ----------------------------------------------------------------------------
alter table public.patient_people add column if not exists hidden boolean not null default false;
alter table public.addresses add column if not exists hidden boolean not null default false;

-- Remove family members and addresses: deleted when never used for a visit, otherwise hidden.
create or replace function public.forget_family(p_people uuid[] default '{}', p_places uuid[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from public.bookings where account_id = me and person_id = any(p_people)
      and status in ('requested', 'accepted', 'en_route', 'arrived', 'in_progress')) then
    raise exception 'This person has a visit that is not finished';
  end if;
  update public.patient_people p set hidden = true
    where p.account_id = me and p.id = any(p_people) and exists (select 1 from public.bookings b where b.person_id = p.id);
  delete from public.patient_people p
    where p.account_id = me and p.id = any(p_people) and not exists (select 1 from public.bookings b where b.person_id = p.id);
  update public.addresses a set hidden = true
    where a.account_id = me and a.id = any(p_places) and exists (select 1 from public.bookings b where b.address_id = a.id);
  delete from public.addresses a
    where a.account_id = me and a.id = any(p_places) and not exists (select 1 from public.bookings b where b.address_id = a.id);
end $$;

-- 3. Delete my account -----------------------------------------------------------------------------------
-- What stops an account from being deleted right now (null when it can be deleted).
create or replace function public.account_blocker() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  owed int;
begin
  if me is null then return 'Sign in first'; end if;
  if exists (select 1 from public.admin_users where id = me) then return 'Team accounts are removed by an owner'; end if;
  if exists (select 1 from public.bookings where (account_id = me or caregiver_id = me)
      and status in ('requested', 'accepted', 'en_route', 'arrived', 'in_progress')) then
    return 'Finish or cancel your open visits first';
  end if;
  if exists (select 1 from public.caregivers where id = me) then
    owed := coalesce((select sum(amount - cash) from public.earnings where caregiver_id = me), 0)
          - coalesce((select sum(amount) from public.payouts where caregiver_id = me and paid_at is not null), 0);
    if owed > 0 then return 'Your last payout is still due. Ask support to send it first'; end if;
    if owed < 0 then return 'Cash you collected is still owed to us. Ask support to settle it first'; end if;
  end if;
  return null;
end $$;

-- The phone deletes its own files first (photos, documents), then calls this.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  why text := public.account_blocker();
  was_caregiver boolean;
begin
  if why is not null then raise exception '%', why; end if;
  was_caregiver := exists (select 1 from public.caregivers where id = me);
  -- The caregiver guard (004_bookings.sql) lets trusted functions change these fields for this moment only.
  perform set_config('nah.trusted', 'on', true);

  delete from public.push_subscriptions where user_id = me;
  delete from public.emergency_contacts where account_id = me;
  -- Family and addresses: removed; those on past visits keep only an anonymous row.
  update public.patient_people set name = 'Deleted', age = null, gender = null, hidden = true
    where account_id = me and id in (select person_id from public.bookings where account_id = me);
  delete from public.patient_people where account_id = me and id not in (select person_id from public.bookings where account_id = me);
  delete from public.addresses where account_id = me;
  update public.bookings set address_text = '', note = '', cg_lat = null, cg_lng = null where account_id = me;
  -- Caregiver: documents, bank and qualification removed; account closed.
  if was_caregiver then
    delete from public.kyc_documents where caregiver_id = me;
    delete from public.caregiver_bank where caregiver_id = me;
    delete from public.caregiver_qualifications where caregiver_id = me;
    update public.caregivers set online = false, suspended_at = now(), suspended_reason = 'Account deleted by the caregiver',
      dob = null, area = null, pincode = null where id = me;
  end if;
  update public.profiles set full_name = 'Deleted account', phone = null, email = null where id = me;
  -- The sign-in itself: phone freed (the same number can sign up again as a new account), sessions ended.
  update auth.users set phone = null, phone_confirmed_at = null, email = null, raw_user_meta_data = '{}'::jsonb,
    banned_until = 'infinity' where id = me;
  delete from auth.sessions where user_id = me;
  insert into public.audit_log (actor, page, action, subject_id, detail)
    values (null, case when was_caregiver then 'caregivers' else 'patients' end, 'account_deleted', me, '{}'::jsonb);
end $$;

-- 4. Phone notifications without a dashboard webhook ------------------------------------------------------
-- Each new notification is handed to the "push" server program (replaces the Database Webhook step).
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then raise notice 'pg_net is not available here: phone notifications need it';
end $$;
create or replace function public.notifications_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://hglhijvvbbmmsjoakvfz.supabase.co/functions/v1/push',
    body := jsonb_build_object('type', 'INSERT', 'table', 'notifications', 'record', jsonb_build_object('id', new.id)),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000);
  return new;
exception when others then
  return new; -- a push failure must never stop the notification itself
end $$;
revoke execute on function public.notifications_push() from public, anon, authenticated;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.notifications_push();

-- 5. Safety tidy-up --------------------------------------------------------------------------------------
-- Trigger functions run by themselves; nobody needs to call them directly.
revoke execute on function public.bookings_payment(), public.bookings_prepare(), public.caregivers_guard(),
  public.forget_location(), public.handle_new_user() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_proc where proname = 'touch_updated_at' and pronamespace = 'public'::regnamespace) then
    execute 'revoke execute on function public.touch_updated_at() from public, anon, authenticated';
  end if;
end $$;

-- Fixed search paths (the database linter's advice).
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;

revoke execute on function public.forget_family(uuid[], uuid[]), public.account_blocker(), public.delete_my_account() from public, anon;
grant execute on function public.forget_family(uuid[], uuid[]), public.account_blocker(), public.delete_my_account() to authenticated;

select 'Account functions are ready' as result;
