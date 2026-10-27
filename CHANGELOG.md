# Version history

Each update gets the next version number: 1.0.1, 1.0.2, 1.0.3 and so on.
For every version, these all carry the same number:

- `version` in `package.json` (also shown at the bottom of Profile in the app)
- this file, with a short entry at the top
- the code zip: `nurse-at-home-v1.0.1.zip`
- the project docs (plan, status, reminders), each with a "Version" line, and a copy kept under `claude/versions/v1.0.1/`

---

## 1.2.0 (27 Oct 2026)

**Backend, phases 3 and 4: caregiver documents and real verification**
- **Caregiver app (signed in):** "Send for verification" now uploads the photos and PDFs (ID, selfie, certificate, qualification, bank proof) to private storage and saves the details to the account. A short "Sending your documents…" shows while it works; if the internet drops, the documents stay on the phone and can be sent again. A PDF added before a page reload has to be added again (the app says so).
- **The decision comes back by itself:** the app checks every 15 seconds (and when it is opened again) and shows approved, sent back (with the step to fix and the reason), paused or resumed, and new messages from the team. Fixing a sent-back step sends only that step again.
- **Renewals:** a new registration certificate goes to the team for checking, and the answer comes back to the app.
- **Admin panel (signed in):** Verification shows real applicants with their real photos and PDFs (private links that last a short time). Approve with a tier, or send back one step with a reason. The Caregivers page shows real caregivers: documents on file, history, pause and resume, change what they can take. Renewals can be approved, refused or reminded. Messages are sent to real caregivers (by city, role, online now).
- **Safe in the database:** each decision is a database function that checks the person's role, writes the audit log and sends the caregiver a notice. Caregivers still cannot approve themselves or change their own tier.
- `supabase/003_verification.sql`: the new database functions, to run once after 001 and 002.
- New text in Telugu and Kannada (`lib/i18n/strings-11.ts`).
- The demo works as before.

---

## 1.1.0 (26 Oct 2026)

**Backend, phase 2: real sign-in**
- **Patient app:** sign in with your mobile number and a 6-digit code (sent by SMS, or the fixed code of a test number set in Supabase). Wrong or expired codes, too many tries, no internet, and "SMS not switched on yet" each get a clear message; a new code can be asked for after 60 seconds.
- **Saved to the account:** name, the consent (with its date and time), language, family members, addresses and emergency contact are saved to the database and come back on any phone that signs in with the same number. Profile shows "Saved to your account" (or that it will try again). Log out signs out and clears the phone.
- **Caregiver app:** the same phone sign-in. The role and "Your details" (name, gender, date of birth, languages, city, area, PIN) are saved to the account and come back on another phone. Documents, bank account and the verification decision stay on the phone until phases 3 and 4.
- **Admin panel:** sign in with a real email and password. Only people in the team list (`admin_users`) get in; switched-off members are refused. Their role decides the menu. The Team page reads and changes the real team (add someone who has a login, change role, switch access off and on), and each change is written to the audit log in the database. Other pages still show sample data, with a note saying so.
- **The demo stays:** each login screen has "Try the demo (sample data, no account)". The demo works as before and saves nothing to the database.
- `supabase/002_first_owner.sql`: makes the first owner after their login is created in Supabase.
- New text in Telugu and Kannada (`lib/i18n/strings-10.ts`).
- The sample nurse's registration date (skip verification) now always falls inside the 60-day reminder window.

---

## 1.0.9 (26 Oct 2026)

**Backend, phase 1: the database**
- New folder `supabase/` with `001_setup.sql`, the database for all three apps, to run once in the Supabase project (`hglhijvvbbmmsjoakvfz`, Mumbai region).
- 29 tables: cities and areas, services, vitals checks, settings; profiles, admin team, patient families, addresses, emergency contacts, prescriptions; caregivers with qualification, bank account, verification documents and reviews; bookings, job offers, visit records, reviews, earnings, payouts, payments, refunds; support tickets and replies, notifications, messages to caregivers; audit log.
- Access rules (row level security) on every table: each person sees only their own data, the admin team sees what their role needs, and caregivers see a patient's family, address and prescription only for visits assigned to them.
- Safety rules in the database itself: prices are set from the services list (a phone cannot change them), a prescription is required where the rules say, a city must be open, caregivers cannot approve themselves, change their tier or rating, or go online before approval or while paused.
- Private file storage: `prescriptions`, `kyc` and `tickets` buckets, each person uploading only into their own folder.
- Starting data: the 5 cities with their areas, the 6 services, the vitals checks and today's settings (charges, cancellation rule, pay split, time limits).
- The apps are not connected yet; that starts with phase 2 (sign-in).

---

## 1.0.8 (12 Oct 2026)

**Admin panel: seven additions**
1. **Patients:** a new page listing patient accounts. Search by name, phone or a family member’s name; filter by city, open complaints or unpaid charges. Each patient shows their family members (with visits each), addresses, emergency contact, bookings (open any booking from there), complaints and refunds. The patient signed in to the patient app in the same browser appears too, marked "Live · patient app".
2. **Services, beyond prices:** in Settings → Services and prices you can switch a service off, choose who can do it (nurses only, or nurses and compounders), set whether a prescription is needed, and add a new service (name, description, price, length, icon, what is brought and kept ready, what is included). Injections, IV drips and medication stay nurse-only with a prescription. **Live in the demo:** the patient app shows new services and hides switched-off ones; caregivers stop getting requests for switched-off services.
3. **Areas inside each city:** Settings → Cities and areas lists each city’s areas, with add and remove. New cities start with no areas, and a city cannot open until it has at least one.
4. **Team and roles (screens only):** a Team page (owners only) to add people, change their role, or switch off their access. Roles: owner (everything), verification team, support team, finance team, each seeing only its own pages. Signing in with a team member’s email gives their role; a switched-off person cannot sign in. "Prototype: view as" in the top bar switches roles for testing. The activity log now records who did each thing.
5. **Reports:** a new page with the last 6 months: what patients paid, what caregivers earned, refunds, net income, a chart by month, by city, by service, each caregiver’s earnings, and a GST summary (placeholder 18% on our share, to be confirmed by a chartered accountant). Download each month as CSV. This month uses the sample bookings; earlier months are sample totals.
6. **Messages to caregivers:** a new page to send one notice to everyone in a city, only nurses or compounders, or only those online. Shows how many will get it and a preview, asks to confirm, keeps a list of sent messages. Ready-made messages (busy evening, Diwali, heavy rain, bank holiday). The caregiver app in the same browser receives it in its notifications.
7. **Caregiver history:** each caregiver’s panel now shows their documents on file (ID, selfie, certificate, and a renewed certificate waiting) and a history of documents sent, send-backs, approval, service changes, pauses, reinstatements, renewals and reminders, with filters. Decisions made while someone was still an applicant carry over once they are approved.

**Also**
- Bookings and caregiver pages show the right names for services switched off or added, and for cities added in Settings.
- Only the panel on top closes with Escape (for example a booking opened from a patient).
- Caregiver app: team messages appear in notifications with their own icon.
- Every admin page, including the new ones, passes the text-contrast check.

---

## 1.0.7 (11 Oct 2026)

**Admin panel: colours fixed**
- The sign-in page lost its colours: the card was see-through and the text, Sign in button and note were hard to read on the dark green background. The admin colours now apply to the sign-in and loading screens too, so the card is white with dark text and a green Sign in button.
- The red count on Support in the side menu is a darker red, so the white number is easy to read.
- Every admin screen, side panel and settings tab was checked automatically for text contrast (at least 4.5 to 1, the usual accessibility standard), on a computer and on a phone. All pass.

---

## 1.0.6 (11 Oct 2026)

**New: the admin panel**, at `/admin/` on the same site, for the Nurse at Home team. English only, made for a computer screen (it also works on a phone). Sign in with any email and password (prototype).
- **Dashboard:** visits today, money collected and what we keep, cancellations, caregivers online, a "waiting for the team" list, bookings for the last 7 days, cities and services.
- **Verification:** caregivers waiting, with how long they have waited. Review the ID, selfie and certificate, the details, automatic checks (age, IFSC, bank name, registration date) and a checklist. Approve with "All nurse services" or "Dressing and vitals only, for now", or send one document back with a reason. Also: documents sent back, approved, renewed registrations to check, and registrations expiring soon (send a reminder).
- **Caregivers:** everyone verified, with filters. Change what a nurse can take, pause (suspend) with a reason, reinstate.
- **Bookings:** all bookings (sample), with filters and search. Reassign a caregiver, cancel (refunded in full), or give a refund. Shows what the patient pays, what the caregiver gets and what we keep.
- **Refunds:** patients' requests, with a hint from the rules. Approve all or part, or decline with a reason.
- **Support:** tickets from patients and caregivers, urgent first, ready-made replies, close and reopen.
- **Payouts:** this week per caregiver (earned, cash collected, to pay), cash owed to us, send payouts, download a bank file (CSV), past weeks.
- **Settings:** service and vitals-check prices, home visit and urgent charges, the cancellation rule, the pay split (with a worked example), time limits to answer, renewal reminder, cities (pause, add).
- **Activity log:** every decision, with a CSV download, and "start the sample data again".

**The admin panel is connected to the caregiver app (same browser, until there is a server)**
- A caregiver who sends documents in the caregiver app appears in Verification, marked "Live · caregiver app".
- Approving, sending back, changing services, pausing, reinstating, approving or refusing a renewal, replying to a report and paying out all show in the caregiver app straight away, with a notification.
- Service and vitals-check prices set in Settings are used by the patient and caregiver apps opened in the same browser. The other settings are saved for when the server is connected.

**Caregiver app**
- Any of the five verification steps can now be sent back (before, only the ID photo). The step shows "Needs a new photo" or "Needs a change".
- Approved for dressing and vitals only: nurses get only those requests until the team changes it.
- "Your account is paused" screen with the reason, while still letting the caregiver reach help, reports and notifications.
- Replies from support show under "Your reports".
- The waiting screen links to the admin panel (prototype).
- New text in Telugu and Kannada (`lib/i18n/strings-9.ts`).

**Also**
- The offline support leaves the admin panel alone (it always loads fresh).

---

## 1.0.5 (11 Oct 2026)

Includes everything in 1.0.4 (the "Prototype: skip verification" button), which was not published on its own.

**Caregiver app: seven new pieces**
1. **Notifications:** a bell with an unread count on Jobs, and a notifications screen (also in Profile). New request, request ran out of time, patient cancelled, payout sent, registration expiring, rating received, verified, report received. Tapping one opens the right screen.
2. **Ratings and reviews:** average, star breakdown, what patients mention most, and each review. A rating arrives after each finished visit (sample). Profile shows the real average.
3. **Report a problem:** topic, optional visit, description, optional photo; a ticket number and a "Your reports" list. From Help and Profile.
4. **Payout history and monthly statement:** past Monday payouts with bank references; a monthly summary for the last 3 months; download the statement as a CSV file for Excel or Google Sheets.
5. **Time limit to answer a request:** a countdown on each request (3 minutes for urgent, 15 for others; placeholders). When it runs out, the request goes to someone else and the next one is offered.
6. **When a patient cancels:** a screen with the reason, and whether the Rs 49 visit charge is paid (late: less than 2 hours before, or after setting off) or not (early).
7. **Registration renewal:** nurses enter "registration valid until" when they sign up. From 60 days before, a banner and a notification remind them; after it lapses, they only get dressing and vitals requests until they renew. A renew screen takes the new certificate and date (prototype button approves it).

**Also**
- Jobs header fixed so the bell is never cut off on small phones.
- All new text in Telugu and Kannada (`lib/i18n/strings-8.ts`).

---

## 1.0.4 (11 Oct 2026)

- Caregiver app, for testing: a **"Prototype: skip verification"** button on the "Get verified" checklist. It fills sample details and documents for any step not done yet (keeping anything already filled, such as your own name and city) and approves you straight away, so every caregiver screen can be tried in a few taps.
- The sample caregiver is a woman nurse (or compounder, if that role was chosen) in Hyderabad, so woman-only requests are included.
- Remove the button before launch (search for "Prototype" in `components/caregiver/SignupScreens.tsx`).

---

## 1.0.3 (11 Oct 2026)

- Fix: the caregiver app could not be found from the patient app's first screen. The patient login screen now has a link, "Are you a nurse or compounder? Work with us", that opens the caregiver app. (Before, the only link was inside Profile, after logging in.)
- The caregiver app itself is unchanged. Direct address: `https://jangasaketh.github.io/nurse-at-home/caregiver/`

---

## 1.0.2 (10 Oct 2026)

**New: the caregiver app**, at `/caregiver/` on the same site, for nurses and compounders. Own colour (blue), own home-screen icon, own saved data.
- Sign in with OTP, choose a role (registered nurse, or compounder / trained helper).
- Verification in 5 steps: details (18+), government ID (Aadhaar last 4 digits only), selfie (front camera), qualification (nurse: course, state council, registration number, certificate; compounder: training, optional reference), bank account (IFSC checked). Agreement, send, waiting screen; a document can be sent back for a new photo and resent.
- Jobs: go online, see up to 3 requests that fit your role, gender, distance, days, hours, services and urgent setting. Each shows what you earn. Accept (address shown after) or decline with a reason. Same-time clashes are refused.
- Visit: start the trip, running-late notice, arrival code, 10-minute "nobody is answering" wait then missed visit (Rs 49 paid), safety check with the prescription and medicine checks, care, SOS, cancel with a reason.
- Visit record per service: injection site and reaction, fluid amount, wound state and next dressing with optional wound photo, doses and side effects, vitals readings with plain-language warnings, cash collected.
- Schedule by day with repeat visits; work settings; earnings with weekly Monday payout minus cash collected; profile, documents, help (7 questions), Caregiver Terms and Code of Conduct (placeholders).
- English, Telugu and Kannada (`lib/i18n/strings-6.ts`, `strings-7.ts`).

**Shared and patient app**
- The photo picker is now shared by both apps (`components/PhotoPicker.tsx`).
- Patient Profile links to the caregiver app; the caregiver login links back.
- Offline support covers both apps, each opening its own saved page.
- Link buttons no longer show an underline.

---

## 1.0.1 (10 Oct 2026)

**Install the app on a phone**
- The website can now be added to the home screen and opens like an app, full screen, with its own icon.
- Android (Chrome): an "Install the app" card on Home with an Install button. "Not now" hides it; it stays available under Profile → App on your phone.
- iPhone (Safari): the card shows the Share → Add to Home Screen steps.
- Works offline after the first visit: the app saves its files on the phone (service worker). Each new version replaces the saved files automatically.
- New: app icon, home-screen name, web app manifest.

**Real prescription photo**
- "Take a photo" opens the back camera; "Choose a photo or PDF" opens the gallery or files.
- Photos are shrunk before saving (longest side 1,600 px, usually 100 to 400 KB) and shown as a thumbnail that opens full size.
- Clear messages for a wrong file type, a photo over 20 MB, a PDF over 5 MB, a photo that cannot be opened, or one too small to read.
- Replace or remove the file. The prescription is kept if the page is refreshed, shown on Review, and stays with the booking on the visit screen for the nurse to check.
- A PDF is accepted but not previewed until there is a server to upload it to.

**Also**
- All new text in Telugu and Kannada (`lib/i18n/strings-5.ts`).
- Version shown in Profile: 1.0.1.

---

## 1.0.0 (8 Oct 2026)

The starting version. It includes everything built from 4 to 8 Oct 2026.

**Patient app, 23 screens**
- Sign-in: login, OTP, first-login name and a single consent box, Terms of Use and Privacy Policy pages (placeholder text)
- Home, booking (service, date and time, caregiver list, caregiver profile, review and pay), live visit, visit completed
- Bookings, Records, Profile; family members, addresses, emergency contact; notifications; help and support
- Cancel and reschedule a visit

**Features**
- Prescription required for injections, IV drips and medication. Compounders only do dressing and vitals.
- Repeat-visit courses with the same nurse or any available nurse
- Women-only preference with a fallback offer; caregiver language preference
- Vitals check as a menu of priced checks, each with an explanation
- "As soon as possible" visits with an urgent charge
- Five launch cities: Hyderabad, Bengaluru, Mumbai, Chennai, Thiruvananthapuram
- Provisional cancellation rule (see the reminder in `README.md`)
- In-app notifications; loading, error, empty and offline states; prototype tools

**Languages (new in this version)**
- English, Telugu and Kannada on every screen, chosen on the login screen or in Profile. This is a trial translation that needs native-speaker review.
- Notifications and visit records also switch language after they were created.
- The version number is shown at the bottom of Profile.
