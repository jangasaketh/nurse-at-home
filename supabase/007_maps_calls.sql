-- =====================================================================================================
-- NURSE AT HOME · DATABASE, PART 7: MAPS AND PRIVATE CALLS (version 1.7.0)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Needs parts 1 to 6 first.
--
--   1. A pin on the map for each address (lat, lng), so the caregiver gets exact directions.
--   2. While on the way, the caregiver's phone shares where they are; the patient sees it on a map.
--      Only the patient of that visit sees it, only while the caregiver is on the way or at the door.
--   3. Private calls: the patient and the caregiver of a visit call each other through our number
--      (Exotel), so neither sees the other's phone number. The "call" Edge Function places the call.
-- =====================================================================================================

-- 1. Pins on addresses
alter table public.addresses add column if not exists lat double precision;
alter table public.addresses add column if not exists lng double precision;
alter table public.addresses drop constraint if exists addresses_pin_in_india;
alter table public.addresses add constraint addresses_pin_in_india check (
  (lat is null and lng is null) or (lat between 6 and 37 and lng between 68 and 98));

-- 2. Where the caregiver is, while on the way
alter table public.bookings add column if not exists cg_lat double precision;
alter table public.bookings add column if not exists cg_lng double precision;
alter table public.bookings add column if not exists cg_located_at timestamptz;

-- The caregiver's phone sends its position (about every 30 seconds while on the way).
create or replace function public.share_location(p_booking uuid, p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_lat is null or p_lng is null or p_lat not between 6 and 37 or p_lng not between 68 and 98 then
    raise exception 'Location outside India';
  end if;
  update public.bookings set cg_lat = p_lat, cg_lng = p_lng, cg_located_at = now()
    where id = p_booking and caregiver_id = auth.uid() and status in ('accepted', 'en_route', 'arrived');
  if not found then raise exception 'Not your visit, or the visit is not on the way'; end if;
end $$;

-- The patient's app: where the caregiver is (only while on the way or at the door, and only a recent position),
-- and the pin of the visit address.
create or replace function public.caregiver_location(p_booking uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'lat', case when b.status in ('en_route', 'arrived') and b.cg_located_at > now() - interval '10 minutes' then b.cg_lat end,
    'lng', case when b.status in ('en_route', 'arrived') and b.cg_located_at > now() - interval '10 minutes' then b.cg_lng end,
    'at', case when b.status in ('en_route', 'arrived') and b.cg_located_at > now() - interval '10 minutes' then b.cg_located_at end,
    'home_lat', a.lat, 'home_lng', a.lng)
  from public.bookings b left join public.addresses a on a.id = b.address_id
  where b.id = p_booking and b.account_id = auth.uid() $$;

-- Forget the position once the visit is over (privacy).
create or replace function public.forget_location() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('in_progress', 'completed', 'cancelled', 'missed') and new.cg_lat is not null then
    new.cg_lat := null; new.cg_lng := null; new.cg_located_at := null;
  end if;
  return new;
end $$;
drop trigger if exists bookings_forget_location on public.bookings;
create trigger bookings_forget_location before update of status on public.bookings
  for each row execute function public.forget_location();

-- The caregiver's job now carries the pin of the address (only for their own visits, like the address itself).
create or replace function public.job_json(b public.bookings, p_mine boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id, 'code', b.code, 'service_id', b.service_id, 'status', b.status, 'visit_no', b.visit_no, 'visits', b.visits,
    'every_days', b.every_days, 'same_caregiver', b.same_caregiver, 'vital_ids', to_jsonb(b.vital_ids), 'women_only', b.women_only,
    'language', b.language, 'pay', b.pay, 'note', b.note, 'urgent', b.urgent, 'slot', b.slot,
    'date', to_char(public.visit_date(b), 'YYYY-MM-DD'), 'city_id', b.city_id,
    'area', coalesce(a.area, ''), 'landmark', case when p_mine then coalesce(a.landmark, '') else '' end,
    'address', case when p_mine then b.address_text else '' end,
    'lat', case when p_mine then a.lat end, 'lng', case when p_mine then a.lng end,
    'patient', jsonb_build_object('first', public.first_name(p.name), 'full', case when p_mine then p.name else public.first_name(p.name) end,
      'age', coalesce(p.age, 0), 'gender', coalesce(nullif(p.gender, ''), 'F')),
    'unit_price', b.unit_price, 'visit_fee', b.visit_fee, 'urgent_fee', b.urgent_fee, 'carried', b.carried,
    'earning', public.visit_earning(b), 'fee_earning', public.fee_earning(b),
    'collect', case when b.pay = 'cash' then public.visit_total(b) + b.carried + b.due_amount else 0 end,
    'prescription_path', case when p_mine then (select storage_path from public.prescriptions where id = b.prescription_id) else null end,
    'arrived_at', b.arrived_at, 'code_ok', b.code_ok_at is not null, 'late_minutes', b.late_minutes, 'created_at', b.created_at)
  from (select 1) one
  left join public.addresses a on a.id = b.address_id
  left join public.patient_people p on p.id = b.person_id $$;
revoke execute on function public.job_json(public.bookings, boolean) from public, anon, authenticated;

-- 3. Private calls
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  caller_id uuid not null references public.profiles(id),
  callee_id uuid not null references public.profiles(id),
  provider_ref text,
  status text not null default 'placed',
  created_at timestamptz not null default now()
);
alter table public.calls enable row level security;
drop policy if exists "team sees calls" on public.calls;
create policy "team sees calls" on public.calls for select using (public.is_admin(array['owner', 'support']));
grant select on public.calls to authenticated;

-- For the "call" Edge Function only: who is calling whom for this visit. Allowed only for the patient and the
-- assigned caregiver, from acceptance until care is finished, and at most 10 calls per visit.
create or replace function public.call_parties(p_booking uuid, p_caller uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  callee uuid;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('accepted', 'en_route', 'arrived', 'in_progress') or b.caregiver_id is null then
    raise exception 'Calls are possible only for a visit that is accepted and not finished';
  end if;
  if p_caller = b.account_id then callee := b.caregiver_id;
  elsif p_caller = b.caregiver_id then callee := b.account_id;
  else raise exception 'Not your visit';
  end if;
  if (select count(*) from public.calls where booking_id = b.id) >= 10 then raise exception 'Too many calls for this visit'; end if;
  return jsonb_build_object(
    'from', (select phone from public.profiles where id = p_caller),
    'to', (select phone from public.profiles where id = callee),
    'callee', callee);
end $$;

create or replace function public.call_placed(p_booking uuid, p_caller uuid, p_callee uuid, p_ref text, p_status text) returns void
language sql security definer set search_path = public as $$
  insert into public.calls (booking_id, caller_id, callee_id, provider_ref, status) values (p_booking, p_caller, p_callee, p_ref, p_status) $$;

revoke execute on function public.call_parties(uuid, uuid), public.call_placed(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.call_parties(uuid, uuid), public.call_placed(uuid, uuid, uuid, text, text) to service_role;
revoke execute on function public.share_location(uuid, double precision, double precision), public.caregiver_location(uuid) from public, anon;
grant execute on function public.share_location(uuid, double precision, double precision), public.caregiver_location(uuid) to authenticated;

select 'Maps and calls are ready' as result;
