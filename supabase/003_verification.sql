-- =====================================================================================================
-- NURSE AT HOME · DATABASE, PART 3: VERIFICATION (version 1.2.0)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Needs part 1 (001_setup.sql) first.
--
-- The actions of caregiver verification, as database functions. Each one checks who is asking, makes all
-- its changes together, tells the caregiver (a notification in their language) and writes the audit log.
--   submit_verification()                     caregiver sends their documents for checking
--   review_caregiver(...)                     verification team approves (with a tier) or sends one step back
--   set_caregiver_pause(caregiver, reason)    pause with a reason, or reinstate (reason = null)
--   set_caregiver_tier(caregiver, tier)       all nurse services, or dressing and vitals only
--   review_renewal(document, approve, reason) a renewed registration certificate
--   remind_renewal(caregiver)                 "your registration expires soon"
--   send_broadcast(...)                       one message to many caregivers (city, role, online only)
-- =====================================================================================================

-- A notification whose title and body are messages ({ "k": English key, "v": values }), so the caregiver
-- app shows them in the caregiver's language.
create or replace function public.notify(p_user uuid, p_kind text, p_title jsonb, p_body jsonb, p_target text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, target) values (p_user, p_kind, p_title, p_body, p_target);
$$;
revoke execute on function public.notify(uuid, text, jsonb, jsonb, text) from public, anon, authenticated;

create or replace function public.msg(k text) returns jsonb language sql immutable as $$ select jsonb_build_object('k', k) $$;

-- Which document goes with which verification step.
create or replace function public.step_kind(step text) returns text language sql immutable as $$
  select case step when 'id' then 'id' when 'selfie' then 'selfie' when 'qualification' then 'certificate' else null end
$$;

-- -----------------------------------------------------------------------------------------------------
-- Caregiver: send for checking
-- -----------------------------------------------------------------------------------------------------
create or replace function public.submit_verification() returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.caregivers%rowtype;
  missing text[] := '{}';
begin
  select * into c from public.caregivers where id = auth.uid();
  if not found then raise exception 'Choose your role first'; end if;
  if c.kyc_status = 'submitted' then return; end if;
  if c.kyc_status = 'approved' then raise exception 'You are already verified'; end if;
  if c.gender is null or c.dob is null or c.city_id is null then missing := array_append(missing, 'personal'); end if;
  if not exists (select 1 from public.kyc_documents where caregiver_id = c.id and kind = 'id' and status <> 'rejected') then missing := array_append(missing, 'id'); end if;
  if not exists (select 1 from public.kyc_documents where caregiver_id = c.id and kind = 'selfie' and status <> 'rejected') then missing := array_append(missing, 'selfie'); end if;
  if not exists (select 1 from public.kyc_documents where caregiver_id = c.id and kind = 'certificate' and status <> 'rejected')
     or not exists (select 1 from public.caregiver_qualifications where caregiver_id = c.id) then missing := array_append(missing, 'qualification'); end if;
  if not exists (select 1 from public.caregiver_bank where caregiver_id = c.id) then missing := array_append(missing, 'bank'); end if;
  if array_length(missing, 1) > 0 then raise exception 'Missing: %', array_to_string(missing, ', '); end if;
  update public.caregivers
    set kyc_status = 'submitted', rejected_step = null, rejected_reason = null, agreed_at = coalesce(agreed_at, now())
    where id = c.id;
end $$;

-- -----------------------------------------------------------------------------------------------------
-- Verification team: approve or send back
-- -----------------------------------------------------------------------------------------------------
create or replace function public.review_caregiver(
  p_caregiver uuid, p_decision text, p_tier text default 'full', p_step text default null, p_reason text default null, p_checklist jsonb default '[]'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.caregivers%rowtype;
  t text;
  who text;
begin
  if not public.is_admin(array['verification']) then raise exception 'Only the verification team can do this'; end if;
  select * into c from public.caregivers where id = p_caregiver for update;
  if not found then raise exception 'Caregiver not found'; end if;
  if c.kyc_status <> 'submitted' then raise exception 'This caregiver is not waiting for checking'; end if;
  select full_name into who from public.profiles where id = p_caregiver;

  if p_decision = 'approved' then
    t := case when c.role = 'compounder' then 'basic' else coalesce(p_tier, 'full') end;
    update public.caregivers set kyc_status = 'approved', tier = t, rejected_step = null, rejected_reason = null where id = p_caregiver;
    update public.kyc_documents set status = 'accepted' where caregiver_id = p_caregiver and status = 'submitted' and kind <> 'renewal';
    insert into public.kyc_reviews (caregiver_id, reviewer, decision, tier, checklist) values (p_caregiver, auth.uid(), 'approved', t, coalesce(p_checklist, '[]'::jsonb));
    if c.role = 'nurse' and t = 'basic' then
      perform public.notify(p_caregiver, 'verified', public.msg('Approved for dressing and vitals visits'),
        public.msg('For now you get wound dressing, elder care dressing and vitals requests. We will tell you when injections and drips are added.'), 'jobs');
    else
      perform public.notify(p_caregiver, 'verified', public.msg('You are verified'), public.msg('Go online on the Jobs screen to start getting requests near you.'), 'jobs');
    end if;
    insert into public.audit_log (actor, page, action, subject_id, detail)
      values (auth.uid(), 'verification', 'approved', p_caregiver, jsonb_build_object('text', format('Approved %s (%s)', coalesce(nullif(who, ''), 'caregiver'), case when t = 'full' then 'all nurse services' else 'dressing and vitals' end), 'tier', t));

  elsif p_decision = 'sent_back' then
    if p_step not in ('personal', 'id', 'selfie', 'qualification', 'bank') then raise exception 'Choose which step to send back'; end if;
    if coalesce(length(trim(p_reason)), 0) < 10 then raise exception 'Write the reason (at least a sentence)'; end if;
    update public.caregivers set kyc_status = 'rejected', rejected_step = p_step, rejected_reason = trim(p_reason) where id = p_caregiver;
    update public.kyc_documents set status = 'rejected', reason = trim(p_reason)
      where caregiver_id = p_caregiver and kind = public.step_kind(p_step) and status = 'submitted';
    insert into public.kyc_reviews (caregiver_id, reviewer, decision, step, reason, checklist) values (p_caregiver, auth.uid(), 'sent_back', p_step, trim(p_reason), coalesce(p_checklist, '[]'::jsonb));
    perform public.notify(p_caregiver, 'document', public.msg('One document needs another look'), public.msg(trim(p_reason)), 'review');
    insert into public.audit_log (actor, page, action, subject_id, detail)
      values (auth.uid(), 'verification', 'sent_back', p_caregiver, jsonb_build_object('text', format('%s: %s',
        case p_step when 'personal' then 'Details' when 'id' then 'Government ID' when 'selfie' then 'Selfie' when 'qualification' then 'Qualification' else 'Bank account' end,
        trim(p_reason)), 'step', p_step));
  else
    raise exception 'Unknown decision';
  end if;
end $$;

-- -----------------------------------------------------------------------------------------------------
-- Verification team: pause or reinstate; change services
-- -----------------------------------------------------------------------------------------------------
create or replace function public.set_caregiver_pause(p_caregiver uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(array['verification']) then raise exception 'Only the verification team can do this'; end if;
  if not exists (select 1 from public.caregivers where id = p_caregiver) then raise exception 'Caregiver not found'; end if;
  if p_reason is not null then
    if length(trim(p_reason)) < 10 then raise exception 'Write the reason (at least a sentence)'; end if;
    update public.caregivers set suspended_reason = trim(p_reason), suspended_at = now(), online = false where id = p_caregiver;
    insert into public.audit_log (actor, page, action, subject_id, detail) values (auth.uid(), 'caregivers', 'paused', p_caregiver, jsonb_build_object('text', trim(p_reason)));
  else
    update public.caregivers set suspended_reason = null, suspended_at = null where id = p_caregiver;
    perform public.notify(p_caregiver, 'verified', public.msg('Your account is active again'), public.msg('Go online on the Jobs screen to start getting requests near you.'), 'jobs');
    insert into public.audit_log (actor, page, action, subject_id, detail) values (auth.uid(), 'caregivers', 'reinstated', p_caregiver, jsonb_build_object('text', 'Can take requests again'));
  end if;
end $$;

create or replace function public.set_caregiver_tier(p_caregiver uuid, p_tier text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(array['verification']) then raise exception 'Only the verification team can do this'; end if;
  if p_tier not in ('full', 'basic') then raise exception 'Unknown tier'; end if;
  update public.caregivers set tier = p_tier where id = p_caregiver and role = 'nurse';
  if not found then raise exception 'Only a registered nurse can have all nurse services'; end if;
  perform public.notify(p_caregiver, 'verified', public.msg('Your visits have changed'),
    case when p_tier = 'full' then public.msg('You can now take every nurse service, including injections, IV drips and medication.')
         else public.msg('For now you get wound dressing, elder care dressing and vitals requests. We will tell you when injections and drips are added.') end, 'jobs');
  insert into public.audit_log (actor, page, action, subject_id, detail)
    values (auth.uid(), 'caregivers', 'tier', p_caregiver, jsonb_build_object('text', case when p_tier = 'full' then 'All nurse services' else 'Dressing and vitals only' end, 'tier', p_tier));
end $$;

-- -----------------------------------------------------------------------------------------------------
-- Registration renewals
-- -----------------------------------------------------------------------------------------------------
create or replace function public.review_renewal(p_document uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.kyc_documents%rowtype;
begin
  if not public.is_admin(array['verification']) then raise exception 'Only the verification team can do this'; end if;
  select * into d from public.kyc_documents where id = p_document and kind = 'renewal' for update;
  if not found or d.status <> 'submitted' then raise exception 'This renewal is not waiting for checking'; end if;
  if p_approve then
    update public.kyc_documents set status = 'accepted' where id = p_document;
    update public.caregiver_qualifications set valid_until = d.valid_until where caregiver_id = d.caregiver_id;
    insert into public.kyc_reviews (caregiver_id, reviewer, decision) values (d.caregiver_id, auth.uid(), 'renewal_approved');
    perform public.notify(d.caregiver_id, 'verified', public.msg('Registration renewed'),
      jsonb_build_object('k', 'Your registration is now valid until {month}.', 'v', jsonb_build_object('month',
        jsonb_build_object('j', jsonb_build_array(public.msg(to_char(d.valid_until, 'Mon')), to_char(d.valid_until, 'YYYY')), 's', ' '))), 'profile');
    insert into public.audit_log (actor, page, action, subject_id, detail)
      values (auth.uid(), 'verification', 'renewal_approved', d.caregiver_id, jsonb_build_object('text', 'Valid until ' || to_char(d.valid_until, 'Mon YYYY')));
  else
    if coalesce(length(trim(p_reason)), 0) < 10 then raise exception 'Write the reason (at least a sentence)'; end if;
    update public.kyc_documents set status = 'rejected', reason = trim(p_reason) where id = p_document;
    insert into public.kyc_reviews (caregiver_id, reviewer, decision, reason) values (d.caregiver_id, auth.uid(), 'renewal_refused', trim(p_reason));
    perform public.notify(d.caregiver_id, 'document', public.msg('Renewal not accepted'), public.msg(trim(p_reason)), 'renew');
    insert into public.audit_log (actor, page, action, subject_id, detail)
      values (auth.uid(), 'verification', 'renewal_refused', d.caregiver_id, jsonb_build_object('text', trim(p_reason)));
  end if;
end $$;

create or replace function public.remind_renewal(p_caregiver uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(array['verification']) then raise exception 'Only the verification team can do this'; end if;
  perform public.notify(p_caregiver, 'document', public.msg('Your registration expires soon'),
    public.msg('Send your renewed certificate so you keep getting injection and drip requests.'), 'renew');
  insert into public.audit_log (actor, page, action, subject_id, detail) values (auth.uid(), 'verification', 'reminder', p_caregiver, jsonb_build_object('text', 'Registration expires soon'));
end $$;

-- -----------------------------------------------------------------------------------------------------
-- Messages to caregivers (shown as written)
-- -----------------------------------------------------------------------------------------------------
create or replace function public.send_broadcast(p_title text, p_body text, p_city text default null, p_role text default null, p_online_only boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not public.is_admin(array['verification', 'support']) then raise exception 'Not allowed'; end if;
  if length(trim(p_title)) < 3 or length(trim(p_body)) < 10 then raise exception 'Write a title and a message'; end if;
  insert into public.notifications (user_id, kind, title, body, target)
    select c.id, 'message', to_jsonb(trim(p_title)), to_jsonb(trim(p_body)), 'jobs'
    from public.caregivers c
    where c.kyc_status = 'approved' and c.suspended_at is null
      and (p_city is null or c.city_id = p_city) and (p_role is null or c.role = p_role) and (not p_online_only or c.online);
  get diagnostics n = row_count;
  insert into public.broadcasts (title, body, city_id, role, online_only, recipients, sent_by)
    values (trim(p_title), trim(p_body), p_city, p_role, p_online_only, n, auth.uid());
  insert into public.audit_log (actor, page, action, detail)
    values (auth.uid(), 'messages', 'broadcast', jsonb_build_object('text', format('Sent “%s” to %s caregivers', trim(p_title), n)));
  return n;
end $$;

-- Only signed-in people can call these; each function checks the role itself.
revoke execute on function public.submit_verification() from public, anon;
revoke execute on function public.review_caregiver(uuid, text, text, text, text, jsonb) from public, anon;
revoke execute on function public.set_caregiver_pause(uuid, text) from public, anon;
revoke execute on function public.set_caregiver_tier(uuid, text) from public, anon;
revoke execute on function public.review_renewal(uuid, boolean, text) from public, anon;
revoke execute on function public.remind_renewal(uuid) from public, anon;
revoke execute on function public.send_broadcast(text, text, text, text, boolean) from public, anon;
grant execute on function public.submit_verification(), public.review_caregiver(uuid, text, text, text, text, jsonb),
  public.set_caregiver_pause(uuid, text), public.set_caregiver_tier(uuid, text), public.review_renewal(uuid, boolean, text),
  public.remind_renewal(uuid), public.send_broadcast(text, text, text, text, boolean) to authenticated;

select 'Verification functions are ready' as result;
