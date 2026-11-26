-- =====================================================================================================
-- NURSE AT HOME · DATABASE, PART 13: SOS RINGS THE TEAM'S PHONES (version 2.2.0)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Needs parts 1 to 12 first.
--
-- Until now an SOS only reached the admin Support page. Now every owner and support team member who turned on
-- "SOS alerts on this phone" (admin panel → Your sign-in) gets a phone notification at once, with the place
-- and phone number. It keeps ringing until it is looked at.
-- =====================================================================================================

-- Team members' phones can hold a push address too.
alter table public.push_subscriptions drop constraint if exists push_subscriptions_app_check;
alter table public.push_subscriptions add constraint push_subscriptions_app_check check (app in ('patient', 'caregiver', 'admin'));

-- A new SOS → one notification per active owner and support team member (the push program sends it).
create or replace function public.sos_ring_team() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.urgent and new.topic = 'SOS' then
    insert into public.notifications (user_id, kind, title, body, target)
    select a.id, 'sos',
      to_jsonb('SOS from a ' || new.from_kind || ' · ' || new.code),
      to_jsonb(left(new.message, 300)),
      'support'
    from public.admin_users a
    where a.active and a.role in ('owner', 'support');
  end if;
  return new;
end $$;
drop trigger if exists support_tickets_sos_ring on public.support_tickets;
create trigger support_tickets_sos_ring after insert on public.support_tickets
  for each row execute function public.sos_ring_team();
revoke execute on function public.sos_ring_team() from public, anon, authenticated;

-- For the admin go-live checklist: how many team phones get SOS alerts (a number only).
create or replace function public.sos_phones() returns int
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then (
    select count(*)::int from public.push_subscriptions s join public.admin_users a on a.id = s.user_id
    where s.app = 'admin' and a.active and a.role in ('owner', 'support')) end $$;
revoke execute on function public.sos_phones() from public, anon;
grant execute on function public.sos_phones() to authenticated;

select 'SOS now rings the team''s phones' as result;
