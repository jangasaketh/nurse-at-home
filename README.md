# Nurse at Home: patient app, caregiver app and admin panel

Three web apps in one project, published together on one site:

| App | Who it is for | Address on GitHub Pages |
| --- | --- | --- |
| **Patient app** | Families booking home visits: injections, IV drips, wound dressing, elder care dressing, scheduled medication and vitals checks | `https://YOUR-USERNAME.github.io/nurse-at-home/` |
| **Caregiver app** | Nurses and compounders: sign up and get verified, take visit requests, carry out each visit, see earnings | `https://YOUR-USERNAME.github.io/nurse-at-home/caregiver/` |
| **Admin panel** (1.0.6) | The Nurse at Home team: verify caregivers, bookings, refunds, support, payouts, prices and rules. English only, made for a computer screen | `https://YOUR-USERNAME.github.io/nurse-at-home/admin/` |

Each app has its own colour (green for patients, blue for caregivers), its own home-screen icon and its own saved data. They link to each other: the patient login screen and Profile → "Are you a nurse or compounder? Work with us", and the caregiver login → "Need a nurse at home?".

This is the **frontend only**. There is no server yet. Caregivers, patients, requests, prices, ratings and earnings are sample data. The patient and caregiver apps do not talk to each other yet: a booking made in the patient app does not appear in the caregiver app until there is a server. The admin panel is the exception, for the demo: it is linked to the caregiver app **in the same browser** (see "What to test: admin panel"), and the services list set in it (prices, switched-off services, new services) is used by both apps in that browser. It also shows the patient signed in to the patient app in that browser, read only. What a person enters (name, family, addresses, bookings) is saved in their own browser, so it survives a refresh on that device but is not shared with any other device. "Nurse at Home" is a placeholder name.

**Current version: 1.1.0.** Real sign-in works (phase 2 of the backend): see "Sign-in" below and `supabase/README.md`. Each update gets the next number (1.0.1, 1.0.2, …). What changed in each version is in `CHANGELOG.md`. The version is set in `package.json` and is shown at the bottom of Profile in the app.

## Reminder: the cancellation rule is provisional

Applied on 6 Oct 2026 as a trial. **The owner has not made it final and may remove it.**

The rule:
- Free to cancel within 5 minutes of booking, or any time up to 2 hours before the visit.
- Free if the nurse is more than 30 minutes late, or cancels.
- Otherwise (inside 2 hours, or once the nurse has set off) the Rs 49 home visit charge is kept and paid to the nurse. Never more than that.
- Rescheduling inside 2 hours costs the same Rs 49.
- If nobody answers the door for 10 minutes, the visit counts as missed and the charge is kept.
- Once care has started, the visit cannot be cancelled.
- On a cash booking, a kept charge is added to the next booking.
- Support can waive the charge if the patient was hospitalised or got worse.

**To remove it:** open `lib/data.ts` and change `TIMED_CANCEL_RULE = true` to `false`. The app goes back to the simple rule: free until the nurse sets off, then the Rs 49 charge is kept. Then rewrite the "Can I cancel or change a booking?" answer in `FAQ` (same file) to match.

**To adjust it:** the 5 minutes, 2 hours, 30 minutes and 10 minutes are the four numbers under `TIMED_CANCEL_RULE` in `lib/data.ts`.

## Run it on your computer

You need [Node.js](https://nodejs.org) 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000 for the patient app, http://localhost:3000/caregiver/ for the caregiver app and http://localhost:3000/admin/ for the admin panel. To log in, keep the sample mobile number and type any 6 digits as the OTP.

## Host it on GitHub Pages

A Next.js project has no `index.html` until it is built, so GitHub Pages needs a workflow that builds it first.

1. Keep `next.config.mjs` in the same folder as `package.json`.
2. In the repository, open Settings, then Pages, and set Source to "GitHub Actions".
3. Keep the workflow file at `.github/workflows/deploy.yml`.
4. Every commit rebuilds both apps. The Actions tab shows progress. The patient app is at `https://YOUR-USERNAME.github.io/YOUR-REPO/` and the caregiver app at `https://YOUR-USERNAME.github.io/YOUR-REPO/caregiver/`. The admin panel is at `…/YOUR-REPO/admin/`. Nothing extra is needed for the caregiver app or the admin panel: they are built by the same workflow.

Vercel and Netlify also work: import the repository and deploy with the default settings.

## Sign-in (1.1.0)

- **Patients and caregivers** sign in with a mobile number and a 6-digit code. Until SMS is set up (it needs DLT registration in India), use the **test numbers** added in Supabase → Authentication → Sign In / Providers → Phone, each with a fixed code.
- What is saved to the account: patients' name, consent, language, family, addresses and emergency contact; caregivers' role and details. The rest (bookings, documents, earnings) is still on the phone until the next phases.
- **Admin team** signs in with email and password. The first owner is made with `supabase/002_first_owner.sql`; everyone else is added from the Team page after their login is created in Supabase → Authentication → Users → Add user.
- Every login screen keeps **"Try the demo"**, which works as before with sample data and saves nothing.

## What to test: admin panel (1.0.6)

Open `/admin/`. Any email and password work, or press "Prototype: sign in as the sample admin". English only, designed for a computer (it also works on a phone).

**The link with the caregiver app (same browser)**
1. Open the caregiver app in another tab, sign up and send your documents (do not press "approve me").
2. In the admin panel the top bar says "Caregiver app: documents waiting for you". Verification → your caregiver is in the list with a blue "Live · caregiver app" label.
3. Open it: ID, selfie and certificate, the details, automatic checks, and a checklist. Send a document back with a reason → the caregiver tab shows it at once. Fix it there and send again → it comes back marked "Sent again".
4. Approve, choosing "All nurse services" or "Dressing and vitals only, for now" → the caregiver tab shows "You are verified".
5. Caregivers → open them: change what they can take, pause (suspend) with a reason, reinstate. The caregiver app follows each change.
6. A report sent from the caregiver app appears in Support. Reply → the caregiver sees it under "Your reports".
7. Payouts → "Pay now" on the live caregiver → it shows in their payout history.
8. A renewed registration sent from the caregiver app appears under Verification → Renewals. Approve it → the new date shows in their Profile.

**Pages**
- **Dashboard:** today's visits, money collected, cancellations, caregivers online, what is waiting for the team, bookings for the last 7 days, cities and services.
- **Verification:** waiting, sent back, approved, renewals, and registrations expiring soon (send a reminder).
- **Caregivers:** everyone verified, with filters; change services, pause, reinstate.
- **Bookings:** filters and search; reassign a caregiver, cancel (refund in full), or give a refund.
- **Refunds:** patients' requests with a hint from the rules; approve all or part, or decline with a reason.
- **Support:** tickets from patients and caregivers, urgent first; ready-made replies.
- **Payouts:** this week per caregiver (earned, cash collected, to pay), cash owed to us, send payouts, bank file (CSV), past weeks.
- **Settings:** service and vitals-check prices (**live**: open the patient app in the same browser to see a new price), charges and the cancellation rule, pay split with a worked example, time limits, cities (pause, add). Only the prices are live for now; the other numbers are used by the Bookings and Payouts pages here, and by the apps once there is a server.
- **Activity log:** every decision and who made it, with a CSV download, and "start the sample data again".

**Added in 1.0.8**
- **Patients:** search by name, phone or family member; family, addresses, bookings, complaints, refunds. Sign in to the patient app in another tab and you appear here.
- **Settings → Services and prices:** switch a service off, change who can do it and whether it needs a prescription, add a new service. Open the patient app in the same browser to see the change.
- **Settings → Cities and areas:** add and remove areas; a new city needs an area before it can open.
- **Team:** add people, change roles, switch off access. Sign in with `ravi@nurseathome.in` (verification), `sana@nurseathome.in` (support) or `kiran@nurseathome.in` (finance) to see what each role can open, or use "Prototype: view as" in the top bar.
- **Reports:** 6 months of revenue, caregiver earnings, refunds and a GST summary, with CSV download.
- **Messages:** send a notice to caregivers by city and role; the caregiver app in the same browser receives it.
- **Caregiver history:** in each caregiver's panel, documents on file and everything that happened to them.

## What to test: caregiver app

Open `/caregiver/`. Any 6 digits work as the OTP.

**Sign-up and verification**
- Choose "Registered nurse" or "Compounder or trained helper". Compounders are told that injections, drips and medication are for nurses only.
- Five steps: your details (18+ only), government ID (Aadhaar asks only for the last 4 digits; photo only), selfie (front camera), qualification (nurses: course, state nursing council, registration number, certificate; compounders: training and an optional reference), bank account (account number twice, IFSC checked).
- Tick the agreement and send. On the waiting screen, the prototype buttons stand in for the verification team: "approve me", or "ask for a new ID photo" to see the fix-and-resend flow.
- In a hurry? "Prototype: skip verification" on the checklist fills sample documents and approves you at once.

**Jobs**
- Go online with the switch. Up to three sample requests appear, each with time, area and distance, the patient's first name, and what you will earn. Urgent and repeat-visit requests are marked.
- A compounder never sees injections, drips or medication. A man never sees requests where the patient asked for a woman.
- Open a request: the full address appears only after you accept. Decline asks for a reason.
- Two visits at the same time are refused.

**A visit**
- Start the trip → I have arrived → enter the patient's arrival code (4821 in the prototype) → safety check (for injections, drips and medication, the prescription and medicine checks) → care → write the record.
- The record asks for what fits the service: injection site and reaction, amount of fluid, wound state and next dressing (with an optional wound photo), doses and side effects, or the vitals readings. Readings outside the usual range show a plain-language warning to pass to the family.
- Cash visits ask you to confirm you collected the payment.
- "Nobody is answering?" starts a 10-minute wait, then lets you mark the visit as missed (Rs 49 paid to you). "Something does not match" stops the visit safely. "I cannot do this visit" cancels with a reason. SOS is on every visit screen.

**Notifications, ratings, reports, payouts, renewal (1.0.5)**
- The bell on Jobs shows unread notifications. Going online adds one per new request.
- Each request shows a countdown ("15:00 left", urgent "3:00 left"). "Prototype: let the time run out" shows what happens when it expires.
- On an accepted visit, "Prototype: the patient cancels" shows the cancellation screen: Rs 49 if late or after setting off, nothing if early.
- After a finished visit, a rating arrives: Profile → Ratings and reviews.
- Help or Profile → Report a problem: send a report and see it under "Your reports".
- Earnings → Payout history and statements: past payouts, the monthly statement, and "Download statement (CSV)".
- With "skip verification", the sample nurse's registration runs out in 3 to 7 weeks, so the renewal banner shows. "Renew now" → add a certificate and a new month → "Prototype: approve the renewal".

**Schedule, earnings, profile**
- Schedule lists accepted visits by day; repeat visits move to the next day after each visit. Work settings set days, hours, distance, services and urgent requests, and the requests change to match.
- Earnings shows this week's payout (paid Mondays), with cash you already collected taken off. A few sample entries show how it works.
- Profile shows verification, documents, language, install, help, and the Code of Conduct.

## What to test: patient app

**Install on a phone** (needs the GitHub Pages link, which is https)
- Android, in Chrome: an "Install the app" card appears on Home. Tap Install, and the app gets its own icon. "Not now" hides the card; Profile → App on your phone still offers it.
- iPhone, in Safari: Home shows "Show me how" with the Share → Add to Home Screen steps.
- Open the installed app once with internet. After that it opens without internet too (with the offline strip at the top).

**Languages**
- On the login screen, tap తెలుగు or ಕನ್ನಡ. Every screen switches, including services, the FAQ, dates, notifications and records. Switch back under Profile → Language.

**First login**
- After the OTP, a new user is asked for a name and must tick one consent box. The Terms and Privacy pages open from there.
- Next comes the first address. "Skip for now" is allowed, but Home then asks for an address and a booking cannot continue without one.
- Log out and log in again: the name screen is not shown a second time.

**Family and addresses**
- Home: "Add family member" adds a person and selects them. Profile: tap a person to edit or remove them.
- Home: "Change" next to the address opens the saved addresses. Add one in another city and the caregivers' languages and state nursing council follow it.
- Profile: add an emergency contact. Review then offers to send that person visit updates.

**Booking**
- Injection, IV drip and medication cannot go past the service screen without a prescription.
- Prescription: "Take a photo" opens the phone's back camera; "Choose a photo or PDF" opens the gallery or files. The photo is shrunk (to about 100 to 400 KB) and shown as a thumbnail. Tap it to see it full size. Try a text file or a tiny image to see the error messages. The photo appears again on Review and on the visit screen.
- Those three services list registered nurses only. Dressing and vitals also list the compounder.
- Vitals check: tick one or more checks; tap a name for details. The price is the total of the ticked checks.
- "As soon as possible" adds an urgent charge. "Repeat visits" books a course with the same nurse or any available nurse.
- "Women only" at 10:00 PM has no match in the sample data, so the app offers male nurses or another time.

**Changing a booking**
- Bookings tab or the visit screen: Reschedule and Cancel visit. The review screen states the rule before payment.
- Straight after booking, cancelling is free (5-minute window), even if the nurse has set off.
- A visit booked for today at a time already close or past is "inside 2 hours": after the 5 minutes, cancelling or moving it keeps Rs 49. A visit two days away stays free.
- Visit screen, Prototype buttons: "nurse is 30 minutes late" makes cancelling free; "nobody answers the door" (after the nurse arrives) marks the visit as missed; "nurse cancels" gives a full refund.
- Pay "after the visit" and miss a visit: the next booking shows "Unpaid charge from an earlier booking".
- A course can cancel one visit or all remaining visits. Reschedule greys out times when the booked nurse is busy.

**Notifications, help, records**
- The bell on Home counts unread messages. They are created when a booking is confirmed, moved or cancelled, when the nurse sets off and arrives, and when a visit ends.
- Profile, Help and support: questions and answers, contact details, and a "Report a problem" form.
- After a visit the notes and readings appear under Records.

**Loading and error screens**
- Lists show grey placeholder cards for half a second while they "load".
- Profile, Prototype tools, "Pretend the internet is failing": every list fails the first time and shows "Try again"; booking, cancelling and moving a visit fail once with a message, then work.
- Turn off your Wi-Fi: a yellow "You are offline" strip appears at the top.
- "Erase all data and start again" wipes what is saved on the device.

## Languages: English, Telugu, Kannada (trial)

Choose the language on the login screen or under Profile → Language. The choice is remembered.

- Every piece of screen text is written in English inside `t("...")`. The English text is the key.
- Translations live in `lib/i18n/strings-1.ts` to `strings-4.ts`, one line per text: `[English, Telugu, Kannada]`.
- If a translation is missing, the English text is shown, so nothing breaks. In the browser console, `window.__i18nMissing` lists any that were missing.
- Notifications and visit history are saved as messages (`msg(...)` in `lib/booking.ts`), so they also switch language later.
- Names, addresses, phone numbers, units (mmHg, km), times like "9:00 AM", and the support placeholders stay as they are.
- **The Telugu and Kannada text is a trial translation. A native speaker of each language, ideally someone with nursing or medical knowledge, must review it before launch.**
- To add a language (Tamil, Malayalam, Marathi): add it to `LANGS` in `lib/i18n.ts`, add a column to the strings files, and add its Noto Sans font in `app/layout.tsx` and `app/globals.css`.

## Placeholders to replace before launch

| What | Where |
| --- | --- |
| Prices, urgent charge, home visit charge | `lib/data.ts` |
| Support phone, WhatsApp, email, hours | `SUPPORT` in `lib/data.ts` |
| Cancellation and reschedule rule (provisional, see the reminder at the top) | Switch and numbers in `lib/data.ts`; logic in `changeFee()` in `lib/booking.ts`; matching FAQ answer |
| App icon and home-screen name ("Nurse at Home") | `public/icons/`, `public/manifest.webmanifest`, `app/layout.tsx` |
| Caregiver pay split: 80% of the service price, all of the Rs 49 visit charge, half of the urgent charge | `CAREGIVER_SHARE`, `VISIT_FEE_SHARE`, `URGENT_SHARE` in `lib/caregiver/data.ts` |
| Time to answer a request (3 minutes urgent, 15 minutes scheduled) | `OFFER_MINUTES_URGENT`, `OFFER_MINUTES` in `lib/caregiver/data.ts` |
| Renewal reminder starts 60 days before expiry | `RENEWAL_WARN_DAYS` in `lib/caregiver/data.ts` |
| Sample payouts, reviews and the rating after each visit | `approvalPatch()` in `lib/caregiver/store.tsx`, `SAMPLE_NEW_REVIEWS` in `lib/caregiver/data.ts` |
| "Usually 2 working days" for verification | Caregiver verification screens and translations |
| Caregiver Terms and Code of Conduct text | `CG_LEGAL` in `components/caregiver/AccountScreens.tsx` (a lawyer must write these) |
| Caregiver app icon and name ("NAH Caregiver") | `public/caregiver/icons/`, `public/caregiver/manifest.webmanifest`, `app/caregiver/layout.tsx` |
| Caregiver prototype buttons ("approve me", "skip the wait", "use the sample note", sample requests) | `components/caregiver/` (search for "Prototype") |
| Admin sign-in (any email works) and the prototype buttons | `LoginPage` in `components/admin/AdminApp.tsx`; search `components/admin/` for "Prototype" |
| Admin sample data: applicants, caregivers, patient accounts, bookings, refunds, tickets, past payouts, team, caregiver history, earlier months for reports | `lib/admin/data.ts` |
| Admin roles and which pages each can open | `ROLE_PAGES` in `lib/admin/data.ts` |
| GST rate and treatment in Reports (placeholder 18% on our share; a chartered accountant must confirm) | `GST_RATE`, `gstOn()` in `lib/admin/data.ts` |
| Ready-made messages to caregivers | `TEMPLATES` in `components/admin/MessagesPage.tsx` |
| Ready-made reasons and replies (send back, pause, renewal, support) | `SEND_BACK_REASONS` in `lib/admin/data.ts`, `SUSPEND_REASONS` in `components/admin/CaregiversPage.tsx`, `RENEWAL_REASONS` in `components/admin/VerificationPage.tsx`, `QUICK` in `components/admin/SupportPage.tsx` (each reason shown to caregivers also needs a Telugu and Kannada line in `lib/i18n/strings-9.ts`) |
| Telugu and Kannada wording (trial, needs native-speaker review) | `lib/i18n/strings-*.ts` |
| Terms of Use and Privacy Policy text | `LEGAL` in `lib/data.ts` (a lawyer must write these) |
| Prototype tools block and Prototype buttons | `ProfileScreen` in `components/TabScreens.tsx`, and the dashed box in `TrackingScreen` in `components/VisitScreens.tsx` (delete them) |

## Where things are

| Path | What it holds |
| --- | --- |
| `app/page.tsx` | Chooses which screen to show; offline strip |
| `app/globals.css` | All colours, fonts and styles. Change `--primary` to re-colour the app |
| `lib/data.ts` | Sample services, prices, caregivers, cities, questions and answers |
| `lib/booking.ts` | Rules: who may do which service, prescription check, prices, repeat visits, cancel and reschedule policy |
| `lib/store.tsx` | App state, saved in the browser |
| `lib/fake-api.ts` | Stand-ins for network calls, so loading and error screens can be seen |
| `components/AuthScreens.tsx` | Login, OTP, first-login name and consent |
| `components/HomeScreen.tsx` | Home |
| `components/BookingScreens.tsx` | Service details, date and time, caregiver list, caregiver profile, review and pay |
| `components/VisitScreens.tsx` | Live tracking and visit completed |
| `components/ManageBookingScreens.tsx` | Cancel and reschedule |
| `components/AccountScreens.tsx` | Family members, addresses, emergency contact |
| `components/SupportScreens.tsx` | Notifications, help and support, legal pages |
| `components/TabScreens.tsx` | Bookings, Records, Profile and the bottom tab bar |
| `lib/i18n.ts`, `lib/i18n/` | Language switch and the Telugu and Kannada translations |
| `components/PrescriptionPicker.tsx`, `lib/prescription.ts` | Prescription camera and file picker, photo shrinking, preview |
| `components/InstallCard.tsx`, `lib/install.ts` | "Install the app" card for Android and iPhone |
| `public/manifest.webmanifest`, `public/icons/`, `public/sw.js` | App name and icons for the home screen; offline support (service worker) |
| `app/caregiver/` | The caregiver app's page and its name, icon and manifest |
| `components/caregiver/` | Caregiver screens: `SignupScreens` (sign-in and verification), `JobScreens` (requests), `VisitScreens` (the visit and the record), `WorkScreens` (schedule, settings, earnings), `AccountScreens` (profile, help, terms), `CgApp` (chooses the screen) |
| `lib/caregiver/` | Caregiver sample requests, pay rules, reading checks (`data.ts`), rules (`rules.ts`) and saved state (`store.tsx`) |
| `components/PhotoPicker.tsx` | Camera and photo picker shared by both apps (prescription, ID, selfie, certificate, wound photo) |
| `components/caregiver/MoreScreens.tsx` | Notifications, ratings and reviews, report a problem, payouts and statement, patient cancelled, renew registration, renewal banner |
| `lib/caregiver/engine.ts` | Request time limits and expiry, renewal reminders, "patient cancels" |
| `public/caregiver/` | Caregiver home-screen icon and manifest |
| `app/admin/` | The admin panel's page, its title and its styles (`admin.css`) |
| `components/admin/` | Admin pages: `AdminApp` (sign-in, menu, roles), `DashboardPage`, `VerificationPage`, `CaregiversPage` (with documents and history), `PatientsPage`, `BookingsPages` (bookings and refunds), `SupportPage`, `MessagesPage`, `PayoutsPage`, `ReportsPage`, `SettingsPage`, `TeamPage`, `ActivityPage`, and `ui.tsx` (tables, side panel, badges) |
| `lib/admin/` | Admin sample data (`data.ts`), saved decisions (`store.tsx`), the link to the caregiver app (`link.ts`) and to the patient app (`patient-link.ts`) |
| `components/ui.tsx` | Shared parts: buttons, form fields, loading, error and empty states |

## Not built yet

Search for `TODO` in the code to find each spot.

- A server and database: real OTP by SMS, accounts that work across devices, and connecting the two apps (a patient booking reaching a real caregiver)
- Storing ID and certificate photos privately on a server (the admin panel reads them from the same browser for now)
- Admin accounts with roles (support, verification, finance) and a code sent to the team member's phone
- Real payouts to caregivers' bank accounts
- Uploading the prescription to a server (today it is kept only in the browser, and a PDF is not previewed)
- Live map and caregiver location
- Payments, and refunds through the payment gateway (the admin panel records refund decisions only)
- Calls and chat
- Real push or SMS notifications (the app only shows its own in-app list)
- Tamil, Malayalam and Marathi versions of the screens (Telugu and Kannada are done as a trial)
