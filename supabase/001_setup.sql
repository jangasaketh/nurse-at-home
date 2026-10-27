-- =====================================================================================================
-- NURSE AT HOME · DATABASE SETUP, PART 1 (version 1.0.9)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run.
-- It is safe to run again: it only adds what is missing and replaces the access rules.
--
-- What it creates:
--   1. Lists the apps read: cities and areas, services, vitals checks, settings (prices, rules, pay split)
--   2. People: profiles (one per phone or email sign-in), admin team, patient families and addresses,
--      caregivers with their qualification, bank account and verification documents
--   3. Work: bookings, job offers, visit records, reviews, earnings, payouts, payments, refunds
--   4. Communication: support tickets and replies, notifications, messages to caregivers
--   5. An audit log of every admin action
--   6. Private file storage for prescriptions, verification documents and ticket photos
--   7. Access rules (row level security): each person sees only their own data; the admin team sees what
--      their role needs; caregivers see a patient's details only for visits assigned to them
--
-- The business actions (accept a request, move a visit forward, cancel with the fee rule, pay out) come in
-- part 2, as database functions, so the rules cannot be bypassed from a phone.
-- =====================================================================================================

create extension if not exists pgcrypto;

grant usage on schema public to anon, authenticated;

-- -----------------------------------------------------------------------------------------------------
-- 1. LISTS THE APPS READ
-- -----------------------------------------------------------------------------------------------------

create table if not exists public.cities (
  id text primary key,                       -- 'hyd', 'blr', ...
  name text not null,
  state text not null,                       -- nurses register with this state's nursing council
  language text not null,                    -- main language of the city
  open boolean not null default false,       -- taking bookings
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.city_areas (
  id uuid primary key default gen_random_uuid(),
  city_id text not null references public.cities(id) on delete cascade,
  name text not null,
  unique (city_id, name)
);

create table if not exists public.services (
  id text primary key,                       -- 'inj', 'iv', ... or 'x-...' for services added by the team
  name text not null,
  short text not null default '',
  price int not null check (price > 0),      -- rupees per visit (vitals: the total of the checks chosen)
  mins text not null default '30 minutes',
  nurse_only boolean not null default false, -- rule 1: only registered nurses
  needs_prescription boolean not null default false, -- rule 2: cannot be booked without a prescription
  active boolean not null default true,
  icon text not null default 'heart',
  nurse_brings text not null default '',
  keep_ready text not null default '',
  includes text[] not null default '{}',
  custom boolean not null default false,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.vital_checks (
  id text primary key,
  name text not null,
  price int not null check (price > 0),
  sort int not null default 0
);

-- One row per group of settings. The admin panel's Settings page edits these.
create table if not exists public.settings (
  key text primary key,                      -- 'charges', 'cancel_rule', 'pay_split', 'time_limits'
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- -----------------------------------------------------------------------------------------------------
-- 2. PEOPLE
-- -----------------------------------------------------------------------------------------------------

-- One profile per sign-in (patients and caregivers by phone OTP, the admin team by email).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  email text,
  full_name text not null default '',
  lang text not null default 'en' check (lang in ('en', 'te', 'kn', 'ta', 'ml', 'mr', 'hi')),
  consent_at timestamptz,                    -- the single consent box (terms, privacy, health details)
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  id uuid primary key references public.profiles(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null check (role in ('owner', 'verification', 'support', 'finance')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Patient families: the account holder ("Self") and the people they book for.
create table if not exists public.patient_people (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  relation text not null default 'Self',
  age int check (age between 0 and 120),
  gender text check (gender in ('F', 'M', '')),
  created_at timestamptz not null default now()
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Home',
  line text not null,
  area text not null,
  city_id text not null references public.cities(id),
  pincode text not null check (pincode ~ '^[0-9]{6}$'),
  landmark text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.emergency_contacts (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  relation text not null,
  phone text not null
);

create table if not exists public.caregivers (
  id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('nurse', 'compounder')),
  tier text not null default 'full' check (tier in ('full', 'basic')),   -- basic = dressing and vitals only
  kyc_status text not null default 'draft' check (kyc_status in ('draft', 'submitted', 'approved', 'rejected')),
  rejected_step text check (rejected_step in ('personal', 'id', 'selfie', 'qualification', 'bank')),
  rejected_reason text,
  gender text check (gender in ('F', 'M')),
  dob date,
  languages text[] not null default '{}',
  city_id text references public.cities(id),
  area text,
  pincode text,
  online boolean not null default false,
  availability jsonb not null default '{}'::jsonb,  -- days, hours, radius, services, urgent
  suspended_reason text,
  suspended_at timestamptz,
  rating numeric(2,1),
  ratings_count int not null default 0,
  visits_done int not null default 0,
  agreed_at timestamptz,                     -- caregiver terms and code of conduct
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.caregiver_qualifications (
  caregiver_id uuid primary key references public.caregivers(id) on delete cascade,
  course text not null,
  council text not null default '',          -- state nursing council (nurses)
  reg_no text not null default '',
  years int not null default 0,
  valid_until date,                          -- nurses: registration valid until (end of month)
  ref_name text not null default '',         -- compounders: a doctor or clinic who can vouch
  ref_phone text not null default ''
);

create table if not exists public.caregiver_bank (
  caregiver_id uuid primary key references public.caregivers(id) on delete cascade,
  holder text not null,
  account_number text not null check (account_number ~ '^[0-9]{9,18}$'),
  ifsc text not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  upi text not null default ''
);

-- Each photo or PDF a caregiver sends. The file itself is in the private 'kyc' storage bucket.
create table if not exists public.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers(id) on delete cascade,
  kind text not null check (kind in ('id', 'selfie', 'certificate', 'renewal')),
  storage_path text not null,                -- '<caregiver id>/<file name>' in the 'kyc' bucket
  id_type text,                              -- for kind = 'id': aadhaar, pan, dl, voter, passport
  id_last4 text,                             -- Aadhaar: last 4 digits only
  valid_until date,                          -- for kind = 'renewal'
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'rejected')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.kyc_reviews (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers(id) on delete cascade,
  reviewer uuid references public.admin_users(id),
  decision text not null check (decision in ('approved', 'sent_back', 'renewal_approved', 'renewal_refused')),
  step text,
  reason text,
  tier text,
  checklist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------------------------------
-- 3. WORK
-- -----------------------------------------------------------------------------------------------------

create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,                -- '<account id>/<file name>' in the 'prescriptions' bucket
  kind text not null check (kind in ('image', 'pdf')),
  size_bytes int,
  created_at timestamptz not null default now()
);

create sequence if not exists public.booking_number start 10001;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('NH-' || nextval('public.booking_number')),
  account_id uuid not null references public.profiles(id),
  person_id uuid not null references public.patient_people(id),
  address_id uuid references public.addresses(id) on delete set null,
  address_text text not null,                -- copied at booking time
  city_id text not null references public.cities(id),
  service_id text not null references public.services(id),
  vital_ids text[] not null default '{}',
  start_at timestamptz not null,             -- first visit
  slot text not null,                        -- '9:00 AM' or 'within 60 minutes'
  urgent boolean not null default false,
  visits int not null default 1 check (visits between 1 and 30),
  every_days int not null default 1,
  visit_no int not null default 1,
  same_caregiver boolean not null default true,
  women_only boolean not null default false,
  language text,
  caregiver_id uuid references public.caregivers(id),
  prescription_id uuid references public.prescriptions(id),
  unit_price int not null default 0,         -- set by the database from the services list, never by the phone
  visit_fee int not null default 0,
  urgent_fee int not null default 0,
  pay text not null check (pay in ('upi', 'card', 'cash')),
  notify_contact boolean not null default false,
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'missed')),
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('patient', 'caregiver', 'admin')),
  cancel_reason text,
  fee_kept int not null default 0,
  refund_amount int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  caregiver_id uuid not null references public.caregivers(id) on delete cascade,
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'expired')),
  decline_reason text,
  unique (booking_id, caregiver_id)
);

create table if not exists public.visit_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  caregiver_id uuid not null references public.caregivers(id),
  visit_no int not null default 1,
  kind text not null check (kind in ('completed', 'missed', 'stopped')),
  note text not null default '',
  details jsonb not null default '[]'::jsonb,
  readings jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '{}'::jsonb, -- safety checks ticked before care
  cash_collected int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  caregiver_id uuid not null references public.caregivers(id),
  account_id uuid not null references public.profiles(id),
  stars int not null check (stars between 1 and 5),
  text text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.earnings (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers(id),
  booking_id uuid references public.bookings(id),
  kind text not null check (kind in ('visit', 'missed', 'late_cancel', 'stopped')),
  amount int not null,
  cash int not null default 0,               -- cash the caregiver collected (taken off the payout)
  created_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers(id),
  week_start date not null,
  amount int not null,
  reference text,                            -- bank UTR
  paid_at timestamptz,
  created_by uuid references public.admin_users(id),
  unique (caregiver_id, week_start)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  amount int not null,
  method text not null check (method in ('upi', 'card', 'cash')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  gateway_ref text,
  created_at timestamptz not null default now()
);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  requested_by uuid references public.profiles(id),
  reason text not null,
  asked int not null check (asked > 0),
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'declined')),
  amount int,
  note text,
  decided_by uuid references public.admin_users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------------------------------
-- 4. COMMUNICATION
-- -----------------------------------------------------------------------------------------------------

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('T-' || (floor(random() * 9000) + 1000)::int),
  from_user uuid not null references public.profiles(id),
  from_kind text not null check (from_kind in ('patient', 'caregiver')),
  topic text not null,
  message text not null,
  booking_id uuid references public.bookings(id),
  photo_path text,                           -- in the 'tickets' bucket
  urgent boolean not null default false,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author uuid references public.admin_users(id),
  text text not null,
  created_at timestamptz not null default now()
);

-- In-app notifications. Title and body are messages ({k, v}), so each reader sees them in their language.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title jsonb not null,
  body jsonb not null,
  target text,                               -- which screen opens when it is tapped
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  city_id text references public.cities(id),  -- null = all cities
  role text check (role in ('nurse', 'compounder')), -- null = both
  online_only boolean not null default false,
  recipients int not null default 0,
  sent_by uuid references public.admin_users(id),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------------------------------
-- 5. AUDIT LOG
-- -----------------------------------------------------------------------------------------------------

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid references public.admin_users(id),
  page text not null,                        -- verification, caregivers, bookings, refunds, settings, ...
  action text not null,                      -- approved, sent_back, paused, refunded, price_changed, ...
  subject_id uuid,                           -- the caregiver, booking or patient it was about
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for the lists the apps open most
create index if not exists bookings_account_idx on public.bookings (account_id, start_at desc);
create index if not exists bookings_caregiver_idx on public.bookings (caregiver_id, start_at desc);
create index if not exists bookings_status_idx on public.bookings (status, city_id, start_at);
create index if not exists offers_caregiver_idx on public.job_offers (caregiver_id, status);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists kyc_docs_caregiver_idx on public.kyc_documents (caregiver_id, created_at desc);
create index if not exists earnings_caregiver_idx on public.earnings (caregiver_id, created_at desc);
create index if not exists tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists audit_subject_idx on public.audit_log (subject_id, created_at desc);
create index if not exists caregivers_city_idx on public.caregivers (city_id, kyc_status, online);

-- -----------------------------------------------------------------------------------------------------
-- HELPERS USED BY THE ACCESS RULES
-- -----------------------------------------------------------------------------------------------------

-- The signed-in team member's role, or null for patients and caregivers.
create or replace function public.admin_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.admin_users where id = auth.uid() and active
$$;

-- True if the signed-in person is an active team member with one of these roles (owners always pass).
create or replace function public.is_admin(roles text[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid() and active and (roles is null or role = 'owner' or role = any(roles))
  )
$$;

-- True if this caregiver is assigned to a booking for this patient account.
create or replace function public.caregiver_serves(account uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings
    where account_id = account and caregiver_id = auth.uid() and status not in ('cancelled')
  )
$$;

-- Cross-table checks used by the rules. They run with full rights (security definer) so the rules do not
-- check each other in a loop; each one only answers yes or no about the signed-in person.
create or replace function public.owns_booking(b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings where id = b and account_id = auth.uid()) $$;
create or replace function public.assigned_booking(b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings where id = b and caregiver_id = auth.uid()) $$;
create or replace function public.offered_booking(b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.job_offers where booking_id = b and caregiver_id = auth.uid() and status = 'offered') $$;
create or replace function public.owns_person(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.patient_people where id = p and account_id = auth.uid()) $$;
create or replace function public.owns_prescription(r uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.prescriptions where id = r and account_id = auth.uid()) $$;
create or replace function public.caregiver_has_prescription(r uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings where prescription_id = r and caregiver_id = auth.uid() and status <> 'cancelled') $$;
create or replace function public.caregiver_has_file(path text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.prescriptions p join public.bookings b on b.prescription_id = p.id
    where p.storage_path = path and b.caregiver_id = auth.uid() and b.status <> 'cancelled'
  ) $$;
create or replace function public.patient_has_caregiver(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings where caregiver_id = c and account_id = auth.uid()) $$;
create or replace function public.can_review(b uuid, c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings where id = b and account_id = auth.uid() and status = 'completed' and caregiver_id = c) $$;
create or replace function public.owns_ticket(t uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.support_tickets where id = t and from_user = auth.uid()) $$;

-- A profile row for every new sign-in.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, email)
  values (new.id, new.phone, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at current.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists caregivers_touch on public.caregivers;
create trigger caregivers_touch before update on public.caregivers for each row execute function public.touch_updated_at();
drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();

-- A caregiver cannot approve, re-tier, un-pause or rate themselves. Only the verification team can.
create or replace function public.caregivers_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin(array['verification']) then return new; end if;
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

drop trigger if exists caregivers_guard on public.caregivers;
create trigger caregivers_guard before insert or update on public.caregivers
  for each row execute function public.caregivers_guard();

-- Prices are set by the database, never trusted from the phone. Prescriptions are required where the rule says.
create or replace function public.bookings_prepare() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  svc public.services%rowtype;
  charges jsonb;
begin
  select * into svc from public.services where id = new.service_id;
  if not found or not svc.active then raise exception 'This service is not offered'; end if;
  if svc.needs_prescription and new.prescription_id is null then
    raise exception 'A prescription is needed for this service';
  end if;
  if not exists (select 1 from public.cities where id = new.city_id and open) then
    raise exception 'We are not taking bookings in this city yet';
  end if;
  select value into charges from public.settings where key = 'charges';
  if new.service_id = 'vitals' then
    select coalesce(sum(price), 0) into new.unit_price from public.vital_checks where id = any(new.vital_ids);
    if new.unit_price = 0 then raise exception 'Choose at least one check'; end if;
  else
    new.unit_price := svc.price;
  end if;
  new.visit_fee := coalesce((charges->>'visitFee')::int, 49);
  new.urgent_fee := case when new.urgent then coalesce((charges->>'urgentFee')::int, 100) else 0 end;
  if not public.is_admin(array['support']) then
    new.status := 'requested';
    new.caregiver_id := null;
    new.fee_kept := 0;
    new.refund_amount := 0;
  end if;
  return new;
end $$;

drop trigger if exists bookings_prepare on public.bookings;
create trigger bookings_prepare before insert on public.bookings
  for each row execute function public.bookings_prepare();

-- -----------------------------------------------------------------------------------------------------
-- 7. ACCESS RULES (row level security)
-- -----------------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'cities', 'city_areas', 'services', 'vital_checks', 'settings', 'profiles', 'admin_users', 'patient_people',
    'addresses', 'emergency_contacts', 'caregivers', 'caregiver_qualifications', 'caregiver_bank', 'kyc_documents',
    'kyc_reviews', 'prescriptions', 'bookings', 'job_offers', 'visit_records', 'reviews', 'earnings', 'payouts',
    'payments', 'refunds', 'support_tickets', 'ticket_replies', 'notifications', 'broadcasts', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- Start clean, so running this file again replaces the rules instead of piling them up.
    execute (
      select coalesce(string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' '), '')
      from pg_policies where schemaname = 'public' and tablename = t
    );
  end loop;
end $$;

grant select on public.cities, public.city_areas, public.services, public.vital_checks, public.settings to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Lists: everyone can read; only owners change them.
create policy "anyone reads cities" on public.cities for select using (true);
create policy "owners change cities" on public.cities for all using (public.is_admin(array['owner'])) with check (public.is_admin(array['owner']));
create policy "anyone reads areas" on public.city_areas for select using (true);
create policy "owners change areas" on public.city_areas for all using (public.is_admin(array['owner'])) with check (public.is_admin(array['owner']));
create policy "anyone reads services" on public.services for select using (true);
create policy "owners change services" on public.services for all using (public.is_admin(array['owner'])) with check (public.is_admin(array['owner']));
create policy "anyone reads checks" on public.vital_checks for select using (true);
create policy "owners change checks" on public.vital_checks for all using (public.is_admin(array['owner'])) with check (public.is_admin(array['owner']));
create policy "anyone reads settings" on public.settings for select using (true);
create policy "owners change settings" on public.settings for all using (public.is_admin(array['owner'])) with check (public.is_admin(array['owner']));

-- Profiles: your own; the team sees everyone.
create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Admin team: each member sees their own row; owners manage the team.
create policy "see own team row" on public.admin_users for select using (id = auth.uid() or public.is_admin(array['owner']));
create policy "owners manage team" on public.admin_users for all using (public.is_admin(array['owner'])) with check (public.is_admin(array['owner']));

-- Patient family, addresses, emergency contact, prescriptions: the account holder; support; and the
-- caregiver of a visit for that account.
create policy "own family" on public.patient_people for all using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy "support sees families" on public.patient_people for select using (public.is_admin(array['support']));
create policy "caregiver sees the patient" on public.patient_people for select using (public.caregiver_serves(account_id));

create policy "own addresses" on public.addresses for all using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy "support sees addresses" on public.addresses for select using (public.is_admin(array['support']));
create policy "caregiver sees the address" on public.addresses for select using (public.caregiver_serves(account_id));

create policy "own contact" on public.emergency_contacts for all using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy "support sees contacts" on public.emergency_contacts for select using (public.is_admin(array['support']));

create policy "own prescriptions" on public.prescriptions for all using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy "support sees prescriptions" on public.prescriptions for select using (public.is_admin(array['support']));
create policy "caregiver sees the prescription" on public.prescriptions for select using (public.caregiver_has_prescription(id));

-- Caregivers: their own row (protected fields guarded above); the verification team manages; support
-- and finance can look. Patients see the caregiver assigned to their booking.
create policy "own caregiver row" on public.caregivers for select using (id = auth.uid());
create policy "become a caregiver" on public.caregivers for insert with check (id = auth.uid());
create policy "update own caregiver row" on public.caregivers for update using (id = auth.uid()) with check (id = auth.uid());
create policy "team sees caregivers" on public.caregivers for select using (public.is_admin(array['verification', 'support', 'finance']));
create policy "verification manages caregivers" on public.caregivers for update using (public.is_admin(array['verification'])) with check (public.is_admin(array['verification']));
create policy "patient sees their caregiver" on public.caregivers for select using (public.patient_has_caregiver(id));

create policy "own qualification" on public.caregiver_qualifications for all using (caregiver_id = auth.uid()) with check (caregiver_id = auth.uid());
create policy "verification sees qualifications" on public.caregiver_qualifications for select using (public.is_admin(array['verification', 'support']));
create policy "verification updates qualifications" on public.caregiver_qualifications for update using (public.is_admin(array['verification'])) with check (public.is_admin(array['verification']));

create policy "own bank" on public.caregiver_bank for all using (caregiver_id = auth.uid()) with check (caregiver_id = auth.uid());
create policy "team sees bank" on public.caregiver_bank for select using (public.is_admin(array['verification', 'finance']));

create policy "own documents" on public.kyc_documents for select using (caregiver_id = auth.uid());
create policy "send documents" on public.kyc_documents for insert with check (caregiver_id = auth.uid() and status = 'submitted');
create policy "verification sees documents" on public.kyc_documents for select using (public.is_admin(array['verification']));
create policy "verification reviews documents" on public.kyc_documents for update using (public.is_admin(array['verification'])) with check (public.is_admin(array['verification']));

create policy "own reviews of documents" on public.kyc_reviews for select using (caregiver_id = auth.uid());
create policy "verification records reviews" on public.kyc_reviews for all using (public.is_admin(array['verification'])) with check (public.is_admin(array['verification']));

-- Bookings: the patient makes and sees them; the assigned caregiver sees them; the team sees them.
-- Status changes by caregivers and patients go through database functions (part 2).
create policy "own bookings" on public.bookings for select using (account_id = auth.uid());
create policy "make a booking" on public.bookings for insert with check (
  account_id = auth.uid() and public.owns_person(person_id)
  and (prescription_id is null or public.owns_prescription(prescription_id))
);
create policy "caregiver sees assigned bookings" on public.bookings for select using (caregiver_id = auth.uid());
create policy "caregiver sees offered bookings" on public.bookings for select using (public.offered_booking(id));
create policy "team sees bookings" on public.bookings for select using (public.is_admin(array['support', 'finance']));
create policy "support changes bookings" on public.bookings for update using (public.is_admin(array['support'])) with check (public.is_admin(array['support']));

create policy "own offers" on public.job_offers for select using (caregiver_id = auth.uid());
create policy "team sees offers" on public.job_offers for select using (public.is_admin(array['support']));

create policy "caregiver writes records" on public.visit_records for insert with check (caregiver_id = auth.uid() and public.assigned_booking(booking_id));
create policy "caregiver sees own records" on public.visit_records for select using (caregiver_id = auth.uid());
create policy "patient sees records" on public.visit_records for select using (public.owns_booking(booking_id));
create policy "support sees records" on public.visit_records for select using (public.is_admin(array['support']));

create policy "patient rates a visit" on public.reviews for insert with check (account_id = auth.uid() and public.can_review(booking_id, caregiver_id));
create policy "patient sees own reviews" on public.reviews for select using (account_id = auth.uid());
create policy "caregiver sees reviews" on public.reviews for select using (caregiver_id = auth.uid());
create policy "team sees reviews" on public.reviews for select using (public.is_admin(array['verification', 'support']));

create policy "own earnings" on public.earnings for select using (caregiver_id = auth.uid());
create policy "finance sees earnings" on public.earnings for select using (public.is_admin(array['finance']));
create policy "own payouts" on public.payouts for select using (caregiver_id = auth.uid());
create policy "finance manages payouts" on public.payouts for all using (public.is_admin(array['finance'])) with check (public.is_admin(array['finance']));

create policy "own payments" on public.payments for select using (public.owns_booking(booking_id));
create policy "finance sees payments" on public.payments for select using (public.is_admin(array['finance', 'support']));

create policy "ask for a refund" on public.refunds for insert with check (requested_by = auth.uid() and status = 'waiting' and public.owns_booking(booking_id));
create policy "own refunds" on public.refunds for select using (requested_by = auth.uid());
create policy "team decides refunds" on public.refunds for all using (public.is_admin(array['support', 'finance'])) with check (public.is_admin(array['support', 'finance']));

-- Support
create policy "send a ticket" on public.support_tickets for insert with check (from_user = auth.uid() and status = 'open');
create policy "own tickets" on public.support_tickets for select using (from_user = auth.uid());
create policy "support manages tickets" on public.support_tickets for all using (public.is_admin(array['support'])) with check (public.is_admin(array['support']));

create policy "see replies to own tickets" on public.ticket_replies for select using (public.owns_ticket(ticket_id));
create policy "support replies" on public.ticket_replies for all using (public.is_admin(array['support'])) with check (public.is_admin(array['support']));

-- Notifications: you read (and mark read) your own; the team can send.
create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark own read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "team sends notifications" on public.notifications for insert with check (public.is_admin(array['verification', 'support', 'finance']));

create policy "team sends broadcasts" on public.broadcasts for all using (public.is_admin(array['verification', 'support'])) with check (public.is_admin(array['verification', 'support']));

create policy "team writes the log" on public.audit_log for insert with check (actor = auth.uid() and public.is_admin());
create policy "owners read the log" on public.audit_log for select using (public.is_admin(array['owner']));
create policy "team reads caregiver history" on public.audit_log for select using (public.is_admin(array['verification']) and page in ('verification', 'caregivers'));

-- -----------------------------------------------------------------------------------------------------
-- 6. PRIVATE FILE STORAGE
-- Files go in a folder named after the person's id: '<user id>/<file name>'.
-- -----------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('prescriptions', 'prescriptions', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('kyc', 'kyc', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('tickets', 'tickets', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nah upload own files" on storage.objects;
drop policy if exists "nah read own files" on storage.objects;
drop policy if exists "nah verification reads kyc" on storage.objects;
drop policy if exists "nah support reads prescriptions and tickets" on storage.objects;
drop policy if exists "nah caregiver reads the prescription" on storage.objects;

create policy "nah upload own files" on storage.objects for insert to authenticated with check (
  bucket_id in ('prescriptions', 'kyc', 'tickets') and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "nah read own files" on storage.objects for select to authenticated using (
  bucket_id in ('prescriptions', 'kyc', 'tickets') and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "nah verification reads kyc" on storage.objects for select to authenticated using (
  bucket_id = 'kyc' and public.is_admin(array['verification'])
);
create policy "nah support reads prescriptions and tickets" on storage.objects for select to authenticated using (
  bucket_id in ('prescriptions', 'tickets') and public.is_admin(array['support'])
);
create policy "nah caregiver reads the prescription" on storage.objects for select to authenticated using (
  bucket_id = 'prescriptions' and public.caregiver_has_file(name)
);

-- -----------------------------------------------------------------------------------------------------
-- STARTING DATA: the same lists and numbers the apps use today (placeholders until the owner decides)
-- -----------------------------------------------------------------------------------------------------

insert into public.cities (id, name, state, language, open, sort) values
  ('hyd', 'Hyderabad', 'Telangana', 'Telugu', true, 1),
  ('blr', 'Bengaluru', 'Karnataka', 'Kannada', true, 2),
  ('bom', 'Mumbai', 'Maharashtra', 'Marathi', true, 3),
  ('maa', 'Chennai', 'Tamil Nadu', 'Tamil', true, 4),
  ('trv', 'Thiruvananthapuram', 'Kerala', 'Malayalam', true, 5)
on conflict (id) do nothing;

insert into public.city_areas (city_id, name)
select c, a from (values
  ('hyd', 'Madhapur'), ('hyd', 'Kondapur'), ('hyd', 'Gachibowli'), ('hyd', 'Kukatpally'), ('hyd', 'Banjara Hills'), ('hyd', 'Ameerpet'),
  ('blr', 'Indiranagar'), ('blr', 'Koramangala'), ('blr', 'HSR Layout'), ('blr', 'Whitefield'), ('blr', 'Jayanagar'), ('blr', 'Malleswaram'),
  ('bom', 'Andheri West'), ('bom', 'Bandra West'), ('bom', 'Powai'), ('bom', 'Goregaon East'), ('bom', 'Dadar'), ('bom', 'Chembur'),
  ('maa', 'Adyar'), ('maa', 'T. Nagar'), ('maa', 'Velachery'), ('maa', 'Anna Nagar'), ('maa', 'Mylapore'), ('maa', 'Tambaram'),
  ('trv', 'Kowdiar'), ('trv', 'Pattom'), ('trv', 'Vazhuthacaud'), ('trv', 'Kazhakoottam'), ('trv', 'Sasthamangalam'), ('trv', 'Peroorkada')
) as v(c, a)
on conflict (city_id, name) do nothing;

insert into public.services (id, name, short, price, mins, nurse_only, needs_prescription, icon, sort) values
  ('inj', 'Injection at home', 'Into the muscle, vein or under the skin, as your doctor prescribed.', 250, '20 minutes', true, true, 'syringe', 1),
  ('iv', 'IV drip and fluids', 'Glucose, saline or prescribed medicine through a drip.', 600, '60 to 90 minutes', true, true, 'drop', 2),
  ('dress', 'Wound dressing', 'Cleaning and bandaging for cuts, burns, stitches and accident injuries.', 300, '30 minutes', false, false, 'bandage', 3),
  ('elder', 'Elder care dressing', 'Bedsore and ulcer dressing with a skin check, for people who cannot travel.', 350, '40 minutes', false, false, 'heart', 4),
  ('med', 'Scheduled medication', 'Timed doses given and written down, once or every day.', 200, '15 minutes', true, true, 'pill', 5),
  ('vitals', 'Vitals check', 'Blood pressure, sugar, temperature and oxygen, recorded for your doctor.', 30, '15 minutes', false, false, 'pulse', 6)
on conflict (id) do nothing;

insert into public.vital_checks (id, name, price, sort) values
  ('bp', 'Blood pressure', 50, 1), ('sugar', 'Blood sugar', 70, 2), ('temp', 'Temperature', 30, 3),
  ('spo2', 'Oxygen level (SpO2)', 40, 4), ('pulse', 'Pulse (heart rate)', 30, 5), ('weight', 'Weight and BMI', 30, 6)
on conflict (id) do nothing;

insert into public.settings (key, value) values
  ('charges', '{"visitFee": 49, "urgentFee": 100}'),
  ('cancel_rule', '{"graceMinutes": 5, "freeUntilHours": 2, "lateMinutes": 30, "noShowMinutes": 10}'),
  ('pay_split', '{"caregiverShare": 80, "visitFeeShare": 100, "urgentShare": 50, "payoutDay": 1}'),
  ('time_limits', '{"offerMinutes": 15, "offerMinutesUrgent": 3, "renewalWarnDays": 60}')
on conflict (key) do nothing;

-- Done. Check: Table Editor should list 29 tables, and Storage should show 3 private buckets.
select 'Nurse at Home database is ready: ' || count(*) || ' tables' as result
from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';
