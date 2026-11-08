# Database (Supabase)

Project: `https://hglhijvvbbmmsjoakvfz.supabase.co` (region South Asia, Mumbai). Free plan.

| File | What it does | How to run |
| --- | --- | --- |
| `001_setup.sql` | Part 1: all tables, access rules (row level security), private file storage, starting lists and settings | Supabase → SQL Editor → New query → paste → Run. Safe to run again. |
| `002_first_owner.sql` | Makes the first owner of the admin panel (after their login is created in Authentication → Users → Add user) | Change the email and name, then Run. |
| `003_verification.sql` | Part 3 (version 1.2.0): caregiver sends for verification, admin approves or sends back, pause and resume, tier, renewals, messages to caregivers. Each is a database function that checks the role and writes the audit log. | SQL Editor → New query → paste → Run. Shows "Verification functions are ready". Safe to run again. |
| `004_bookings.sql` | Part 4 (version 1.3.0): real bookings. A request is offered to every verified, online caregiver who fits; the first to accept gets it. Visit steps, the arrival code, the visit record, cancelling and moving with the fee rule, ratings, earnings, and the team's Bookings page (give a visit to a caregiver, cancel). | SQL Editor → New query → paste → Run, after 003. Shows "Booking functions are ready". Safe to run again. |
| `005_payments.sql` | Part 5 (version 1.5.0): online payment with Razorpay (a booking paid online goes to caregivers once paid), refunds through Razorpay, "pay after the visit instead", the team's Refunds and Payouts pages. Also replaces six booking functions from part 4 with payment-aware versions, so **if you ever run 004 again, run 005 after it**. | SQL Editor → New query → paste → Run, after 004. Shows "Payment functions are ready". Safe to run again. |
| `006_notifications.sql` | Part 6 (version 1.6.0): notifications on the phone. Saves each phone's push address (`push_subscriptions`, each person sees only their own) and lets the "push" Edge Function take each notification once. | SQL Editor → New query → paste → Run, after 005. Shows "Notification tables are ready". Safe to run again. |
| `007_maps_calls.sql` | Part 7 (version 1.7.0): a pin on the map for each address, the caregiver's position while on the way (seen only by that patient, forgotten when care starts), and private calls between the patient and caregiver of a visit (who may call whom, at most 10 per visit, every call logged). | SQL Editor → New query → paste → Run, after 006. Shows "Maps and calls are ready". Safe to run again. **Run it before uploading 1.7.0.** |
| `008_launch.sql` | Part 8 (version 1.8.0): support reports from the apps (with photos) and replies from the team, SOS alerts with the location, real figures for the admin Dashboard, Patients and Reports, and the "Try the demo" switch. | SQL Editor → New query → paste → Run, after 007. Shows "Launch functions are ready". Safe to run again. |

**Phone sign-in for testing:** Authentication → Sign In / Providers → Phone → switch on, and add test numbers with fixed codes (for example `919876543210=123456`). No SMS is sent to test numbers. Real SMS needs DLT registration (India) and an SMS provider.

Version 1.4.0 (phase 6) needs no new file: the admin Settings page saves to the `settings`, `services`, `vital_checks`, `cities` and `city_areas` tables (owners only), and every app reads them.

## Online payment (version 1.5.0): the "payments" Edge Function

The Razorpay secret key must never be in the apps. It lives only in a small server program, `functions/payments/index.ts`, which runs in Supabase (an Edge Function). Setting it up, no command line needed:

1. **Razorpay keys.** Sign up at dashboard.razorpay.com. Stay in **Test mode** (no money moves). Account & Settings → API Keys → Generate Test Key. Keep the Key Secret private: you will paste it only into Supabase.
2. **Deploy the function.** Supabase → Edge Functions → Deploy a new function → Via Editor. Name it `payments`, replace the sample code with the whole of `functions/payments/index.ts`, and Deploy.
3. **Let Razorpay reach it.** In the function's Details (or Settings), switch OFF "Verify JWT" / "Enforce JWT verification". The function checks the sign-in itself.
4. **Secrets.** Edge Functions → Secrets → add `RAZORPAY_KEY_ID` (rzp_test_…), `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` (make up a long random password). If the function later says it is missing the service key, also add `SERVICE_ROLE_KEY` with your project's secret key (sb_secret_…) — only here, never in GitHub or a chat.
5. **Webhook.** Razorpay → Account & Settings → Webhooks → Add: URL `https://hglhijvvbbmmsjoakvfz.supabase.co/functions/v1/payments`, the same webhook secret, events `payment.captured` and `payment.failed`. This confirms payments even if the patient's phone closes.
6. **Run `005_payments.sql`**, then in the admin panel: Settings → Payments → switch on → Save.

Test with Razorpay's test details (for UPI, the ID `success@razorpay`). For real money, complete Razorpay's business verification, generate **Live** keys, and replace the two key secrets (and the webhook in live mode).

Payouts to caregivers are bank transfers you send yourself; the Payouts page shows what to send and records the bank reference (UTR).

## Notifications on the phone (version 1.6.0): the "push" Edge Function

Every notification the apps show (new request, accepted, on the way, arrived, visit record, cancelled, payout, verification decisions, team messages) can also ring the phone when the app is closed. No outside service or account is needed (standard Web Push). Steps, also shown in the admin panel under Settings → Notifications and SMS:

1. **Run `006_notifications.sql`.**
2. **Make the keys** in the admin panel (Settings → Notifications and SMS → Make push keys). Copy both into Edge Functions → Secrets as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, and add `VAPID_SUBJECT` = `mailto:your-support-email`. The private key is shown once and is not saved anywhere else.
3. **Deploy the function.** Edge Functions → Deploy a new function → Via Editor → name `push` → paste `functions/push/index.ts` → Deploy. In its settings switch OFF "Verify JWT".
4. **Database webhook.** Database → Webhooks → Create a new hook: table `notifications`, event Insert, type "Supabase Edge Functions", function `push`, method POST.
5. **Each person switches it on** in their Profile (the caregiver app also asks on the Jobs screen while online; the patient app while finding a nurse). Android: works in Chrome, best when the app is installed. iPhone: only after "Add to Home Screen" (iOS 16.4 or newer).

The notification arrives as a key and values and is shown in the person's language (`/push-strings.json`, built with the site). A phone that is switched off or unsubscribed is removed automatically. Log out removes the phone's address for that person.

## Sign-in codes by SMS (real phone numbers)

Until this is done, only test numbers can sign in. In India every SMS needs **DLT registration** (a sender ID and an OTP template, on the Jio, Airtel or Vi DLT portal; about 1–2 weeks). Then either:
- **Built-in:** Authentication → Sign In / Providers → Phone → choose Twilio, MessageBird, Vonage or Textlocal and enter that account's details (and the DLT template where asked); or
- **MSG91 (Indian, built around DLT):** deploy `functions/send-sms/index.ts` as `send-sms` (Verify JWT OFF), then Authentication → Hooks → Send SMS hook → HTTPS → `https://hglhijvvbbmmsjoakvfz.supabase.co/functions/v1/send-sms` → generate the secret → save. Secrets: `SEND_SMS_HOOK_SECRET` (the one from the hook, starting `v1,whsec_`), `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` (and `MSG91_OTP_VAR` if your template's variable is not `otp`). Full steps at the top of the file.

Remove the test numbers before launch.

## Maps and private calls (version 1.7.0)

**Maps** need no account: OpenStreetMap tiles and Leaflet. Patients pin the door (or use their phone's location) when adding an address; the caregiver's Directions open Google Maps to the pin; while on the way, the caregiver's phone shares its position about every 30 seconds and the patient sees it on a map. OpenStreetMap's free tiles are for light use: before launch, sign up with a tile provider (MapTiler or Stadia Maps have free starting plans) and add its tile address as `NEXT_PUBLIC_MAP_TILES` (and `NEXT_PUBLIC_MAP_ATTRIBUTION`) in the deploy workflow's build step.

**Private calls** go through Exotel, so neither person sees the other's number:
1. Exotel account (business KYC) and an ExoPhone (virtual number); ask them to enable connecting two numbers.
2. Run `007_maps_calls.sql`.
3. Deploy `functions/call/index.ts` as `call` (Verify JWT OFF; it checks the sign-in itself).
4. Secrets: `EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_CALLER_ID` (the ExoPhone), `EXOTEL_SUBDOMAIN` (`api.exotel.com`, or `api.in.exotel.com` for a Mumbai-region account).

Until the secrets are set, the Call buttons say private calls are coming soon and point to support.

## Ready for launch (version 1.8.0)

Run `008_launch.sql`. Then the admin panel's **Settings → Launch** shows a checklist that checks most steps by itself (database parts, keys, server programs) and lists the rest, and has the switch that hides "Try the demo" from all three login screens.

**Keys.** The project URL and the publishable key (`sb_publishable_…`) go into the apps; they are safe to be public because the access rules decide what each person can see. The secret key (`sb_secret_…`) and the database password must never be put in the apps, in GitHub, or in a chat.

**Tested** on PostgreSQL 16 with stand-ins for Supabase's sign-in and storage: each kind of person (visitor, two patients, two caregivers, owner, verification, support) can do only what the rules allow. Prices are set by the database, a prescription is required where the rules say, caregivers cannot approve themselves or go online before approval, and only the assigned caregiver sees the patient's address and prescription.
