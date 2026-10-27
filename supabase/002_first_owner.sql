-- =====================================================================================================
-- NURSE AT HOME · MAKE THE FIRST OWNER (version 1.1.0). Run once.
--
-- Before this: Supabase → Authentication → Users → Add user → Create new user
--   Email: your work email · Password: a strong one (at least 6 characters) · tick "Auto confirm user"
--
-- Then: change the email and name on the two lines marked  <-- CHANGE  below, and press Run.
-- After this, sign in to the admin panel (/admin/) with that email and password. Add the rest of the team
-- from the admin panel's Team page (each person first needs a login made the same way).
-- =====================================================================================================

insert into public.admin_users (id, email, name, role)
select id, lower(email), 'Your Name', 'owner'          -- <-- CHANGE 'Your Name'
from auth.users
where lower(email) = lower('you@example.com')          -- <-- CHANGE to the email you used above
on conflict (id) do update set role = 'owner', active = true, name = excluded.name;

-- Should show one row with role = owner. If it shows nothing, the email does not match the login.
select email, name, role, active from public.admin_users;
