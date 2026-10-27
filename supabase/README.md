# Database (Supabase)

Project: `https://hglhijvvbbmmsjoakvfz.supabase.co` (region South Asia, Mumbai). Free plan.

| File | What it does | How to run |
| --- | --- | --- |
| `001_setup.sql` | Part 1: all tables, access rules (row level security), private file storage, starting lists and settings | Supabase → SQL Editor → New query → paste → Run. Safe to run again. |
| `002_first_owner.sql` | Makes the first owner of the admin panel (after their login is created in Authentication → Users → Add user) | Change the email and name, then Run. |

**Phone sign-in for testing:** Authentication → Sign In / Providers → Phone → switch on, and add test numbers with fixed codes (for example `919876543210=123456`). No SMS is sent to test numbers. Real SMS needs DLT registration (India) and an SMS provider.

Coming next: the business actions (accept a request, move a visit forward, cancel with the fee rule, payouts) as database functions.

**Keys.** The project URL and the publishable key (`sb_publishable_…`) go into the apps; they are safe to be public because the access rules decide what each person can see. The secret key (`sb_secret_…`) and the database password must never be put in the apps, in GitHub, or in a chat.

**Tested** on PostgreSQL 16 with stand-ins for Supabase's sign-in and storage: each kind of person (visitor, two patients, two caregivers, owner, verification, support) can do only what the rules allow. Prices are set by the database, a prescription is required where the rules say, caregivers cannot approve themselves or go online before approval, and only the assigned caregiver sees the patient's address and prescription.
