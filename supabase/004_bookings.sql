-- =====================================================================================================
-- NURSE AT HOME · DATABASE, PART 4: REAL BOOKINGS (version 1.3.0)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Needs parts 1 and 3 first (001_setup.sql, 003_verification.sql).
--
-- Bookings, from the patient's request to the visit record, as database functions. Each one checks who is
-- asking and what state the booking is in, so the rules cannot be bypassed from a phone.
--
--   Patient:    book_visit, patient_booking, patient_history, cancel_booking, reschedule_booking,
--               set_same_caregiver, look_again, rate_visit
--   Caregiver:  caregiver_work, accept_offer, decline_offer, visit_step, report_late, confirm_arrival,
--               finish_visit, caregiver_cancel
--   Team:       admin_bookings, admin_assign, admin_cancel
--
-- How a request finds a caregiver: when a patient books, the request is offered at the same time to every
-- verified, online caregiver in that city who may do the service and whose work settings fit (role, tier,
-- registration still valid, woman caregiver if asked, language if asked, days and hours, urgent visits).
-- The first one to accept gets it. An offer lasts the time set in Settings (15 minutes, or 3 for urgent).
-- Caregivers who come online later get the request too, while it is still waiting.
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- 1. New columns and tables
-- -----------------------------------------------------------------------------------------------------

alter table public.bookings add column if not exists note text not null default '';           -- from the patient
alter table public.bookings add column if not exists carried int not null default 0;          -- unpaid charge from an earlier cash booking
alter table public.bookings add column if not exists due_amount int not null default 0;       -- what the patient still owes from this booking
alter table public.bookings add column if not exists due_settled_by uuid;                     -- the later booking that collects it
alter table public.bookings add column if not exists late_minutes int not null default 0;     -- the caregiver said they are running late
alter table public.bookings add column if not exists accepted_at timestamptz;
alter table public.bookings add column if not exists en_route_at timestamptz;
alter table public.bookings add column if not exists arrived_at timestamptz;
alter table public.bookings add column if not exists code_ok_at timestamptz;
alter table public.bookings add column if not exists started_at timestamptz;
alter table public.bookings add column if not exists searching_since timestamptz not null default now();

-- The arrival code lives in its own table: the caregiver can read the booking but must not see the code.
create table if not exists public.booking_codes (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  code text not null
);
alter table public.booking_codes enable row level security;
drop policy if exists "patient sees the code" on public.booking_codes;
create policy "patient sees the code" on public.booking_codes for select using (public.owns_booking(booking_id));

-- A visit record may carry a wound photo. It goes to the private 'visits' bucket, in the caregiver's folder,
-- and can be opened by the patient of that booking, the caregiver who took it, and support.
alter table public.visit_records add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visits', 'visits', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

create or replace function public.patient_has_visit_file(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.visit_records r join public.bookings b on b.id = r.booking_id
    where r.photo_path = path and b.account_id = auth.uid()
  ) $$;

drop policy if exists "nah caregiver uploads visit photos" on storage.objects;
drop policy if exists "nah visit photos are read by the people of the visit" on storage.objects;
create policy "nah caregiver uploads visit photos" on storage.objects for insert to authenticated with check (
  bucket_id = 'visits' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "nah visit photos are read by the people of the visit" on storage.objects for select to authenticated using (
  bucket_id = 'visits' and ((storage.foldername(name))[1] = auth.uid()::text or public.patient_has_visit_file(name) or public.is_admin(array['support']))
);

-- Offers are given out only through caregiver_work(): the caregiver sees the area, not the address, until
-- they accept. So the old rule that let an offered caregiver read the whole booking row is removed.
drop policy if exists "caregiver sees offered bookings" on public.bookings;

-- Patients rate through rate_visit(), which also updates the caregiver's rating.
drop policy if exists "patient rates a visit" on public.reviews;

-- -----------------------------------------------------------------------------------------------------
-- 2. Small helpers
-- -----------------------------------------------------------------------------------------------------

create or replace function public.msgv(k text, v jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('k', k, 'v', v) $$;

create or replace function public.setting(p_key text, p_field text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> p_field)::numeric from public.settings where key = p_key), p_default) $$;

-- "9:00 AM" on a date, in India time.
create or replace function public.slot_time(p_date date, p_slot text) returns timestamptz
language plpgsql immutable as $$
declare
  m text[];
  h int;
begin
  m := regexp_match(p_slot, '^(\d{1,2}):(\d{2}) (AM|PM)$');
  if m is null then return null; end if;
  h := (m[1]::int % 12) + case when m[3] = 'PM' then 12 else 0 end;
  return (p_date + make_time(h, m[2]::int, 0)) at time zone 'Asia/Kolkata';
end $$;

-- Hour of a slot (0 to 23), or -1.
create or replace function public.slot_hour(p_slot text) returns int language sql immutable as $$
  select coalesce(((regexp_match(p_slot, '^(\d{1,2}):\d{2} (AM|PM)$'))[1]::int % 12)
    + case when p_slot like '% PM' then 12 else 0 end, -1) $$;

-- The date (India) of the visit this booking is on now.
create or replace function public.visit_date(b public.bookings) returns date language sql stable as $$
  select (b.start_at at time zone 'Asia/Kolkata')::date + (b.visit_no - 1) * b.every_days $$;

-- When the visit this booking is on now is due.
create or replace function public.visit_due(b public.bookings) returns timestamptz language sql stable as $$
  select case when b.urgent then b.start_at
    else public.slot_time(public.visit_date(b), b.slot) end $$;

-- A date and time as a message the apps show in their language: { "date": "2026-11-09", "slot": "9:00 AM" }.
create or replace function public.when_msg(b public.bookings) returns jsonb language sql stable as $$
  select case when b.urgent then public.msg('As soon as possible (within 60 minutes)')
    else jsonb_build_object('date', to_char(public.visit_date(b), 'YYYY-MM-DD'), 'slot', b.slot) end $$;

create or replace function public.service_msg(p_service text) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.msg(coalesce((select name from public.services where id = p_service), p_service)) $$;

create or replace function public.first_name(full_name text) returns text language sql immutable as $$
  select coalesce(nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), ''), 'Caregiver') $$;

-- What the patient pays for the visit this booking is on now (the urgent charge only on a single visit).
create or replace function public.visit_total(b public.bookings) returns int language sql immutable as $$
  select b.unit_price + b.visit_fee + case when b.visits = 1 then b.urgent_fee else 0 end $$;

-- What the caregiver earns for one completed visit.
create or replace function public.visit_earning(b public.bookings) returns int language sql stable as $$
  select (round(b.unit_price * public.setting('pay_split', 'caregiverShare', 80) / 100)
        + round(b.visit_fee * public.setting('pay_split', 'visitFeeShare', 100) / 100)
        + case when b.visits = 1 then round(b.urgent_fee * public.setting('pay_split', 'urgentShare', 50) / 100) else 0 end)::int $$;

-- What the caregiver gets when the home visit charge is kept (missed visit, stopped visit, late cancel).
create or replace function public.fee_earning(b public.bookings) returns int language sql stable as $$
  select round(b.visit_fee * public.setting('pay_split', 'visitFeeShare', 100) / 100)::int $$;

-- The registration of a nurse is still valid (no date = not checked yet = valid).
create or replace function public.registration_ok(p_caregiver uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select valid_until is null or valid_until >= current_date
                   from public.caregiver_qualifications where caregiver_id = p_caregiver), true) $$;

-- Can this caregiver take this booking (rules, not whether they are online)?
create or replace function public.caregiver_fits(c public.caregivers, b public.bookings) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  svc public.services%rowtype;
  av jsonb := coalesce(c.availability, '{}'::jsonb);
  h int;
  wd int;
begin
  if c.kyc_status <> 'approved' or c.suspended_at is not null then return false; end if;
  if c.city_id is distinct from b.city_id then return false; end if;
  if c.id = b.account_id then return false; end if;                       -- not their own family
  select * into svc from public.services where id = b.service_id;
  if not found then return false; end if;
  if svc.nurse_only and (c.role <> 'nurse' or c.tier <> 'full' or not public.registration_ok(c.id)) then return false; end if;
  if b.women_only and c.gender is distinct from 'F' then return false; end if;
  if b.language is not null and b.language <> 'English' and not (b.language = any(c.languages)) then return false; end if;
  if av ? 'services' and not (av -> 'services') ? b.service_id then return false; end if;
  if b.urgent then
    return coalesce((av ->> 'urgent')::boolean, true);
  end if;
  wd := extract(dow from public.visit_date(b))::int;
  if av ? 'days' and not exists (select 1 from jsonb_array_elements_text(av -> 'days') d where d::int = wd) then return false; end if;
  h := public.slot_hour(b.slot);
  if av ? 'start' and h < public.slot_hour(av ->> 'start') then return false; end if;
  if av ? 'end' and h > public.slot_hour(av ->> 'end') then return false; end if;
  return true;
end $$;

-- Offer a waiting booking to every online caregiver who fits and has not had it yet (or whose offer ran
-- out, when p_again). Returns how many offers are open now.
create or replace function public.offer_booking(p_booking uuid, p_again boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  c public.caregivers%rowtype;
  mins numeric;
  open_count int;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or b.status <> 'requested' or b.caregiver_id is not null then return 0; end if;
  mins := case when b.urgent then public.setting('time_limits', 'offerMinutesUrgent', 3) else public.setting('time_limits', 'offerMinutes', 15) end;
  for c in select * from public.caregivers where online and kyc_status = 'approved' and suspended_at is null and city_id = b.city_id loop
    continue when not public.caregiver_fits(c, b);
    if not exists (select 1 from public.job_offers where booking_id = b.id and caregiver_id = c.id) then
      insert into public.job_offers (booking_id, caregiver_id, expires_at) values (b.id, c.id, now() + make_interval(mins => mins::int));
      perform public.notify(c.id, 'request', public.msg('New request'),
        public.msgv('{service} in {area}. Answer in time to get it.', jsonb_build_object('service', public.service_msg(b.service_id),
          'area', coalesce((select area from public.addresses where id = b.address_id), ''))), 'jobs');
    elsif p_again then
      update public.job_offers set status = 'offered', offered_at = now(), expires_at = now() + make_interval(mins => mins::int)
        where booking_id = b.id and caregiver_id = c.id and (status = 'expired' or (status = 'offered' and expires_at < now()));
    end if;
  end loop;
  select count(*) into open_count from public.job_offers where booking_id = b.id and status = 'offered' and expires_at > now();
  return open_count;
end $$;

-- Offers that ran out of time are marked as expired (checked whenever someone looks).
create or replace function public.expire_offers() returns void
language sql security definer set search_path = public as $$
  update public.job_offers set status = 'expired' where status = 'offered' and expires_at < now() $$;

revoke execute on function public.offer_booking(uuid, boolean), public.expire_offers(), public.caregiver_fits(public.caregivers, public.bookings)
  from public, anon, authenticated;

-- The caregiver rules from part 1, with one addition: the booking functions (rate_visit, finish_visit) may
-- update a caregiver's rating and visit count.
create or replace function public.caregivers_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin(array['verification']) then return new; end if;
  -- rate_visit() and finish_visit() update ratings and visit counts. They mark the change as theirs for that
  -- moment only (a phone cannot set this: it can only call the functions it is allowed to).
  if current_setting('nah.trusted', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.kyc_status <> 'draft' or new.tier <> 'full' or new.suspended_at is not null or new.rating is not null
       or new.visits_done <> 0 or new.ratings_count <> 0 then
      raise exception 'A new caregiver starts as a draft';
    end if;
    return new;
  end if;
  if new.tier is distinct from old.tier
     or new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_at is distinct from old.suspended_at
     or new.rating is distinct from old.rating
     or new.ratings_count is distinct from old.ratings_count
     or new.visits_done is distinct from old.visits_done
     or new.rejected_step is distinct from old.rejected_step and new.rejected_step is not null
     or new.rejected_reason is distinct from old.rejected_reason and new.rejected_reason is not null then
    raise exception 'Only the verification team can change this';
  end if;
  if new.kyc_status is distinct from old.kyc_status
     and not (new.kyc_status = 'submitted' and old.kyc_status in ('draft', 'rejected'))
     and not (new.kyc_status = 'draft' and old.kyc_status = 'rejected') then
    raise exception 'Only the verification team can approve or send back';
  end if;
  if new.online and (new.kyc_status <> 'approved' or new.suspended_at is not null) then
    raise exception 'Only verified caregivers who are not paused can go online';
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------------------------------
-- 3. Patient
-- -----------------------------------------------------------------------------------------------------

-- Make a booking. p: person_id, address_id, service_id, vital_ids, date (YYYY-MM-DD), slot, visits,
-- every_days, same_caregiver, women_only, language, pay, notify_contact, prescription_id, note.
create or replace function public.book_visit(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  addr public.addresses%rowtype;
  per public.patient_people%rowtype;
  v_date date;
  v_slot text := p ->> 'slot';
  v_urgent boolean;
  v_visits int := coalesce((p ->> 'visits')::int, 1);
  v_start timestamptz;
  v_carried int;
  b public.bookings%rowtype;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  offers int;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into per from public.patient_people where id = (p ->> 'person_id')::uuid and account_id = me;
  if not found then raise exception 'Choose who the visit is for'; end if;
  select * into addr from public.addresses where id = (p ->> 'address_id')::uuid and account_id = me;
  if not found then raise exception 'Choose an address'; end if;
  if (p ->> 'prescription_id') is not null
     and not exists (select 1 from public.prescriptions where id = (p ->> 'prescription_id')::uuid and account_id = me) then
    raise exception 'Prescription not found';
  end if;
  v_date := (p ->> 'date')::date;
  if v_date < today or v_date > today + 6 then raise exception 'Choose a day in the next week'; end if;
  if v_visits < 1 or v_visits > 30 then raise exception 'Too many visits'; end if;
  v_urgent := v_slot = 'within 60 minutes';
  if v_urgent then
    if v_visits <> 1 or v_date <> today then raise exception 'Urgent visits are for one visit today'; end if;
    v_start := now() + interval '60 minutes';
  else
    v_start := public.slot_time(v_date, v_slot);
    if v_start is null then raise exception 'Choose an arrival time'; end if;
    if v_start < now() + interval '30 minutes' then raise exception 'That time has passed. Choose a later time.'; end if;
  end if;
  if coalesce(p ->> 'pay', 'cash') not in ('upi', 'card', 'cash') then raise exception 'Choose how to pay'; end if;

  -- Any unpaid charge from earlier cash bookings is collected with this one.
  select coalesce(sum(due_amount), 0) into v_carried from public.bookings
    where account_id = me and due_amount > 0 and due_settled_by is null and status in ('cancelled', 'missed', 'completed');

  insert into public.bookings (account_id, person_id, address_id, address_text, city_id, service_id, vital_ids, start_at, slot, urgent,
    visits, every_days, same_caregiver, women_only, language, prescription_id, pay, notify_contact, note, carried)
  values (me, per.id, addr.id,
    concat_ws(', ', nullif(addr.line, ''), nullif(addr.area, ''), (select name from public.cities where id = addr.city_id) || ' ' || addr.pincode)
      || case when addr.landmark <> '' then ' (' || addr.landmark || ')' else '' end,
    addr.city_id, p ->> 'service_id', coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'vital_ids') x), '{}'),
    v_start, case when v_urgent then 'within 60 minutes' else v_slot end, v_urgent, v_visits,
    greatest(1, least(7, coalesce((p ->> 'every_days')::int, 1))), coalesce((p ->> 'same_caregiver')::boolean, true),
    coalesce((p ->> 'women_only')::boolean, false), nullif(p ->> 'language', ''), (p ->> 'prescription_id')::uuid,
    coalesce(p ->> 'pay', 'cash'), coalesce((p ->> 'notify_contact')::boolean, false), left(coalesce(p ->> 'note', ''), 500), v_carried)
  returning * into b;

  update public.bookings set due_settled_by = b.id
    where account_id = me and due_amount > 0 and due_settled_by is null and id <> b.id and status in ('cancelled', 'missed', 'completed');

  insert into public.booking_codes (booking_id, code) values (b.id, lpad((floor(random() * 10000))::int::text, 4, '0'));
  offers := public.offer_booking(b.id);
  return jsonb_build_object('id', b.id, 'code', b.code, 'offers', offers, 'carried', v_carried,
    'unit_price', b.unit_price, 'visit_fee', b.visit_fee, 'urgent_fee', b.urgent_fee);
end $$;

-- Everything the patient app shows about one booking. While it waits for a caregiver, new caregivers who
-- came online are offered it too.
create or replace function public.patient_booking(p_booking uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  c public.caregivers%rowtype;
  q public.caregiver_qualifications%rowtype;
  cg jsonb := null;
  open_offers int := 0;
begin
  select * into b from public.bookings where id = p_booking and account_id = auth.uid();
  if not found then raise exception 'Booking not found'; end if;
  if b.status = 'requested' then
    perform public.expire_offers();
    open_offers := public.offer_booking(b.id);
  end if;
  if b.caregiver_id is not null then
    select * into c from public.caregivers where id = b.caregiver_id;
    select * into q from public.caregiver_qualifications where caregiver_id = b.caregiver_id;
    cg := jsonb_build_object('id', c.id, 'name', (select full_name from public.profiles where id = c.id), 'gender', c.gender,
      'role', c.role, 'course', q.course, 'council', q.council, 'reg_no', q.reg_no, 'years', coalesce(q.years, 0),
      'rating', c.rating, 'ratings_count', c.ratings_count, 'visits_done', c.visits_done, 'languages', to_jsonb(c.languages));
  end if;
  return jsonb_build_object(
    'service_id', b.service_id, 'address_text', b.address_text, 'city_id', b.city_id, 'vital_ids', to_jsonb(b.vital_ids),
    'women_only', b.women_only, 'language', b.language, 'notify_contact', b.notify_contact,
    'person', (select jsonb_build_object('id', p.id, 'name', p.name, 'relation', p.relation, 'age', p.age, 'gender', coalesce(p.gender, ''))
               from public.patient_people p where p.id = b.person_id),
    'prescription_path', (select storage_path from public.prescriptions where id = b.prescription_id),
    'id', b.id, 'code', b.code, 'status', b.status, 'visit_no', b.visit_no, 'visits', b.visits, 'every_days', b.every_days,
    'same_caregiver', b.same_caregiver, 'start_date', to_char((b.start_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'),
    'slot', b.slot, 'urgent', b.urgent, 'pay', b.pay, 'unit_price', b.unit_price, 'visit_fee', b.visit_fee, 'urgent_fee', b.urgent_fee,
    'carried', b.carried, 'late_minutes', b.late_minutes, 'created_at', b.created_at, 'searching_since', b.searching_since,
    'due', public.visit_due(b), 'caregiver', cg, 'open_offers', open_offers,
    'any_offers', exists (select 1 from public.job_offers where booking_id = b.id),
    'arrival_code', (select code from public.booking_codes where booking_id = b.id),
    'fee_kept', b.fee_kept, 'refund_amount', b.refund_amount, 'due_amount', b.due_amount, 'cancelled_by', b.cancelled_by,
    'cancel_reason', b.cancel_reason,
    'records', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'visit_no', r.visit_no, 'kind', r.kind, 'note', r.note,
        'details', r.details, 'readings', r.readings, 'warnings', r.warnings, 'photo_path', r.photo_path, 'at', r.created_at) order by r.created_at)
      from public.visit_records r where r.booking_id = b.id), '[]'::jsonb),
    'rated', exists (select 1 from public.reviews where booking_id = b.id));
end $$;

-- The patient's bookings and visit records, newest first (for Bookings and Records on a new phone).
create or replace function public.patient_history() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owed', (select coalesce(sum(due_amount), 0) from public.bookings
             where account_id = auth.uid() and due_amount > 0 and due_settled_by is null and status in ('cancelled', 'missed', 'completed')),
    'active', (select jsonb_agg(id order by created_at desc) from public.bookings
               where account_id = auth.uid() and status in ('requested', 'accepted', 'en_route', 'arrived', 'in_progress')),
    'records', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
      select jsonb_build_object('id', r.id, 'booking_id', b.id, 'service_id', b.service_id, 'visit_no', r.visit_no, 'visits', b.visits,
        'kind', r.kind, 'note', r.note, 'details', r.details, 'readings', r.readings, 'warnings', r.warnings, 'photo_path', r.photo_path,
        'at', r.created_at, 'slot', b.slot, 'date', to_char((b.start_at at time zone 'Asia/Kolkata')::date + (r.visit_no - 1) * b.every_days, 'YYYY-MM-DD'),
        'urgent', b.urgent, 'person', jsonb_build_object('name', p.name, 'relation', p.relation),
        'by', (select full_name from public.profiles where id = r.caregiver_id)) x
      from public.visit_records r join public.bookings b on b.id = r.booking_id left join public.patient_people p on p.id = b.person_id
      where b.account_id = auth.uid()
      union all
      select jsonb_build_object('id', b.id, 'booking_id', b.id, 'service_id', b.service_id, 'visit_no', b.visit_no, 'visits', b.visits,
        'kind', 'cancelled', 'note', coalesce(b.cancel_reason, ''), 'details', '[]'::jsonb, 'readings', '[]'::jsonb, 'warnings', '[]'::jsonb,
        'photo_path', null, 'at', b.cancelled_at, 'slot', b.slot,
        'date', to_char((b.start_at at time zone 'Asia/Kolkata')::date + (b.visit_no - 1) * b.every_days, 'YYYY-MM-DD'),
        'urgent', b.urgent, 'person', jsonb_build_object('name', p.name, 'relation', p.relation),
        'by', (select full_name from public.profiles where id = b.caregiver_id), 'cancelled_by', b.cancelled_by,
        'fee_kept', b.fee_kept, 'refund_amount', b.refund_amount) x
      from public.bookings b left join public.patient_people p on p.id = b.person_id
      where b.account_id = auth.uid() and b.status = 'cancelled'
      order by 1 limit 200) s), '[]'::jsonb)) $$;

-- What it costs to cancel or move the visit this booking is on now, and why (the same rule the app shows).
create or replace function public.change_fee(b public.bookings) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  timed boolean := coalesce((select (value ->> 'timed')::boolean from public.settings where key = 'cancel_rule'), true);
  grace numeric := public.setting('cancel_rule', 'graceMinutes', 5);
  free_hours numeric := public.setting('cancel_rule', 'freeUntilHours', 2);
  late numeric := public.setting('cancel_rule', 'lateMinutes', 30);
begin
  if b.status = 'in_progress' then return jsonb_build_object('allowed', false, 'fee', 0, 'why', 'started'); end if;
  if b.caregiver_id is null or b.status = 'requested' then return jsonb_build_object('allowed', true, 'fee', 0, 'why', 'no-caregiver'); end if;
  if b.status in ('accepted', 'en_route') and (b.late_minutes >= late or now() > public.visit_due(b) + make_interval(mins => late::int)) then
    return jsonb_build_object('allowed', true, 'fee', 0, 'why', 'caregiver-late');
  end if;
  if timed and now() - b.created_at <= make_interval(mins => grace::int) and b.visit_no = 1 then
    return jsonb_build_object('allowed', true, 'fee', 0, 'why', 'grace');
  end if;
  if b.status in ('en_route', 'arrived') then return jsonb_build_object('allowed', true, 'fee', b.visit_fee, 'why', 'set-off'); end if;
  if not timed or public.visit_due(b) - now() > make_interval(hours => free_hours::int) then
    return jsonb_build_object('allowed', true, 'fee', 0, 'why', 'early');
  end if;
  return jsonb_build_object('allowed', true, 'fee', b.visit_fee, 'why', 'close');
end $$;

create or replace function public.cancel_terms(p_booking uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking and account_id = auth.uid();
  if not found then raise exception 'Booking not found'; end if;
  return public.change_fee(b);
end $$;

-- Ends the visit this booking is on now and moves a course on (shared by cancel, missed and stopped).
-- Returns the booking after the change.
create or replace function public.next_visit(p_booking uuid) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking;
  if b.visit_no < b.visits then
    update public.bookings set visit_no = visit_no + 1, late_minutes = 0, en_route_at = null, arrived_at = null, code_ok_at = null, started_at = null,
      status = case when same_caregiver and caregiver_id is not null then 'accepted' else 'requested' end,
      caregiver_id = case when same_caregiver then caregiver_id else null end,
      searching_since = case when same_caregiver and caregiver_id is not null then searching_since else now() end
      where id = b.id returning * into b;
    if b.status = 'requested' then
      delete from public.job_offers where booking_id = b.id;
      perform public.offer_booking(b.id);
    end if;
  end if;
  return b;
end $$;
revoke execute on function public.next_visit(uuid) from public, anon, authenticated;

-- Cancel the visit this booking is on now (scope 'one') or the whole booking ('all'). The home visit charge
-- is kept only when the rule says, and paid to the caregiver. Returns the fee, the refund and what is due.
create or replace function public.cancel_booking(p_booking uuid, p_scope text default 'all', p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  terms jsonb;
  fee int;
  remaining int;
  gross int;
  refund int := 0;
  due int := 0;
  whole boolean;
  cg uuid;
begin
  select * into b from public.bookings where id = p_booking and account_id = auth.uid() for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status in ('completed', 'cancelled', 'missed') then raise exception 'This booking has already ended'; end if;
  terms := public.change_fee(b);
  if not (terms ->> 'allowed')::boolean then raise exception 'Care has already started'; end if;
  fee := (terms ->> 'fee')::int;
  remaining := b.visits - b.visit_no + 1;
  whole := p_scope = 'all' or remaining = 1;
  gross := (b.unit_price + b.visit_fee) * case when whole then remaining else 1 end + case when b.visits = 1 then b.urgent_fee else 0 end;
  if b.pay = 'cash' then due := fee; else refund := gross - fee; end if;
  cg := b.caregiver_id;

  if cg is not null and fee > 0 then
    insert into public.earnings (caregiver_id, booking_id, kind, amount) values (cg, b.id, 'late_cancel', public.fee_earning(b));
  end if;
  if cg is not null then
    perform public.notify(cg, 'cancelled',
      public.msgv('{name} cancelled the visit', jsonb_build_object('name', (select name from public.patient_people where id = b.person_id))),
      case when fee > 0 then public.msgv('{service}. You get the {fee} home visit charge.', jsonb_build_object('service', public.service_msg(b.service_id), 'fee', '₹' || public.fee_earning(b)))
           else public.msgv('{service}. Cancelled early, so there is no charge.', jsonb_build_object('service', public.service_msg(b.service_id))) end,
      'jobs');
  end if;
  update public.job_offers set status = 'expired' where booking_id = b.id and status = 'offered';

  if whole then
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'patient', cancel_reason = left(coalesce(p_reason, ''), 300),
      fee_kept = fee_kept + fee, refund_amount = refund_amount + refund,
      due_amount = due_amount + due + case when due_settled_by is null then carried else 0 end
      where id = b.id;
  else
    update public.bookings set fee_kept = fee_kept + fee, refund_amount = refund_amount + refund, due_amount = due_amount + due where id = b.id;
    perform public.next_visit(b.id);
  end if;
  return jsonb_build_object('fee', fee, 'refund', refund, 'due', due, 'why', terms ->> 'why', 'whole', whole);
end $$;

-- Move the visit this booking is on now to another day or time. Urgent visits cannot be moved.
create or replace function public.reschedule_booking(p_booking uuid, p_date date, p_slot text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  terms jsonb;
  fee int;
  new_start timestamptz;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into b from public.bookings where id = p_booking and account_id = auth.uid() for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.urgent then raise exception 'Urgent visits cannot be moved'; end if;
  if b.status not in ('requested', 'accepted') then raise exception 'The caregiver has already set off'; end if;
  if p_date < today or p_date > today + 6 then raise exception 'Choose a day in the next week'; end if;
  new_start := public.slot_time(p_date, p_slot);
  if new_start is null or new_start < now() + interval '30 minutes' then raise exception 'That time has passed. Choose a later time.'; end if;
  terms := public.change_fee(b);
  fee := (terms ->> 'fee')::int;
  -- Moving one visit of a course moves the rest with it.
  update public.bookings set start_at = public.slot_time(p_date - (b.visit_no - 1) * b.every_days, p_slot), slot = p_slot, late_minutes = 0,
    fee_kept = fee_kept + fee, due_amount = due_amount + case when pay = 'cash' then fee else 0 end,
    refund_amount = refund_amount
    where id = b.id returning * into b;
  if b.caregiver_id is not null then
    if fee > 0 then
      insert into public.earnings (caregiver_id, booking_id, kind, amount) values (b.caregiver_id, b.id, 'late_cancel', public.fee_earning(b));
    end if;
    perform public.notify(b.caregiver_id, 'cancelled', public.msg('A visit was moved'),
      public.msgv('{service} for {name} is now on {when}. If you cannot come then, cancel it from the visit.',
        jsonb_build_object('service', public.service_msg(b.service_id), 'name', (select name from public.patient_people where id = b.person_id), 'when', public.when_msg(b))),
      'schedule');
  elsif b.status = 'requested' then
    delete from public.job_offers where booking_id = b.id;
    update public.bookings set searching_since = now() where id = b.id;
    perform public.offer_booking(b.id);
  end if;
  return jsonb_build_object('fee', fee, 'why', terms ->> 'why');
end $$;

-- A course: same caregiver for the rest of the visits, or any available caregiver.
create or replace function public.set_same_caregiver(p_booking uuid, p_same boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set same_caregiver = p_same where id = p_booking and account_id = auth.uid()
    and status in ('requested', 'accepted', 'en_route', 'arrived', 'in_progress');
  if not found then raise exception 'Booking not found'; end if;
end $$;

-- Nobody accepted in time: offer the request again to everyone who fits (except those who declined).
create or replace function public.look_again(p_booking uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.bookings where id = p_booking and account_id = auth.uid() and status = 'requested') then
    raise exception 'Booking not found';
  end if;
  perform public.expire_offers();
  update public.bookings set searching_since = now() where id = p_booking;
  return public.offer_booking(p_booking, true);
end $$;

-- Rate the caregiver after a completed visit (one rating per booking; rating again replaces it).
create or replace function public.rate_visit(p_booking uuid, p_stars int, p_text text default '', p_tags text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  cg uuid;
begin
  select * into b from public.bookings where id = p_booking and account_id = auth.uid();
  if not found then raise exception 'Booking not found'; end if;
  if p_stars < 1 or p_stars > 5 then raise exception 'Choose 1 to 5 stars'; end if;
  select caregiver_id into cg from public.visit_records where booking_id = b.id and kind = 'completed' order by created_at desc limit 1;
  if cg is null then raise exception 'You can rate after a visit is completed'; end if;
  insert into public.reviews (booking_id, caregiver_id, account_id, stars, text, tags)
  values (b.id, cg, auth.uid(), p_stars, left(coalesce(p_text, ''), 500), coalesce(p_tags, '{}'))
  on conflict (booking_id) do update set stars = excluded.stars, text = excluded.text, tags = excluded.tags, caregiver_id = excluded.caregiver_id, created_at = now();
  perform set_config('nah.trusted', 'on', true);
  update public.caregivers set
    rating = (select round(avg(stars)::numeric, 1) from public.reviews where caregiver_id = cg),
    ratings_count = (select count(*) from public.reviews where caregiver_id = cg)
    where id = cg;
  perform set_config('nah.trusted', 'off', true);
  perform public.notify(cg, 'rating',
    public.msgv('{name} rated you {n} stars', jsonb_build_object('name', (select name from public.patient_people where id = b.person_id), 'n', p_stars)),
    case when coalesce(p_text, '') <> '' then to_jsonb(left(p_text, 200)) else public.service_msg(b.service_id) end, 'ratings');
end $$;

-- -----------------------------------------------------------------------------------------------------
-- 4. Caregiver
-- -----------------------------------------------------------------------------------------------------

-- A booking as the caregiver app shows it. The full address, name and prescription only once it is theirs.
create or replace function public.job_json(b public.bookings, p_mine boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id, 'code', b.code, 'service_id', b.service_id, 'status', b.status, 'visit_no', b.visit_no, 'visits', b.visits,
    'every_days', b.every_days, 'same_caregiver', b.same_caregiver, 'vital_ids', to_jsonb(b.vital_ids), 'women_only', b.women_only,
    'language', b.language, 'pay', b.pay, 'note', b.note, 'urgent', b.urgent, 'slot', b.slot,
    'date', to_char(public.visit_date(b), 'YYYY-MM-DD'), 'city_id', b.city_id,
    'area', coalesce(a.area, ''), 'landmark', case when p_mine then coalesce(a.landmark, '') else '' end,
    'address', case when p_mine then b.address_text else '' end,
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

-- Everything the caregiver app needs, in one call: open offers, their visits, earnings, payouts, ratings.
create or replace function public.caregiver_work() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c public.caregivers%rowtype;
begin
  select * into c from public.caregivers where id = me;
  if not found then raise exception 'Not a caregiver'; end if;
  perform public.expire_offers();
  -- Caregivers who just came online get the requests that are still waiting.
  if c.online and c.kyc_status = 'approved' and c.suspended_at is null then
    perform public.offer_booking(b.id) from public.bookings b
      where b.status = 'requested' and b.city_id = c.city_id and b.caregiver_id is null
        and not exists (select 1 from public.job_offers o where o.booking_id = b.id and o.caregiver_id = me);
  end if;
  return jsonb_build_object(
    'offers', coalesce((select jsonb_agg(public.job_json(b, false) || jsonb_build_object('offered_at', o.offered_at, 'expires_at', o.expires_at) order by o.offered_at)
      from public.job_offers o join public.bookings b on b.id = o.booking_id
      where o.caregiver_id = me and o.status = 'offered' and o.expires_at > now() and b.status = 'requested' and b.caregiver_id is null), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(public.job_json(b, true) order by b.start_at)
      from public.bookings b where b.caregiver_id = me and b.status in ('accepted', 'en_route', 'arrived', 'in_progress')), '[]'::jsonb),
    'earnings', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'amount', e.amount, 'cash', e.cash, 'at', e.created_at,
        'service_id', b.service_id, 'patient', public.first_name(p.name) || coalesce(' ' || left(nullif(split_part(p.name, ' ', 2), ''), 1) || '.', '')) order by e.created_at desc)
      from public.earnings e left join public.bookings b on b.id = e.booking_id left join public.patient_people p on p.id = b.person_id
      where e.caregiver_id = me and e.created_at > now() - interval '120 days'), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'amount', amount, 'reference', reference, 'at', paid_at) order by paid_at desc)
      from public.payouts where caregiver_id = me and paid_at is not null), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'stars', r.stars, 'text', r.text, 'tags', to_jsonb(r.tags), 'at', r.created_at,
        'service_id', b.service_id, 'patient', public.first_name(p.name)) order by r.created_at desc)
      from public.reviews r join public.bookings b on b.id = r.booking_id left join public.patient_people p on p.id = b.person_id
      where r.caregiver_id = me), '[]'::jsonb),
    'rating', c.rating, 'ratings_count', c.ratings_count, 'visits_done', c.visits_done);
end $$;

-- Accept an offer. The first caregiver to accept gets the booking.
create or replace function public.accept_offer(p_booking uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  b public.bookings%rowtype;
  c public.caregivers%rowtype;
begin
  select * into c from public.caregivers where id = me;
  if not found or c.kyc_status <> 'approved' or c.suspended_at is not null then raise exception 'Only verified caregivers can accept requests'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Request not found'; end if;
  if not exists (select 1 from public.job_offers where booking_id = b.id and caregiver_id = me and status = 'offered' and expires_at > now()) then
    if b.caregiver_id is not null and b.caregiver_id <> me then raise exception 'taken'; end if;
    raise exception 'expired';
  end if;
  if b.status <> 'requested' or b.caregiver_id is not null then raise exception 'taken'; end if;
  if not public.caregiver_fits(c, b) then raise exception 'This request no longer fits your settings'; end if;
  update public.bookings set caregiver_id = me, status = 'accepted', accepted_at = now() where id = b.id returning * into b;
  update public.job_offers set status = 'accepted' where booking_id = b.id and caregiver_id = me;
  update public.job_offers set status = 'expired' where booking_id = b.id and caregiver_id <> me and status = 'offered';
  perform public.notify(b.account_id, 'booking',
    public.msgv('{name} accepted your booking', jsonb_build_object('name', public.first_name((select full_name from public.profiles where id = me)))),
    public.msgv('{service} for {patient}, {when}.', jsonb_build_object('service', public.service_msg(b.service_id),
      'patient', (select name from public.patient_people where id = b.person_id), 'when', public.when_msg(b))), 'tracking');
  return public.job_json(b, true);
end $$;

create or replace function public.decline_offer(p_booking uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.job_offers set status = 'declined', decline_reason = left(coalesce(p_reason, ''), 200)
    where booking_id = p_booking and caregiver_id = auth.uid() and status in ('offered', 'expired');
end $$;

-- The caregiver sets off ('en_route') or reaches the door ('arrived').
create or replace function public.visit_step(p_booking uuid, p_step text) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  nm text;
begin
  select * into b from public.bookings where id = p_booking and caregiver_id = auth.uid() for update;
  if not found then raise exception 'Visit not found'; end if;
  nm := public.first_name((select full_name from public.profiles where id = auth.uid()));
  if p_step = 'en_route' then
    if b.status = 'en_route' then return; end if;
    if b.status <> 'accepted' then raise exception 'This visit is not waiting to start'; end if;
    update public.bookings set status = 'en_route', en_route_at = now() where id = b.id;
    perform public.notify(b.account_id, 'booking', public.msgv('{name} is on the way', jsonb_build_object('name', nm)),
      public.msgv('{service} for {patient}, {when}.', jsonb_build_object('service', public.service_msg(b.service_id),
        'patient', (select name from public.patient_people where id = b.person_id), 'when', public.when_msg(b))), 'tracking');
  elsif p_step = 'arrived' then
    if b.status = 'arrived' then return; end if;
    if b.status not in ('accepted', 'en_route') then raise exception 'This visit is not on the way'; end if;
    update public.bookings set status = 'arrived', arrived_at = now(), en_route_at = coalesce(en_route_at, now()) where id = b.id;
    perform public.notify(b.account_id, 'booking', public.msgv('{name} has arrived', jsonb_build_object('name', nm)),
      public.msg('Share your arrival code at the door to start the visit.'), 'tracking');
  elsif p_step = 'in_progress' then
    if b.status = 'in_progress' then return; end if;
    if b.status <> 'arrived' or b.code_ok_at is null then raise exception 'Check the arrival code first'; end if;
    update public.bookings set status = 'in_progress', started_at = now() where id = b.id;
  else
    raise exception 'Unknown step';
  end if;
end $$;

create or replace function public.report_late(p_booking uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  update public.bookings set late_minutes = greatest(0, least(120, p_minutes))
    where id = p_booking and caregiver_id = auth.uid() and status in ('accepted', 'en_route') returning * into b;
  if not found then raise exception 'Visit not found'; end if;
  perform public.notify(b.account_id, 'booking',
    public.msgv('{name} is running about {n} minutes late', jsonb_build_object('name', public.first_name((select full_name from public.profiles where id = auth.uid())), 'n', p_minutes)),
    case when p_minutes >= public.setting('cancel_rule', 'lateMinutes', 30) then public.msg('We are sorry. You can wait, or cancel free of charge.')
         else public.msg('We will tell you when they arrive.') end, 'tracking');
end $$;

-- The patient tells the caregiver the 4-digit code at the door. Five wrong tries lock it for the visit.
create or replace function public.confirm_arrival(p_booking uuid, p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  ok boolean;
begin
  select * into b from public.bookings where id = p_booking and caregiver_id = auth.uid() for update;
  if not found then raise exception 'Visit not found'; end if;
  if b.status not in ('arrived', 'en_route', 'accepted') then raise exception 'This visit is not at the door'; end if;
  ok := exists (select 1 from public.booking_codes where booking_id = b.id and code = p_code);
  if ok then
    update public.bookings set code_ok_at = now(), status = 'arrived', arrived_at = coalesce(arrived_at, now()), en_route_at = coalesce(en_route_at, now())
      where id = b.id;
  end if;
  return ok;
end $$;

-- Finish the visit this booking is on now: 'completed' (with the record), 'missed' (nobody answered the door
-- for the waiting time) or 'stopped' (unsafe to give care). Earnings are worked out here.
create or replace function public.finish_visit(p_booking uuid, p_kind text, p_record jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  b public.bookings%rowtype;
  earned int;
  cash int := 0;
  kind text;
  wait numeric := public.setting('cancel_rule', 'noShowMinutes', 10);
  nm text;
  patient text;
  last_visit boolean;
begin
  select * into b from public.bookings where id = p_booking and caregiver_id = me for update;
  if not found then raise exception 'Visit not found'; end if;
  nm := public.first_name((select full_name from public.profiles where id = me));
  select name into patient from public.patient_people where id = b.person_id;
  last_visit := b.visit_no >= b.visits;
  if p_kind = 'completed' then
    if b.status <> 'in_progress' then raise exception 'Start the care first'; end if;
    earned := public.visit_earning(b);
    if b.pay = 'cash' then cash := public.visit_total(b) + b.carried + b.due_amount; end if;  -- with anything still owed
    kind := 'visit';
  elsif p_kind = 'missed' then
    if b.status <> 'arrived' or b.arrived_at > now() - make_interval(mins => wait::int) then
      raise exception 'Wait % minutes at the door first', wait;
    end if;
    earned := public.fee_earning(b);
    kind := 'missed';
  elsif p_kind = 'stopped' then
    if b.status not in ('arrived', 'in_progress') then raise exception 'You are not at the visit'; end if;
    earned := public.fee_earning(b);
    kind := 'stopped';
  else
    raise exception 'Unknown result';
  end if;

  insert into public.visit_records (booking_id, caregiver_id, visit_no, kind, note, details, readings, warnings, checklist, cash_collected, photo_path)
  values (b.id, me, b.visit_no, p_kind, left(coalesce(p_record ->> 'note', ''), 2000), coalesce(p_record -> 'details', '[]'), coalesce(p_record -> 'readings', '[]'),
    coalesce(p_record -> 'warnings', '[]'), coalesce(p_record -> 'checklist', '{}'), cash, nullif(p_record ->> 'photo_path', ''));
  insert into public.earnings (caregiver_id, booking_id, kind, amount, cash) values (me, b.id, kind, earned, cash);

  if p_kind = 'completed' then
      perform set_config('nah.trusted', 'on', true);
    update public.caregivers set visits_done = visits_done + 1 where id = me;
    perform set_config('nah.trusted', 'off', true);
      -- Collected in cash: nothing is owed any more (including what was carried from earlier).
    update public.bookings set carried = 0, due_amount = 0 where id = b.id and pay = 'cash';
    perform public.notify(b.account_id, 'booking', public.msg('Visit completed'),
      public.msgv('The record of this visit ({service}) is saved under Records.', jsonb_build_object('service', public.service_msg(b.service_id))), 'records');
  elsif p_kind = 'missed' then
    update public.bookings set fee_kept = fee_kept + visit_fee,
      due_amount = due_amount + case when pay = 'cash' then visit_fee else 0 end,
      refund_amount = refund_amount + case when pay = 'cash' then 0 else public.visit_total(b) - visit_fee end
      where id = b.id;
    perform public.notify(b.account_id, 'booking', public.msg('Visit missed'),
      public.msgv('{name} waited {n} minutes at your door. The {fee} home visit charge is kept.', jsonb_build_object('name', nm, 'n', wait, 'fee', '₹' || b.visit_fee)), 'bookings');
  else
    update public.bookings set fee_kept = fee_kept + visit_fee,
      due_amount = due_amount + case when pay = 'cash' then visit_fee else 0 end,
      refund_amount = refund_amount + case when pay = 'cash' then 0 else public.visit_total(b) - visit_fee end
      where id = b.id;
    perform public.notify(b.account_id, 'booking', public.msg('The visit was stopped for safety'),
      public.msgv('{name} stopped before giving care because something did not match. Our support team will call you.', jsonb_build_object('name', nm)), 'bookings');
  end if;

  -- A stopped visit ends the booking; a course otherwise moves on to its next visit.
  if p_kind = 'stopped' or last_visit then
    update public.bookings set status = case when p_kind = 'completed' or (b.visits > 1 and p_kind <> 'stopped') then 'completed'
                                             when p_kind = 'missed' then 'missed' else 'cancelled' end,
      cancelled_at = case when p_kind = 'stopped' then now() else cancelled_at end,
      cancelled_by = case when p_kind = 'stopped' then 'caregiver' else cancelled_by end,
      cancel_reason = case when p_kind = 'stopped' then 'Stopped for safety' else cancel_reason end,
      due_amount = case when p_kind <> 'completed' and pay = 'cash' and due_settled_by is null then due_amount + carried else due_amount end
      where id = b.id returning * into b;
  else
    b := public.next_visit(b.id);
  end if;
  return jsonb_build_object('earned', earned, 'cash', cash, 'status', b.status, 'visit_no', b.visit_no,
    'next', case when b.status in ('accepted', 'requested') and b.caregiver_id = me then public.when_msg(b) else null end);
end $$;

-- The caregiver cannot do the visit: the patient pays nothing and the request goes to other caregivers.
create or replace function public.caregiver_cancel(p_booking uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  nm text;
begin
  select * into b from public.bookings where id = p_booking and caregiver_id = auth.uid() for update;
  if not found then raise exception 'Visit not found'; end if;
  if b.status in ('in_progress', 'completed', 'cancelled', 'missed') then raise exception 'This visit cannot be cancelled now'; end if;
  nm := public.first_name((select full_name from public.profiles where id = auth.uid()));
  update public.job_offers set status = 'declined', decline_reason = 'Cancelled: ' || left(coalesce(p_reason, ''), 150)
    where booking_id = b.id and caregiver_id = auth.uid();
  update public.bookings set caregiver_id = null, status = 'requested', accepted_at = null, en_route_at = null, arrived_at = null,
    code_ok_at = null, late_minutes = 0, searching_since = now(), same_caregiver = case when visit_no > 1 then false else same_caregiver end
    where id = b.id;
  insert into public.audit_log (actor, page, action, subject_id, detail)
  values (null, 'bookings', 'caregiver_cancelled', b.id, jsonb_build_object('text', b.code || ' · ' || nm || ': ' || left(coalesce(p_reason, ''), 200)));
  perform public.notify(b.account_id, 'booking', public.msgv('{name} had to cancel', jsonb_build_object('name', nm)),
    public.msg('You have not been charged. We are looking for another caregiver for you.'), 'tracking');
  perform public.offer_booking(b.id, true);
end $$;

-- -----------------------------------------------------------------------------------------------------
-- 5. Team (support): see, assign and cancel bookings
-- -----------------------------------------------------------------------------------------------------

create or replace function public.admin_bookings(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(array['support', 'finance']) then raise exception 'Not allowed'; end if;
  perform public.expire_offers();
  return coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
    select jsonb_build_object('id', b.id, 'code', b.code, 'status', b.status, 'service_id', b.service_id, 'city_id', b.city_id,
      'area', a.area, 'address', b.address_text, 'date', to_char(public.visit_date(b), 'YYYY-MM-DD'), 'slot', b.slot, 'urgent', b.urgent,
      'visit_no', b.visit_no, 'visits', b.visits, 'pay', b.pay, 'total', public.visit_total(b), 'unit_price', b.unit_price, 'visit_fee', b.visit_fee,
      'urgent_fee', b.urgent_fee, 'fee_kept', b.fee_kept, 'refund_amount', b.refund_amount, 'due_amount', b.due_amount,
      'patient', p.name, 'account_phone', pr.phone, 'account_name', pr.full_name,
      'caregiver_id', b.caregiver_id, 'caregiver', (select full_name from public.profiles where id = b.caregiver_id),
      'caregiver_phone', (select phone from public.profiles where id = b.caregiver_id),
      'women_only', b.women_only, 'language', b.language, 'note', b.note, 'created_at', b.created_at,
      'cancelled_by', b.cancelled_by, 'cancel_reason', b.cancel_reason,
      'open_offers', (select count(*) from public.job_offers o where o.booking_id = b.id and o.status = 'offered' and o.expires_at > now()),
      'declined', (select count(*) from public.job_offers o where o.booking_id = b.id and o.status = 'declined')) x
    from public.bookings b
      left join public.addresses a on a.id = b.address_id
      left join public.patient_people p on p.id = b.person_id
      left join public.profiles pr on pr.id = b.account_id
    where b.created_at > now() - make_interval(days => p_days) or b.status in ('requested', 'accepted', 'en_route', 'arrived', 'in_progress')
  ) s), '[]'::jsonb);
end $$;

-- Caregivers who could take this booking (verified, not paused, right city and rules), online first.
create or replace function public.admin_candidates(p_booking uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  if not public.is_admin(array['support']) then raise exception 'Not allowed'; end if;
  select * into b from public.bookings where id = p_booking;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', pr.full_name, 'phone', pr.phone, 'role', c.role, 'online', c.online,
      'area', c.area, 'rating', c.rating) order by c.online desc, pr.full_name)
    from public.caregivers c join public.profiles pr on pr.id = c.id
    where c.kyc_status = 'approved' and c.suspended_at is null and c.city_id = b.city_id
      and (not (select nurse_only from public.services where id = b.service_id) or (c.role = 'nurse' and c.tier = 'full' and public.registration_ok(c.id)))
      and (not b.women_only or c.gender = 'F')), '[]'::jsonb);
end $$;

create or replace function public.admin_assign(p_booking uuid, p_caregiver uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  c public.caregivers%rowtype;
begin
  if not public.is_admin(array['support']) then raise exception 'Not allowed'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('requested', 'accepted') then raise exception 'The visit has already started'; end if;
  select * into c from public.caregivers where id = p_caregiver;
  if not found or c.kyc_status <> 'approved' or c.suspended_at is not null then raise exception 'Choose a verified caregiver who is not paused'; end if;
  if (select nurse_only from public.services where id = b.service_id) and (c.role <> 'nurse' or c.tier <> 'full') then
    raise exception 'This service needs a registered nurse';
  end if;
  if b.caregiver_id is not null and b.caregiver_id <> p_caregiver then
    perform public.notify(b.caregiver_id, 'cancelled', public.msg('A visit was given to another caregiver'),
      public.msgv('{service} on {when}. Our team moved it. You do not need to go.', jsonb_build_object('service', public.service_msg(b.service_id), 'when', public.when_msg(b))), 'jobs');
  end if;
  update public.bookings set caregiver_id = p_caregiver, status = 'accepted', accepted_at = now() where id = b.id returning * into b;
  insert into public.job_offers (booking_id, caregiver_id, expires_at, status) values (b.id, p_caregiver, now(), 'accepted')
    on conflict (booking_id, caregiver_id) do update set status = 'accepted';
  update public.job_offers set status = 'expired' where booking_id = b.id and caregiver_id <> p_caregiver and status = 'offered';
  perform public.notify(p_caregiver, 'request', public.msg('Our team gave you a visit'),
    public.msgv('{service} in {area}, {when}. Open it from Jobs.', jsonb_build_object('service', public.service_msg(b.service_id),
      'area', coalesce((select area from public.addresses where id = b.address_id), ''), 'when', public.when_msg(b))), 'jobs');
  perform public.notify(b.account_id, 'booking',
    public.msgv('{name} accepted your booking', jsonb_build_object('name', public.first_name((select full_name from public.profiles where id = p_caregiver)))),
    public.msgv('{service} for {patient}, {when}.', jsonb_build_object('service', public.service_msg(b.service_id),
      'patient', (select name from public.patient_people where id = b.person_id), 'when', public.when_msg(b))), 'tracking');
  insert into public.audit_log (actor, page, action, subject_id, detail)
  values (auth.uid(), 'bookings', 'assigned', b.id, jsonb_build_object('text', b.code || ' → ' || coalesce((select full_name from public.profiles where id = p_caregiver), '')));
end $$;

-- The team cancels a booking: the patient pays nothing (full refund when paid online).
create or replace function public.admin_cancel(p_booking uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  refund int;
begin
  if not public.is_admin(array['support']) then raise exception 'Not allowed'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status in ('completed', 'cancelled', 'missed') then raise exception 'This booking has already ended'; end if;
  refund := case when b.pay = 'cash' then 0 else (b.unit_price + b.visit_fee) * (b.visits - b.visit_no + 1) + case when b.visits = 1 then b.urgent_fee else 0 end end;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'admin', cancel_reason = left(coalesce(p_reason, ''), 300),
    refund_amount = refund_amount + refund,
    due_amount = case when pay = 'cash' and due_settled_by is null then due_amount + carried else due_amount end
    where id = b.id;
  update public.job_offers set status = 'expired' where booking_id = b.id and status = 'offered';
  perform public.notify(b.account_id, 'booking', public.msg('Your booking was cancelled by our team'),
    public.msg(coalesce(nullif(p_reason, ''), 'Sorry for the trouble. You have not been charged.')), 'bookings');
  if b.caregiver_id is not null then
    perform public.notify(b.caregiver_id, 'cancelled', public.msg('A visit was cancelled by our team'),
      public.msgv('{service} on {when}. You do not need to go.', jsonb_build_object('service', public.service_msg(b.service_id), 'when', public.when_msg(b))), 'jobs');
  end if;
  insert into public.audit_log (actor, page, action, subject_id, detail)
  values (auth.uid(), 'bookings', 'cancelled', b.id, jsonb_build_object('text', b.code || ': ' || left(coalesce(p_reason, ''), 200)));
end $$;

-- -----------------------------------------------------------------------------------------------------
-- 6. Who may call what
-- -----------------------------------------------------------------------------------------------------

revoke execute on function public.book_visit(jsonb), public.patient_booking(uuid), public.patient_history(), public.cancel_terms(uuid),
  public.cancel_booking(uuid, text, text), public.reschedule_booking(uuid, date, text), public.set_same_caregiver(uuid, boolean),
  public.look_again(uuid), public.rate_visit(uuid, int, text, text[]), public.caregiver_work(), public.accept_offer(uuid),
  public.decline_offer(uuid, text), public.visit_step(uuid, text), public.report_late(uuid, int), public.confirm_arrival(uuid, text),
  public.finish_visit(uuid, text, jsonb), public.caregiver_cancel(uuid, text), public.admin_bookings(int), public.admin_candidates(uuid),
  public.admin_assign(uuid, uuid), public.admin_cancel(uuid, text), public.change_fee(public.bookings)
  from public, anon;
grant execute on function public.book_visit(jsonb), public.patient_booking(uuid), public.patient_history(), public.cancel_terms(uuid),
  public.cancel_booking(uuid, text, text), public.reschedule_booking(uuid, date, text), public.set_same_caregiver(uuid, boolean),
  public.look_again(uuid), public.rate_visit(uuid, int, text, text[]), public.caregiver_work(), public.accept_offer(uuid),
  public.decline_offer(uuid, text), public.visit_step(uuid, text), public.report_late(uuid, int), public.confirm_arrival(uuid, text),
  public.finish_visit(uuid, text, jsonb), public.caregiver_cancel(uuid, text), public.admin_bookings(int), public.admin_candidates(uuid),
  public.admin_assign(uuid, uuid), public.admin_cancel(uuid, text)
  to authenticated;
grant select on public.booking_codes to authenticated;

select 'Booking functions are ready' as result;
