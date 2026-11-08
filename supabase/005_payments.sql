-- =====================================================================================================
-- NURSE AT HOME · DATABASE, PART 5: ONLINE PAYMENT, REFUNDS AND PAYOUTS (version 1.5.0)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Needs parts 1, 3 and 4 first.
--
-- Online payment uses Razorpay. The secret key never reaches a phone: the small server program in
-- supabase/functions/payments (an Edge Function) talks to Razorpay and calls the functions below, which
-- only that program may call. Patients pay the whole booking when they book; the request goes to
-- caregivers once the payment has gone through. Refunds go back the same way.
--
-- Also here: the team's Refunds page (what is owed back, and giving a refund) and Payouts page (what each
-- caregiver earned in a week, cash they collected, what to pay, and recording the bank transfer).
--
-- Online payment stays off until the owner switches it on in the admin panel (Settings → Payments),
-- after the Razorpay keys are added to the Edge Function's secrets.
-- =====================================================================================================

-- -----------------------------------------------------------------------------------------------------
-- 1. New columns and settings
-- -----------------------------------------------------------------------------------------------------

alter table public.bookings add column if not exists payment_status text not null default 'none';
alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check
  check (payment_status in ('none', 'pending', 'paid', 'partly_refunded', 'refunded', 'failed'));
alter table public.bookings add column if not exists amount_paid int not null default 0;
alter table public.bookings add column if not exists paid_at timestamptz;

alter table public.payments add column if not exists order_id text;
alter table public.payments add column if not exists paid_at timestamptz;
create unique index if not exists payments_order_id on public.payments (order_id) where order_id is not null;
alter table public.refunds add column if not exists gateway_ref text;
create unique index if not exists refunds_gateway_ref on public.refunds (gateway_ref) where gateway_ref is not null;

insert into public.settings (key, value) values ('payments', '{"enabled": false}') on conflict (key) do nothing;

-- -----------------------------------------------------------------------------------------------------
-- 2. Helpers
-- -----------------------------------------------------------------------------------------------------

-- What the patient pays online for the whole booking (every visit, the urgent charge, anything carried).
create or replace function public.booking_total(b public.bookings) returns int language sql immutable as $$
  select (b.unit_price + b.visit_fee) * b.visits + b.urgent_fee + b.carried $$;

-- What has really gone back to the patient through Razorpay.
create or replace function public.refunded_total(p_booking uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from public.refunds where booking_id = p_booking and status = 'approved' and gateway_ref is not null $$;

-- A booking paid online starts as "waiting for payment". Online payment must be switched on.
create or replace function public.bookings_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pay = 'cash' then
    new.payment_status := 'none';
  else
    if not coalesce((select (value ->> 'enabled')::boolean from public.settings where key = 'payments'), false) then
      raise exception 'Online payment is not switched on yet. Choose pay after the visit.';
    end if;
    new.payment_status := 'pending';
    new.carried := 0; -- unpaid cash charges are collected in cash, not online
  end if;
  new.amount_paid := 0;
  return new;
end $$;
drop trigger if exists bookings_payment on public.bookings;
create trigger bookings_payment before insert on public.bookings for each row execute function public.bookings_payment();

-- -----------------------------------------------------------------------------------------------------
-- 3. For the payments server program only (service role): never callable from a phone
-- -----------------------------------------------------------------------------------------------------

-- Can this person pay for this booking now, and how much?
create or replace function public.payment_quote(p_booking uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking and account_id = p_user;
  if not found then raise exception 'Booking not found'; end if;
  if b.pay = 'cash' then raise exception 'This booking is paid after the visit'; end if;
  if b.payment_status in ('paid', 'partly_refunded', 'refunded') then raise exception 'Already paid'; end if;
  if b.status <> 'requested' then raise exception 'This booking has already ended'; end if;
  return jsonb_build_object('amount', public.booking_total(b), 'code', b.code,
    'phone', (select phone from public.profiles where id = b.account_id),
    'order_id', (select order_id from public.payments where booking_id = b.id and status = 'pending' and amount = public.booking_total(b)
                 order by created_at desc limit 1));
end $$;

create or replace function public.payment_order_saved(p_booking uuid, p_order text, p_amount int, p_method text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.payments (booking_id, amount, method, status, order_id)
  values (p_booking, p_amount, case when p_method in ('upi', 'card') then p_method else 'upi' end, 'pending', p_order)
  on conflict do nothing;
end $$;

-- Razorpay says the payment went through (checked with the secret key or the webhook signature).
-- Safe to call twice. Then the request goes to caregivers.
create or replace function public.payment_confirmed(p_order text, p_payment text, p_amount int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pay public.payments%rowtype;
  b public.bookings%rowtype;
begin
  select * into pay from public.payments where order_id = p_order for update;
  if not found then raise exception 'Unknown order'; end if;
  if pay.status = 'paid' then return jsonb_build_object('booking', pay.booking_id, 'already', true); end if;
  if p_amount is not null and p_amount < pay.amount then raise exception 'Paid amount is less than the booking'; end if;
  update public.payments set status = 'paid', gateway_ref = p_payment, paid_at = now() where id = pay.id;
  update public.bookings set payment_status = 'paid', amount_paid = pay.amount, paid_at = now(), searching_since = now()
    where id = pay.booking_id returning * into b;
  if b.status = 'requested' then
    perform public.offer_booking(b.id);
  elsif b.status = 'cancelled' then
    -- Paid after cancelling (a slow payment): all of it goes back.
    update public.bookings set refund_amount = greatest(refund_amount, pay.amount) where id = b.id;
  end if;
  perform public.notify(b.account_id, 'booking', public.msg('Payment received'),
    public.msgv('{amount} paid for booking {code}. We are finding a caregiver for you.', jsonb_build_object('amount', '₹' || pay.amount, 'code', b.code)), 'tracking');
  return jsonb_build_object('booking', b.id, 'already', false);
end $$;

create or replace function public.payment_failed(p_order text) returns void
language sql security definer set search_path = public as $$
  update public.payments set status = 'failed' where order_id = p_order and status = 'pending' $$;

-- What can be refunded through Razorpay now: what the rules say is owed back, minus what already went back.
-- The patient of the booking, or support and finance, may ask.
create or replace function public.refund_due(p_booking uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  allowed boolean;
  gw text;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'Booking not found'; end if;
  allowed := b.account_id = p_user or exists (select 1 from public.admin_users where id = p_user and active and role in ('owner', 'support', 'finance'));
  if not allowed then raise exception 'Not allowed'; end if;
  select gateway_ref into gw from public.payments where booking_id = b.id and status = 'paid' order by paid_at desc limit 1;
  return jsonb_build_object('payment_id', gw,
    'amount', greatest(0, least(b.refund_amount, b.amount_paid) - public.refunded_total(b.id)), 'code', b.code);
end $$;

create or replace function public.refund_saved(p_booking uuid, p_refund text, p_amount int, p_by uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  total int;
begin
  insert into public.refunds (booking_id, requested_by, reason, asked, status, amount, note, decided_by, decided_at, gateway_ref)
  values (p_booking, p_by, 'Refund by the rules', p_amount, 'approved', p_amount, 'Razorpay refund ' || p_refund,
    (select id from public.admin_users where id = p_by), now(), p_refund)
  on conflict do nothing;
  select * into b from public.bookings where id = p_booking;
  total := public.refunded_total(p_booking);
  update public.bookings set payment_status = case when total >= amount_paid then 'refunded' else 'partly_refunded' end where id = p_booking;
  update public.payments set status = 'refunded' where booking_id = p_booking and status = 'paid' and total >= b.amount_paid;
  perform public.notify(b.account_id, 'booking', public.msg('Refund sent'),
    public.msgv('{amount} is on its way back for booking {code}. Banks take 5 to 7 working days.', jsonb_build_object('amount', '₹' || p_amount, 'code', b.code)), 'bookings');
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 4. Booking functions from part 4, with the payment rules added
-- -----------------------------------------------------------------------------------------------------

-- Offer a waiting booking to caregivers (part 4), but an online booking only once it is paid.
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
  -- Paid online: offered only once the payment has gone through.
  if b.pay <> 'cash' and b.payment_status not in ('paid', 'partly_refunded') then return 0; end if;
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

-- Make a booking (part 4): an online booking does not take over earlier unpaid cash charges.
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

  -- Paid online: earlier cash charges are not added (they are collected in cash at a later visit).
  update public.bookings set due_settled_by = b.id
    where b.carried > 0 and account_id = me and due_amount > 0 and due_settled_by is null and id <> b.id and status in ('cancelled', 'missed', 'completed');

  insert into public.booking_codes (booking_id, code) values (b.id, lpad((floor(random() * 10000))::int::text, 4, '0'));
  offers := public.offer_booking(b.id);
  return jsonb_build_object('id', b.id, 'code', b.code, 'offers', offers, 'carried', v_carried,
    'unit_price', b.unit_price, 'visit_fee', b.visit_fee, 'urgent_fee', b.urgent_fee);
end $$;

-- What the patient app shows about one booking (part 4), plus the payment.
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
    'rated', exists (select 1 from public.reviews where booking_id = b.id),
    'payment_status', b.payment_status, 'amount_paid', b.amount_paid, 'pay_total', public.booking_total(b),
    'refunded', public.refunded_total(b.id));
end $$;

-- Cancel (part 4): a refund only of what was really paid online.
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
  if b.pay = 'cash' then due := fee;
  elsif b.payment_status in ('paid', 'partly_refunded') then refund := least(gross - fee, greatest(0, b.amount_paid - b.refund_amount));
  end if;  -- an online booking not paid yet: nothing to refund
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

-- The team's bookings list (part 4), plus the payment.
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
      'declined', (select count(*) from public.job_offers o where o.booking_id = b.id and o.status = 'declined'),
      'payment_status', b.payment_status, 'amount_paid', b.amount_paid, 'refunded', public.refunded_total(b.id)) x
    from public.bookings b
      left join public.addresses a on a.id = b.address_id
      left join public.patient_people p on p.id = b.person_id
      left join public.profiles pr on pr.id = b.account_id
    where b.created_at > now() - make_interval(days => p_days) or b.status in ('requested', 'accepted', 'en_route', 'arrived', 'in_progress')
  ) s), '[]'::jsonb);
end $$;

-- Give a visit to a caregiver by hand (part 4): not before an online booking is paid.
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
  if b.pay <> 'cash' and b.payment_status not in ('paid', 'partly_refunded') then raise exception 'This booking is waiting for online payment'; end if;
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

-- The team cancels (part 4): a full refund of what was paid online.
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
  refund := case when b.pay = 'cash' or b.payment_status not in ('paid', 'partly_refunded') then 0
    else least((b.unit_price + b.visit_fee) * (b.visits - b.visit_no + 1) + case when b.visits = 1 then b.urgent_fee else 0 end, greatest(0, b.amount_paid - b.refund_amount)) end;
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

-- The patient chose to pay online but would rather pay after the visit: switch, and send the request.
create or replace function public.pay_after_visit(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking and account_id = auth.uid() for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.pay = 'cash' then return; end if;
  if b.payment_status not in ('pending', 'failed') or b.status <> 'requested' then raise exception 'Already paid'; end if;
  update public.payments set status = 'failed' where booking_id = b.id and status = 'pending';
  update public.bookings set pay = 'cash', payment_status = 'none', searching_since = now() where id = b.id;
  perform public.offer_booking(b.id);
end $$;
revoke execute on function public.pay_after_visit(uuid) from public, anon;
grant execute on function public.pay_after_visit(uuid) to authenticated;

-- -----------------------------------------------------------------------------------------------------
-- 5. Team: refunds
-- -----------------------------------------------------------------------------------------------------

-- Bookings with money to give back (by the rules, or decided by the team), and refunds already given.
create or replace function public.admin_refunds(p_days int default 60) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(array['support', 'finance']) then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'due', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
      select jsonb_build_object('booking', b.id, 'code', b.code, 'service_id', b.service_id, 'patient', p.name, 'phone', pr.phone,
        'pay', b.pay, 'paid', b.amount_paid, 'owed', least(b.refund_amount, b.amount_paid), 'refunded', public.refunded_total(b.id),
        'status', b.status, 'reason', b.cancel_reason, 'at', coalesce(b.cancelled_at, b.updated_at)) x
      from public.bookings b left join public.patient_people p on p.id = b.person_id left join public.profiles pr on pr.id = b.account_id
      where b.pay <> 'cash' and b.amount_paid > 0 and least(b.refund_amount, b.amount_paid) > public.refunded_total(b.id)) s), '[]'::jsonb),
    'done', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
      select jsonb_build_object('id', r.id, 'booking', b.id, 'code', b.code, 'patient', p.name, 'amount', r.amount, 'note', r.note,
        'gateway', r.gateway_ref, 'by', (select name from public.admin_users where id = r.decided_by), 'at', r.decided_at) x
      from public.refunds r join public.bookings b on b.id = r.booking_id left join public.patient_people p on p.id = b.person_id
      where r.status = 'approved' and r.decided_at > now() - make_interval(days => p_days)) s), '[]'::jsonb));
end $$;

-- The team gives money back beyond the rules (for example the patient was hospitalised). For an online
-- booking this raises what is owed back, and the payments program sends it through Razorpay. For a cash
-- booking it records money paid back by hand.
create or replace function public.admin_refund(p_booking uuid, p_amount int, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  room int;
begin
  if not public.is_admin(array['support', 'finance']) then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Write why'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if p_amount < 1 then raise exception 'Enter an amount'; end if;
  if b.pay = 'cash' then
    insert into public.refunds (booking_id, requested_by, reason, asked, status, amount, note, decided_by, decided_at)
    values (b.id, auth.uid(), 'Paid back by hand', p_amount, 'approved', p_amount, p_note, auth.uid(), now());
    insert into public.audit_log (actor, page, action, subject_id, detail)
    values (auth.uid(), 'refunds', 'refund_by_hand', b.id, jsonb_build_object('text', b.code || ': ₹' || p_amount || ' paid back by hand. ' || p_note));
    return jsonb_build_object('online', false);
  end if;
  room := b.amount_paid - b.refund_amount;
  if p_amount > room then raise exception 'At most ₹% more can be refunded', room; end if;
  update public.bookings set refund_amount = refund_amount + p_amount where id = b.id;
  insert into public.audit_log (actor, page, action, subject_id, detail)
  values (auth.uid(), 'refunds', 'refund', b.id, jsonb_build_object('text', b.code || ': refund ₹' || p_amount || '. ' || p_note));
  return jsonb_build_object('online', true);
end $$;

-- -----------------------------------------------------------------------------------------------------
-- 6. Team: weekly payouts to caregivers
-- -----------------------------------------------------------------------------------------------------

-- For one payout week (starting on p_week): each caregiver's visits, earnings, cash they collected, and
-- what we owe them (or they owe us, when they collected more cash than they earned).
create or replace function public.admin_payouts(p_week date) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(array['finance']) then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'name') from (
    select jsonb_build_object('caregiver', c.id, 'name', pr.full_name, 'phone', pr.phone, 'city_id', c.city_id,
      'visits', count(*) filter (where e.kind = 'visit'), 'earned', coalesce(sum(e.amount), 0), 'cash', coalesce(sum(e.cash), 0),
      'net', coalesce(sum(e.amount), 0) - coalesce(sum(e.cash), 0),
      'holder', bk.holder, 'account', right(bk.account_number, 4), 'account_full', bk.account_number, 'ifsc', bk.ifsc, 'upi', bk.upi,
      'paid', (select jsonb_build_object('amount', po.amount, 'reference', po.reference, 'at', po.paid_at)
               from public.payouts po where po.caregiver_id = c.id and po.week_start = p_week and po.paid_at is not null)) x
    from public.earnings e
      join public.caregivers c on c.id = e.caregiver_id
      join public.profiles pr on pr.id = c.id
      left join public.caregiver_bank bk on bk.caregiver_id = c.id
    where e.created_at >= (p_week::timestamp at time zone 'Asia/Kolkata') and e.created_at < ((p_week + 7)::timestamp at time zone 'Asia/Kolkata')
    group by c.id, pr.full_name, pr.phone, c.city_id, bk.holder, bk.account_number, bk.ifsc, bk.upi) s), '[]'::jsonb);
end $$;

-- After sending the bank transfer: record it with the bank reference (UTR). The caregiver is told.
create or replace function public.admin_record_payout(p_caregiver uuid, p_week date, p_amount int, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(array['finance']) then raise exception 'Not allowed'; end if;
  if p_amount < 1 then raise exception 'Enter the amount sent'; end if;
  if coalesce(trim(p_reference), '') = '' then raise exception 'Enter the bank reference (UTR)'; end if;
  insert into public.payouts (caregiver_id, week_start, amount, reference, paid_at, created_by)
  values (p_caregiver, p_week, p_amount, trim(p_reference), now(), auth.uid())
  on conflict (caregiver_id, week_start) do update set amount = excluded.amount, reference = excluded.reference, paid_at = now(), created_by = auth.uid();
  perform public.notify(p_caregiver, 'payout', public.msg('Payout sent'),
    public.msgv('{amount} was sent to your account •••• {acc}.', jsonb_build_object('amount', '₹' || p_amount,
      'acc', coalesce((select right(account_number, 4) from public.caregiver_bank where caregiver_id = p_caregiver), '0000'))), 'payouts');
  insert into public.audit_log (actor, page, action, subject_id, detail)
  values (auth.uid(), 'payouts', 'paid', p_caregiver, jsonb_build_object('text', '₹' || p_amount || ' for the week of ' || p_week || ', ' || trim(p_reference)));
end $$;

-- -----------------------------------------------------------------------------------------------------
-- 7. Who may call what
-- -----------------------------------------------------------------------------------------------------

revoke execute on function public.payment_quote(uuid, uuid), public.payment_order_saved(uuid, text, int, text), public.payment_confirmed(text, text, int),
  public.payment_failed(text), public.refund_due(uuid, uuid), public.refund_saved(uuid, text, int, uuid)
  from public, anon, authenticated;
grant execute on function public.payment_quote(uuid, uuid), public.payment_order_saved(uuid, text, int, text), public.payment_confirmed(text, text, int),
  public.payment_failed(text), public.refund_due(uuid, uuid), public.refund_saved(uuid, text, int, uuid)
  to service_role;
revoke execute on function public.admin_refunds(int), public.admin_refund(uuid, int, text), public.admin_payouts(date), public.admin_record_payout(uuid, date, int, text)
  from public, anon;
grant execute on function public.admin_refunds(int), public.admin_refund(uuid, int, text), public.admin_payouts(date), public.admin_record_payout(uuid, date, int, text)
  to authenticated;
revoke execute on function public.refunded_total(uuid) from public, anon, authenticated;
grant execute on function public.refunded_total(uuid) to service_role;
-- The functions from part 4 replaced above keep their access (replacing a function keeps its grants).

select 'Payment functions are ready' as result;
