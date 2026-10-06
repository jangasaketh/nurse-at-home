# Nurse at Home: patient app

Web app for booking verified nurses and compounders for home visits: injections, IV drips, wound dressing, elder care dressing, scheduled medication and vitals checks.

This is the **frontend only**. It runs on sample data held in memory, so nothing is saved and refreshing the page starts again. "Nurse at Home" is a placeholder name.

## Run it on your computer

You need [Node.js](https://nodejs.org) 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. To log in, keep the sample mobile number and type any 6 digits as the OTP.

## Put it in your Git repository

Create an empty repository on GitHub first, then run these inside this folder:

```bash
git init
git add .
git commit -m "Patient app frontend"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

## Put it online to test on phones and other browsers

The quickest way is Vercel or Netlify. Both read the code from GitHub and give you a public link.

1. Push the code to GitHub (steps above).
2. Sign in to vercel.com or netlify.com with your GitHub account.
3. Choose "Add new project" (Vercel) or "Import from Git" (Netlify) and pick this repository.
4. Keep the default settings and deploy. Next.js is detected automatically.
5. Open the link on any phone, tablet or browser. Every later `git push` updates it.

## Or host it on GitHub Pages

A Next.js project has no `index.html` until it is built, so GitHub Pages needs a workflow that builds it first.

1. Keep `next.config.mjs` in the same folder as `package.json`.
2. In the repository, open Settings, then Pages, and set Source to "GitHub Actions".
3. Add the workflow file `deploy.yml` at `.github/workflows/deploy.yml` (at the top of the repository, not inside the app folder).
4. Open the Actions tab and wait for "Deploy to GitHub Pages" to finish. The page is at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

## What to test

- Login: wrong-length mobile number and OTP show errors.
- Home: "Change" switches between Hyderabad, Bengaluru, Mumbai, Chennai and Thiruvananthapuram. The address, the caregivers' languages and the state nursing council on each profile follow the city.
- Injection, IV drip and medication cannot go past the service screen without a prescription. There is no doctor consultation route.
- Those three services list registered nurses only. Dressing and vitals also list the compounder.
- Service details show who brings what (supplies versus medicine).
- Vitals check: tick one or more checks (blood pressure, sugar, temperature, oxygen, pulse, weight). Tapping a name shows what it is and how to prepare. The price is the total of the ticked checks, and only those readings appear on the visit record.
- Date and time: a single visit today can be booked "As soon as possible" (within 60 minutes) for an extra charge, shown as its own line on the review screen. Slots run from 6:00 AM to 10:00 PM.
- Caregiver list: "Women only" and language preferences (the city's language, Hindi, English) filter the list. With "Women only" on at 10:00 PM, no woman is free in the sample data, so the app offers to show male nurses or pick another time. Each profile shows the registration number, and the compounder is labelled as not a registered nurse.
- Review: tick "Send visit updates" and the tracking screen confirms the family contact is being updated.
- Date and time: "Repeat visits" lets you choose 3 to 14 visits, every day or every 2 days, with the same nurse or any available nurse.
- Review shows the price multiplied by the number of visits.
- Tracking: the dashed "Prototype" button moves the visit forward, because there is no live nurse yet.
- After a visit: the record appears under Records, and a course moves on to "Visit 2 of 5".
- Bookings: a course can be switched between same nurse and any nurse.

## Where things are

| Path | What it holds |
| --- | --- |
| `app/page.tsx` | Chooses which screen to show |
| `app/globals.css` | All colours, fonts and styles. Change `--primary` to re-colour the app |
| `lib/data.ts` | Sample services, prices, caregivers and patients |
| `lib/booking.ts` | Booking rules: who may do which service, prescription check, prices, repeat visits |
| `lib/store.tsx` | App state (in memory for now) |
| `components/AuthScreens.tsx` | Login and OTP |
| `components/HomeScreen.tsx` | Home |
| `components/BookingScreens.tsx` | Service details, date and time, caregiver list, caregiver profile, review and pay |
| `components/VisitScreens.tsx` | Live tracking and visit completed |
| `components/TabScreens.tsx` | Bookings, Records, Profile and the bottom tab bar |

## Not built yet

Search for `TODO` in the code to find each spot.

- Real OTP by SMS and user accounts
- Prescription photo upload
- Live map and caregiver location
- Payments
- Calls and chat
- Saving bookings, records and ratings to a database
