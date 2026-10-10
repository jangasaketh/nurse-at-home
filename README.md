# Nurse at Home: patient app

Web app for booking verified nurses and compounders for home visits: injections, IV drips, wound dressing, elder care dressing, scheduled medication and vitals checks.

This is the **frontend only**. There is no server yet. Caregivers, prices and ratings are sample data. What a person enters (name, family, addresses, bookings) is saved in their own browser, so it survives a refresh on that device but is not shared with any other device. "Nurse at Home" is a placeholder name.

**Current version: 1.0.1.** Each update gets the next number (1.0.1, 1.0.2, …). What changed in each version is in `CHANGELOG.md`. The version is set in `package.json` and is shown at the bottom of Profile in the app.

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

Open http://localhost:3000. To log in, keep the sample mobile number and type any 6 digits as the OTP.

## Host it on GitHub Pages

A Next.js project has no `index.html` until it is built, so GitHub Pages needs a workflow that builds it first.

1. Keep `next.config.mjs` in the same folder as `package.json`.
2. In the repository, open Settings, then Pages, and set Source to "GitHub Actions".
3. Keep the workflow file at `.github/workflows/deploy.yml`.
4. Every commit rebuilds the page. The Actions tab shows progress. The page is at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

Vercel and Netlify also work: import the repository and deploy with the default settings.

## What to test

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
| `components/ui.tsx` | Shared parts: buttons, form fields, loading, error and empty states |

## Not built yet

Search for `TODO` in the code to find each spot.

- A server and database: real OTP by SMS, accounts that work across devices
- Uploading the prescription to a server (today it is kept only in the browser, and a PDF is not previewed)
- Live map and caregiver location
- Payments and refunds
- Calls and chat
- Real push or SMS notifications (the app only shows its own in-app list)
- Tamil, Malayalam and Marathi versions of the screens (Telugu and Kannada are done as a trial)
