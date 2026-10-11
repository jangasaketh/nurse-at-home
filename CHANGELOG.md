# Version history

Each update gets the next version number: 1.0.1, 1.0.2, 1.0.3 and so on.
For every version, these all carry the same number:

- `version` in `package.json` (also shown at the bottom of Profile in the app)
- this file, with a short entry at the top
- the code zip: `nurse-at-home-v1.0.1.zip`
- the project docs (plan, status, reminders), each with a "Version" line, and a copy kept under `claude/versions/v1.0.1/`

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
