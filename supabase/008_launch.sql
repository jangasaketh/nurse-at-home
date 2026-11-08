-- =====================================================================================================
-- NURSE AT HOME · DATABASE, PART 8: READY FOR LAUNCH (version 1.8.0)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Needs parts 1 to 7 first.
--
--   1. Support for real: patients and caregivers send reports from the apps (with a photo), the team replies
--      and resolves them in the admin panel, and the person is told (notification and phone push).
--   2. SOS: the SOS button in a visit sends an urgent report with the person's location to the support team.
--   3. Real figures in the admin panel: Dashboard, Patients and Reports.
--   4. A switch for "Try the demo" on the login screens (admin panel: Settings → Launch).
-- =====================================================================================================

-- "Try the demo" on the login screens: on until the owner switches it off.
insert into public.settings (key, value) values ('demo', '{"show": true}') on conflict (key) do nothing;

-- -----------------------------------------------------------------------------------------------------
-- 1. Support reports
-- -----------------------------------------------------------------------------------------------------
create or replace function public.send_ticket(p_topic text, p_message text, p_booking uuid default null, p_photo text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  kind text;
  code text;
  b uuid := null;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if length(trim(coalesce(p_message, ''))) < 10 then raise exception 'Tell us a little more'; end if;
  if (select count(*) from public.support_tickets where from_user = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many reports in an hour';
  end if;
  kind := case when exists (select 1 from public.caregivers where id = me) then 'caregiver' else 'patient' end;
  if p_booking is not null then
    select id into b from public.bookings where id = p_booking and (account_id = me or caregiver_id = me);
  end if;
  if p_photo is not null and p_photo not like me::text || '/%' then raise exception 'Bad photo'; end if;
  insert into public.support_tickets (from_user, from_kind, topic, message, booking_id, photo_path)
    values (me, kind, left(coalesce(nullif(trim(p_topic), ''), 'Something else'), 80), left(trim(p_message), 4000), b, p_photo)
    returning support_tickets.code into code;
  return code;
end $$;

-- SOS: an urgent report with the location (when the phone gave it), for the visit the person is on.
create or replace function public.sos_alert(p_booking uuid default null, p_lat double precision default null, p_lng double precision default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  kind text;
  code text;
  b public.bookings%rowtype;
  place text := 'Location not shared.';
begin
  if me is null then raise exception 'Sign in first'; end if;
  kind := case when exists (select 1 from public.caregivers where id = me) then 'caregiver' else 'patient' end;
  if p_booking is not null then
    select * into b from public.bookings where id = p_booking and (account_id = me or caregiver_id = me);
  end if;
  if p_lat between 6 and 37 and p_lng between 68 and 98 then
    place := 'Location: https://www.google.com/maps?q=' || round(p_lat::numeric, 6) || ',' || round(p_lng::numeric, 6);
  end if;
  -- One open SOS per person per 5 minutes: pressing again adds nothing new.
  select t.code into code from public.support_tickets t
    where t.from_user = me and t.topic = 'SOS' and t.status = 'open' and t.created_at > now() - interval '5 minutes' limit 1;
  if code is not null then return code; end if;
  insert into public.support_tickets (from_user, from_kind, topic, message, booking_id, urgent)
    values (me, kind, 'SOS', 'SOS pressed during a visit' || coalesce(' (' || b.code || ', ' || b.address_text || ')', '') || '. ' || place
      || ' Phone: +' || coalesce((select phone from public.profiles where id = me), '?'), b.id, true)
    returning support_tickets.code into code;
  return code;
end $$;

-- The person's own reports, with the team's replies.
create or replace function public.my_tickets() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'code', t.code, 'topic', t.topic, 'message', t.message, 'status', t.status,
      'urgent', t.urgent, 'at', t.created_at, 'booking', (select code from public.bookings where id = t.booking_id),
      'replies', coalesce((select jsonb_agg(jsonb_build_object('text', r.text, 'at', r.created_at) order by r.created_at)
        from public.ticket_replies r where r.ticket_id = t.id), '[]'::jsonb)) order by t.created_at desc), '[]'::jsonb)
  from (select * from public.support_tickets where from_user = auth.uid() order by created_at desc limit 30) t $$;

-- The team: all reports, newest and urgent first.
create or replace function public.admin_tickets(p_days int default 60) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(array['support']) then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'status') = 'open' desc, (x ->> 'urgent')::boolean desc, x ->> 'at' desc) from (
    select jsonb_build_object('id', t.id, 'code', t.code, 'from', t.from_kind, 'name', pr.full_name, 'phone', pr.phone, 'user_id', t.from_user,
      'topic', t.topic, 'message', t.message, 'urgent', t.urgent, 'status', t.status, 'at', t.created_at, 'photo_path', t.photo_path,
      'booking_id', t.booking_id, 'booking', (select code from public.bookings where id = t.booking_id),
      'replies', coalesce((select jsonb_agg(jsonb_build_object('text', r.text, 'at', r.created_at,
          'by', (select name from public.admin_users where id = r.author)) order by r.created_at)
        from public.ticket_replies r where r.ticket_id = t.id), '[]'::jsonb)) x
    from public.support_tickets t left join public.profiles pr on pr.id = t.from_user
    where t.created_at > now() - make_interval(days => p_days) or t.status = 'open'
  ) s), '[]'::jsonb);
end $$;

-- Reply (and optionally resolve). The person gets a notification with the reply.
create or replace function public.reply_ticket(p_ticket uuid, p_text text, p_resolve boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.support_tickets%rowtype;
begin
  if not public.is_admin(array['support']) then raise exception 'Not allowed'; end if;
  if length(trim(coalesce(p_text, ''))) < 2 then raise exception 'Write a reply'; end if;
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'Report not found'; end if;
  insert into public.ticket_replies (ticket_id, author, text) values (t.id, auth.uid(), left(trim(p_text), 4000));
  if p_resolve then update public.support_tickets set status = 'resolved' where id = t.id; end if;
  perform public.notify(t.from_user, 'support', public.msgv('Reply from support on {id}', jsonb_build_object('id', t.code)),
    to_jsonb(left(trim(p_text), 300)), case when t.from_kind = 'caregiver' then 'report' else 'help' end);
  insert into public.audit_log (actor, page, action, subject_id, detail)
    values (auth.uid(), 'support', case when p_resolve then 'replied_resolved' else 'replied' end, t.id, jsonb_build_object('ticket', t.code));
end $$;

create or replace function public.set_ticket_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(array['support']) then raise exception 'Not allowed'; end if;
  if p_status not in ('open', 'resolved') then raise exception 'Bad status'; end if;
  update public.support_tickets set status = p_status where id = p_ticket;
  if not found then raise exception 'Report not found'; end if;
  insert into public.audit_log (actor, page, action, subject_id, detail)
    values (auth.uid(), 'support', p_status, p_ticket, jsonb_build_object('ticket', (select code from public.support_tickets where id = p_ticket)));
end $$;

-- -----------------------------------------------------------------------------------------------------
-- 3. Real figures for the admin panel
-- -----------------------------------------------------------------------------------------------------
-- Patient accounts: everyone with a family list who is not on the team.
create or replace function public.admin_patients() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(array['support', 'finance']) then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'joined' desc) from (
    select jsonb_build_object('id', pr.id, 'name', pr.full_name, 'phone', pr.phone, 'joined', pr.created_at, 'lang', pr.lang,
      'city_id', (select city_id from public.addresses where account_id = pr.id order by created_at limit 1),
      'family', (select jsonb_agg(jsonb_build_object('name', p.name, 'relation', p.relation, 'age', p.age, 'gender', p.gender) order by p.relation <> 'Self', p.created_at)
        from public.patient_people p where p.account_id = pr.id),
      'bookings', (select count(*) from public.bookings where account_id = pr.id),
      'last_visit', (select max(start_at) from public.bookings where account_id = pr.id and status = 'completed'),
      'open_tickets', (select count(*) from public.support_tickets where from_user = pr.id and status = 'open'),
      'owed', (select coalesce(sum(due_amount), 0) from public.bookings where account_id = pr.id and due_amount > 0 and due_settled_by is null
        and status in ('cancelled', 'missed', 'completed'))) x
    from public.profiles pr
    where exists (select 1 from public.patient_people p where p.account_id = pr.id)
      and not exists (select 1 from public.admin_users a where a.id = pr.id)
  ) s), '[]'::jsonb);
end $$;

create or replace function public.admin_patient(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(array['support', 'finance']) then raise exception 'Not allowed'; end if;
  insert into public.audit_log (actor, page, action, subject_id) values (auth.uid(), 'patients', 'viewed', p_id);
  return (select jsonb_build_object('id', pr.id, 'name', pr.full_name, 'phone', pr.phone, 'joined', pr.created_at, 'consent_at', pr.consent_at, 'lang', pr.lang,
    'family', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'relation', p.relation, 'age', p.age, 'gender', p.gender) order by p.relation <> 'Self', p.created_at)
      from public.patient_people p where p.account_id = pr.id), '[]'::jsonb),
    'addresses', coalesce((select jsonb_agg(jsonb_build_object('label', a.label, 'line', a.line, 'area', a.area, 'city_id', a.city_id, 'pincode', a.pincode,
      'landmark', a.landmark, 'pinned', a.lat is not null) order by a.created_at) from public.addresses a where a.account_id = pr.id), '[]'::jsonb),
    'contact', (select jsonb_build_object('name', c.name, 'relation', c.relation, 'phone', c.phone) from public.emergency_contacts c where c.account_id = pr.id),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'status', b.status, 'service_id', b.service_id,
        'date', to_char(public.visit_date(b), 'YYYY-MM-DD'), 'slot', b.slot, 'total', public.visit_total(b), 'pay', b.pay,
        'patient', (select name from public.patient_people where id = b.person_id),
        'caregiver', (select full_name from public.profiles where id = b.caregiver_id), 'created_at', b.created_at) order by b.created_at desc)
      from (select * from public.bookings where account_id = pr.id order by created_at desc limit 50) b), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'topic', t.topic, 'status', t.status, 'urgent', t.urgent, 'at', t.created_at) order by t.created_at desc)
      from public.support_tickets t where t.from_user = pr.id), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('booking', b.code, 'amount', r.amount, 'reason', r.reason, 'at', coalesce(r.decided_at, r.created_at)) order by r.created_at desc)
      from public.refunds r join public.bookings b on b.id = r.booking_id where b.account_id = pr.id and r.status = 'approved'), '[]'::jsonb),
    'owed', (select coalesce(sum(due_amount), 0) from public.bookings where account_id = pr.id and due_amount > 0 and due_settled_by is null
        and status in ('cancelled', 'missed', 'completed')))
  from public.profiles pr where pr.id = p_id);
end $$;

-- Today at a glance.
create or replace function public.admin_dashboard() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  perform public.expire_offers();
  return jsonb_build_object(
    'waiting', (select count(*) from public.bookings where status = 'requested'),
    'waiting_long', (select count(*) from public.bookings where status = 'requested' and coalesce(searching_since, created_at) < now() - interval '15 minutes'),
    'in_progress', (select count(*) from public.bookings where status in ('accepted', 'en_route', 'arrived', 'in_progress')),
    'visits_today', (select count(*) from public.bookings where public.visit_date(bookings) = today and status not in ('cancelled')),
    'completed_today', (select count(*) from public.earnings where kind = 'visit' and (created_at at time zone 'Asia/Kolkata')::date = today),
    'cancelled_today', (select count(*) from public.bookings where status = 'cancelled' and (updated_at at time zone 'Asia/Kolkata')::date = today),
    'booked_today', (select count(*) from public.bookings where (created_at at time zone 'Asia/Kolkata')::date = today),
    'revenue_today', (select coalesce(sum(case when e.kind = 'visit' then public.visit_total(b) else b.visit_fee end), 0)
      from public.earnings e join public.bookings b on b.id = e.booking_id where (e.created_at at time zone 'Asia/Kolkata')::date = today),
    'revenue_7d', (select coalesce(sum(case when e.kind = 'visit' then public.visit_total(b) else b.visit_fee end), 0)
      from public.earnings e join public.bookings b on b.id = e.booking_id where e.created_at > now() - interval '7 days'),
    'online', (select count(*) from public.caregivers where online and kyc_status = 'approved' and suspended_at is null),
    'caregivers', (select count(*) from public.caregivers where kyc_status = 'approved'),
    'applicants', (select count(*) from public.caregivers where kyc_status = 'submitted'),
    'renewals', (select count(*) from public.kyc_documents where kind = 'renewal' and status = 'submitted'),
    'tickets_open', (select count(*) from public.support_tickets where status = 'open'),
    'sos_open', (select count(*) from public.support_tickets where status = 'open' and urgent),
    'refunds_due', (select count(*) from public.bookings where payment_status in ('paid', 'partly_refunded') and least(refund_amount, amount_paid) > public.refunded_total(id)),
    'patients', (select count(distinct account_id) from public.patient_people),
    'patients_7d', (select count(*) from public.profiles pr where pr.created_at > now() - interval '7 days' and exists (select 1 from public.patient_people p where p.account_id = pr.id)),
    'by_city', coalesce((select jsonb_object_agg(city_id, n) from (select city_id, count(*) n from public.bookings
      where created_at > now() - interval '30 days' group by city_id) c), '{}'::jsonb));
end $$;

-- Money by month (for the last p_months months), and each caregiver's earnings in one month.
-- Revenue = what patients paid for completed visits, plus the home visit charges kept (missed, late cancel, stopped).
create or replace function public.admin_report(p_months int default 6, p_month text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m date := coalesce(to_date(p_month || '-01', 'YYYY-MM-DD'), date_trunc('month', now() at time zone 'Asia/Kolkata')::date);
begin
  if not public.is_admin(array['finance']) then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'months', coalesce((select jsonb_agg(x order by x ->> 'month') from (
      select jsonb_build_object('month', to_char(mm, 'YYYY-MM'),
        'visits', (select count(*) from public.earnings e where e.kind = 'visit' and date_trunc('month', e.created_at at time zone 'Asia/Kolkata') = mm),
        'revenue', (select coalesce(sum(case when e.kind = 'visit' then public.visit_total(b) else b.visit_fee end), 0)
          from public.earnings e join public.bookings b on b.id = e.booking_id where date_trunc('month', e.created_at at time zone 'Asia/Kolkata') = mm),
        'caregiver_pay', (select coalesce(sum(e.amount), 0) from public.earnings e where date_trunc('month', e.created_at at time zone 'Asia/Kolkata') = mm),
        'refunds', (select coalesce(sum(r.amount), 0) from public.refunds r where r.status = 'approved' and date_trunc('month', coalesce(r.decided_at, r.created_at) at time zone 'Asia/Kolkata') = mm),
        'cancelled', (select count(*) from public.bookings b where b.status = 'cancelled' and date_trunc('month', b.created_at at time zone 'Asia/Kolkata') = mm),
        'new_patients', (select count(*) from public.profiles pr where date_trunc('month', pr.created_at at time zone 'Asia/Kolkata') = mm
          and exists (select 1 from public.patient_people p where p.account_id = pr.id))) x
      from generate_series(date_trunc('month', now() at time zone 'Asia/Kolkata') - make_interval(months => greatest(1, least(p_months, 24)) - 1),
        date_trunc('month', now() at time zone 'Asia/Kolkata'), interval '1 month') mm
    ) s), '[]'::jsonb),
    'month', to_char(m, 'YYYY-MM'),
    'caregivers', coalesce((select jsonb_agg(x order by (x ->> 'earned')::int desc) from (
      select jsonb_build_object('id', c.id, 'name', pr.full_name, 'phone', pr.phone, 'role', c.role,
        'visits', count(*) filter (where e.kind = 'visit'), 'earned', coalesce(sum(e.amount), 0), 'cash', coalesce(sum(e.cash), 0)) x
      from public.earnings e join public.caregivers c on c.id = e.caregiver_id join public.profiles pr on pr.id = c.id
      where date_trunc('month', e.created_at at time zone 'Asia/Kolkata') = m
      group by c.id, pr.full_name, pr.phone, c.role
    ) s), '[]'::jsonb));
end $$;

revoke execute on function public.send_ticket(text, text, uuid, text), public.sos_alert(uuid, double precision, double precision), public.my_tickets(),
  public.admin_tickets(int), public.reply_ticket(uuid, text, boolean), public.set_ticket_status(uuid, text), public.admin_patients(),
  public.admin_patient(uuid), public.admin_dashboard(), public.admin_report(int, text) from public, anon;
grant execute on function public.send_ticket(text, text, uuid, text), public.sos_alert(uuid, double precision, double precision), public.my_tickets(),
  public.admin_tickets(int), public.reply_ticket(uuid, text, boolean), public.set_ticket_status(uuid, text), public.admin_patients(),
  public.admin_patient(uuid), public.admin_dashboard(), public.admin_report(int, text) to authenticated;

select 'Launch functions are ready' as result;
