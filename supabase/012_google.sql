-- =====================================================================================================
-- NURSE AT HOME · DATABASE, PART 12: CONTINUE WITH GOOGLE (version 2.1.0)
--
-- How to run: Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- Needs parts 1 to 11 first.
--
--   1. A new account made with Google gets the name from Google (the person can change it).
--   2. People who sign in with Google have no mobile number yet. The apps ask for it once, because
--      caregivers, SOS and our team need a number to call. A number given this way is not checked by SMS,
--      so it can only be set when the account has no SMS-checked number.
-- =====================================================================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, email, full_name)
  values (new.id, nullif(new.phone, ''), new.email,
          left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 80))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Save the mobile number of a Google account: 10 digits, starting 6 to 9. Stored as 91XXXXXXXXXX, like SMS sign-ins.
create or replace function public.set_my_phone(p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  checked text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(d) = 12 and left(d, 2) = '91' then d := substr(d, 3); end if;
  if d !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a 10-digit mobile number'; end if;
  select nullif(phone, '') into checked from auth.users where id = auth.uid();
  if checked is not null then raise exception 'This account signs in with its mobile number, which cannot be changed here'; end if;
  update public.profiles set phone = '91' || d where id = auth.uid();
  return '91' || d;
end $$;
revoke execute on function public.set_my_phone(text) from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;

-- Does my account still need a mobile number? (Google accounts, until they give one.)
create or replace function public.my_phone() returns text
language sql stable security definer set search_path = public as $$
  select nullif(phone, '') from public.profiles where id = auth.uid() $$;
revoke execute on function public.my_phone() from public, anon;
grant execute on function public.my_phone() to authenticated;

-- The phone column is set only through set_my_phone (or SMS sign-in), never by a plain update from the apps.
create or replace function public.profiles_phone_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.phone is distinct from old.phone and current_user in ('authenticated', 'anon') then
    new.phone := old.phone;
  end if;
  return new;
end $$;
drop trigger if exists profiles_phone_guard on public.profiles;
create trigger profiles_phone_guard before update on public.profiles
  for each row execute function public.profiles_phone_guard();
revoke execute on function public.profiles_phone_guard() from public, anon, authenticated;

select 'Continue with Google is ready' as result;
