# Nurse at Home: patient app

Web app for booking verified nurses and compounders for home visits: injections, IV drips, wound dressing, elder care dressing, scheduled medication and vitals checks.

This is the **frontend only**. There is no server yet. Caregivers, prices and ratings are sample data. What a person enters (name, family, addresses, bookings) is saved in their own browser, so it survives a refresh on that device but is not shared with any other device. "Nurse at Home" is a placeholder name.

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

**First login**
- After the OTP, a new user is asked for a name and must tick two consents. The Terms and Privacy pages open from there.
- Next comes the first address. "Skip for now" is allowed, but Home then asks for an address and a booking cannot continue without one.
- Log out and log in again: the name screen is not shown a second time.

**Family and addresses**
- Home: "Add family member" adds a person and selects them. Profile: tap a person to edit or remove them.
- Home: "Change" next to the address opens the saved addresses. Add one in another city and the caregivers' languages and state nursing council follow it.
- Profile: add an emergency contact. Review then offers to send that person visit updates.

**Booking**
- Injection, IV drip and medication cannot go past the service screen without a prescription.
- Those three services list registered nurses only. Dressing and vitals also list the compounder.
- Vitals check: tick one or more checks; tap a name for details. The price is the total of the ticked checks.
- "As soon as possible" adds an urgent charge. "Repeat visits" books a course with the same nurse or any available nurse.
- "Women only" at 10:00 PM has no match in the sample data, so the app offers male nurses or another time.

**Changing a booking**
- Bookings tab or the visit screen: Reschedule and Cancel visit.
- Reschedule works until the nurse sets off. Times when the booked nurse is busy are greyed out.
- Cancel is free until the nurse sets off; after that the home visit charge is kept; once care has started it is not possible. A course can cancel one visit or all remaining visits.

**Notifications, help, records**
- The bell on Home counts unread messages. They are created when a booking is confirmed, moved or cancelled, when the nurse sets off and arrives, and when a visit ends.
- Profile, Help and support: questions and answers, contact details, and a "Report a problem" form.
- After a visit the notes and readings appear under Records.

**Loading and error screens**
- Lists show grey placeholder cards for half a second while they "load".
- Profile, Prototype tools, "Pretend the internet is failing": every list fails the first time and shows "Try again"; booking, cancelling and moving a visit fail once with a message, then work.
- Turn off your Wi-Fi: a yellow "You are offline" strip appears at the top.
- "Erase all data and start again" wipes what is saved on the device.

## Placeholders to replace before launch

| What | Where |
| --- | --- |
| Prices, urgent charge, home visit charge | `lib/data.ts` |
| Support phone, WhatsApp, email, hours | `SUPPORT` in `lib/data.ts` |
| "What if the nurse is late" answer | `FAQ` in `lib/data.ts` |
| Cancellation and refund policy | `cancelTerms()` in `lib/booking.ts`, and the matching FAQ answer |
| Terms of Use and Privacy Policy text | `LEGAL` in `lib/data.ts` (a lawyer must write these) |
| Prototype tools block | `ProfileScreen` in `components/TabScreens.tsx` (delete it) |

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
| `components/ui.tsx` | Shared parts: buttons, form fields, loading, error and empty states |

## Not built yet

Search for `TODO` in the code to find each spot.

- A server and database: real OTP by SMS, accounts that work across devices
- Prescription photo upload
- Live map and caregiver location
- Payments and refunds
- Calls and chat
- Real push or SMS notifications (the app only shows its own in-app list)
- Local-language versions of the screens
