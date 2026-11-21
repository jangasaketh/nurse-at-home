-- =====================================================================================================
-- NURSE AT HOME · DATABASE, PART 11: NEAREST CAREGIVERS AND RECEIPTS (version 2.0.0)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Needs parts 1 to 10 first.
--
--   1. Caregivers can pin where they start from (Work settings). A request then goes only to caregivers
--      within their chosen distance of the patient's pin. Without either pin, the whole city, as before.
--      Caregivers see how far a request is (never the exact place before accepting).
--   2. Receipts: the patient can download a receipt for each visit (what was paid, how, refunds).
-- =====================================================================================================

-- Straight-line distance in km.
create or replace function public.km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 2 * 6371 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))) $$;

-- How far the caregiver's start pin is from the booking's address pin, or null when either is missing.
create or replace function public.booking_km(c public.caregivers, b public.bookings) returns double precision
language sql stable security definer set search_path = public as $$
  select case when (c.availability -> 'base' ->> 'lat') is not null and a.lat is not null
    then public.km_between((c.availability -> 'base' ->> 'lat')::double precision, (c.availability -> 'base' ->> 'lng')::double precision, a.lat, a.lng) end
  from (select 1) one left join public.addresses a on a.id = b.address_id $$;

-- Same rules as 004_bookings.sql, plus distance.
create or replace function public.caregiver_fits(c public.caregivers, b public.bookings) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  svc public.services%rowtype;
  av jsonb := coalesce(c.availability, '{}'::jsonb);
  h int;
  wd int;
  km double precision;
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
  -- Distance: only when both the caregiver and the patient set a pin.
  km := public.booking_km(c, b);
  if km is not null and km > coalesce(nullif(av ->> 'radiusKm', '')::numeric, 10) then return false; end if;
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

-- The caregiver's job (as in 007_maps_calls.sql) now also says how far it is from where they start.
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
    'distance_km', (select round(public.booking_km(c, b)::numeric, 1) from public.caregivers c where c.id = auth.uid()),
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
revoke execute on function public.job_json(public.bookings, boolean), public.booking_km(public.caregivers, public.bookings) from public, anon, authenticated;

-- 2. A receipt for one visit record (completed or missed) or a cancelled booking, for the patient who booked it.
create or replace function public.visit_receipt(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.visit_records%rowtype;
  b public.bookings%rowtype;
  lines jsonb := '[]'::jsonb;
  total int := 0;
begin
  select * into r from public.visit_records where id = p_id;
  if found then select * into b from public.bookings where id = r.booking_id;
  else select * into b from public.bookings where id = p_id and status = 'cancelled';
  end if;
  if b.id is null or b.account_id is distinct from auth.uid() then raise exception 'Receipt not found'; end if;

  if r.id is not null and r.kind = 'completed' then
    lines := jsonb_build_array(jsonb_build_object('k', 'service', 'amount', b.unit_price), jsonb_build_object('k', 'visit_fee', 'amount', b.visit_fee));
    if b.visits = 1 and b.urgent_fee > 0 then lines := lines || jsonb_build_object('k', 'urgent_fee', 'amount', b.urgent_fee); end if;
    total := public.visit_total(b);
  elsif r.id is not null then  -- missed or stopped: the home visit charge kept
    lines := jsonb_build_array(jsonb_build_object('k', 'visit_fee_kept', 'amount', b.visit_fee));
    total := b.visit_fee;
  else                         -- cancelled: what was kept
    if b.fee_kept > 0 then lines := jsonb_build_array(jsonb_build_object('k', 'visit_fee_kept', 'amount', b.fee_kept)); end if;
    total := b.fee_kept;
  end if;

  return jsonb_build_object(
    'number', b.code || case when b.visits > 1 then '-' || coalesce(r.visit_no, b.visit_no) else '' end,
    'kind', coalesce(r.kind, 'cancelled'),
    'date', to_char(coalesce(r.created_at, b.cancelled_at, b.updated_at) at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
    'visit_date', to_char((b.start_at at time zone 'Asia/Kolkata')::date + (coalesce(r.visit_no, b.visit_no) - 1) * b.every_days, 'YYYY-MM-DD'),
    'service_id', b.service_id, 'visit_no', coalesce(r.visit_no, b.visit_no), 'visits', b.visits,
    'patient', (select name from public.patient_people where id = b.person_id),
    'account', (select full_name from public.profiles where id = b.account_id),
    'caregiver', (select full_name from public.profiles where id = coalesce(r.caregiver_id, b.caregiver_id)),
    'lines', lines, 'total', total,
    'pay', b.pay, 'paid_online', least(coalesce(b.amount_paid, 0), total),
    'refunded', coalesce((select sum(amount) from public.refunds where booking_id = b.id and status = 'approved'), 0),
    'city_id', b.city_id);
end $$;
revoke execute on function public.visit_receipt(uuid) from public, anon;
grant execute on function public.visit_receipt(uuid) to authenticated;

select 'Nearest caregivers and receipts are ready' as result;
