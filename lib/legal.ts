// POLICY PAGES (2.1.0): Terms of Use, Privacy Policy, Refund and Cancellation Policy, Caregiver Terms, Contact.
// DRAFTS written for review by a lawyer in India before launch. They follow what the apps actually do (the
// cancellation numbers and charges are filled in from the live settings). English only, for now.
// Public at /legal/<id>/ (Razorpay checks these pages), and shown inside the apps.
//
// {name} placeholders are filled by fillLegal() from the settings: business, address, grievance, email, phone,
// hours, grace, freeHours, late, wait, visitFee, urgentFee.

export type LegalId = "terms" | "privacy" | "refunds" | "caregivers" | "contact";
export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { id: LegalId; title: string; summary: string; sections: LegalSection[] };

export const LEGAL_UPDATED = "21 November 2026";

export const LEGAL_DOCS: LegalDoc[] = [
  {
    id: "terms",
    title: "Terms of Use",
    summary: "The rules for using Nurse at Home to book home visits.",
    sections: [
      { h: "1. About these terms", p: [
        "Nurse at Home (\"we\", \"us\") is run by {business}, {address}. These terms apply when you use the Nurse at Home website or apps to book a home visit. By creating an account or booking a visit, you agree to them. If you do not agree, please do not use the service.",
      ] },
      { h: "2. What the service is", p: [
        "Nurse at Home is a platform that connects patients and their families with independent registered nurses and trained compounders (\"caregivers\") for small medical services at home: injections, IV drips, wound and elder-care dressing, scheduled medication and vitals checks.",
        "We check every caregiver's identity and qualification before they can take a booking (see section 6). The caregiver carries out the care and is responsible for it as a professional.",
        "Nurse at Home is not an emergency service, a hospital, a clinic or a pharmacy, and we do not give medical advice or arrange doctor consultations. In an emergency (chest pain, heavy bleeding, trouble breathing, signs of a stroke, unconsciousness) call 112 or go to the nearest hospital.",
      ] },
      { h: "3. Who can use it", p: [
        "You must be at least 18 years old and able to enter a contract under Indian law. You may book for family members or other people in your care, and you confirm that you have their permission (or are their guardian) to share their health details with the caregiver.",
        "Keep your sign-in safe. You are responsible for what is done through your account.",
      ] },
      { h: "4. Prescriptions", p: [
        "Injections, IV drips and scheduled medication are given only against a valid prescription from a registered medical practitioner, which you upload when booking. The caregiver may refuse or stop a procedure if the prescription is missing, unclear, does not match the medicine, or if they believe it is unsafe for the patient at that moment. You must keep the prescribed medicines ready; caregivers do not sell medicines.",
        "Injections, drips and medication are done only by registered nurses. Compounders do wound dressing, elder-care dressing and vitals checks only.",
      ] },
      { h: "5. Bookings, prices and payment", p: [
        "Each service has a price shown before you book, plus a home visit charge (currently {visitFee}) and, for urgent visits, an urgent charge (currently {urgentFee}). The total is shown on the review screen before you send the request. Prices include any charges we collect; there are no hidden fees.",
        "You can pay online through our payment partner (Razorpay) or pay the caregiver after the visit in cash or by UPI. For a course of visits, online payment is taken visit by visit as shown in the app.",
        "A booking is confirmed when a caregiver accepts it. If no caregiver accepts in time, the request ends and nothing is charged (anything paid online is refunded in full).",
        "Cancellations and refunds follow our Refund and Cancellation Policy, which is part of these terms.",
      ] },
      { h: "6. Caregivers", p: [
        "Before a caregiver can take bookings we check a government photo ID, a live photo, their qualification certificate and, for nurses, their registration with a State Nursing Council. Registrations are re-checked before they expire. Caregivers rate and are rated after each visit, and we can pause or remove a caregiver at any time.",
        "Caregivers are independent professionals, not our employees. We take reasonable care in checking them, but we do not guarantee the result of any treatment.",
      ] },
      { h: "7. During the visit", p: [
        "Please make sure an adult is present for the visit, the patient (or their guardian) agrees to the care, and the caregiver can work safely. Treat caregivers with respect. Harassment, abuse, unsafe conditions or asking a caregiver to do something outside the booked service or the prescription are not allowed, and the caregiver may leave.",
        "Do not pay caregivers outside the app beyond the amount shown, and do not book them directly to avoid the platform. Report any concern through Help or the SOS button in the app.",
      ] },
      { h: "8. Your health information", p: [
        "We store prescriptions, visit notes and readings so the caregiver can give safe care and you can see your records. How we handle this is explained in our Privacy Policy.",
      ] },
      { h: "9. Limits of our responsibility", p: [
        "We provide the platform \"as is\". To the extent the law allows, we are not responsible for loss caused by the professional acts of a caregiver, by information you gave us that was wrong, by delays caused by traffic, weather or events outside our control, or by the app being unavailable for a time. Our total liability for any booking is limited to the amount you paid for that booking. Nothing in these terms limits rights you have under the Consumer Protection Act, 2019 that cannot be limited.",
      ] },
      { h: "10. Closing your account", p: [
        "You can delete your account at any time from Profile in the app. We may suspend or close accounts that break these terms. Records we must keep by law are kept as described in the Privacy Policy.",
      ] },
      { h: "11. Changes, law and disputes", p: [
        "We may update these terms; we will show the new date at the top and tell you in the app about important changes. These terms are governed by the laws of India. Please contact our grievance officer first (section 12); if a dispute cannot be settled, the courts at the city of our registered address have jurisdiction, without affecting your right to approach a consumer commission.",
      ] },
      { h: "12. Complaints and grievance officer", p: [
        "Grievance officer: {grievance}. Email: {email}. Phone: {phone} ({hours}). Address: {address}. We acknowledge complaints within 48 hours and aim to resolve them within 30 days.",
      ] },
    ],
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    summary: "What we collect, why, who sees it, and your rights.",
    sections: [
      { h: "1. Who we are", p: [
        "This policy explains how {business} (\"Nurse at Home\", \"we\") collects and uses personal data when you use our website and apps. We process personal data in line with the Digital Personal Data Protection Act, 2023 and other Indian law.",
      ] },
      { h: "2. What we collect", p: [
        "Account: your mobile number, or your name and email if you sign in with Google; your name and language.",
        "Care details you add: family members (name, age, gender, relation), addresses with an optional map pin, an emergency contact, prescriptions you upload, the service and time you book, notes for the caregiver.",
        "Visit records: what the caregiver did, readings (for example blood pressure or sugar), photos the caregiver takes for the record, ratings and complaints.",
        "Location: the caregiver's position while travelling to you (so you can see them on a map), and your location only if you use the SOS button or choose \"use my location\".",
        "Payments: the amount, method and status. Card and UPI details are handled by Razorpay; we never see or store your card number.",
        "Technical: device and browser type, and notification tokens if you turn on phone notifications.",
        "Caregivers additionally give: ID document, live photo, qualification and registration details, bank or UPI details for payouts, and the area they work in.",
      ] },
      { h: "3. Why we use it", p: [
        "To create your account, match your request with a suitable caregiver, let the caregiver reach you and give safe care, keep your visit records, take payments and make refunds, verify caregivers, handle support and SOS reports, prevent fraud and misuse, and meet legal duties. We do not sell your data and we do not use your health data for advertising.",
        "We rely on your consent (which you give when you create your account, and can withdraw), and on legitimate uses allowed by law such as responding to a medical emergency or meeting a legal obligation.",
      ] },
      { h: "4. Who can see it", p: [
        "The caregiver you book sees the patient's first name, age, gender, the area, the service and any prescription before accepting; your full address, the patient's full name and notes only after accepting. Phone numbers are not shown to each other: calls go through a private calling service.",
        "Our team sees what is needed to verify caregivers, run bookings, handle payments and support, with access limited by role.",
        "Service providers who process data for us: Supabase (database and storage, hosted in Singapore), Razorpay (payments), Google (sign-in, if you choose it), SMS and calling providers, and OpenStreetMap map tiles (which see your device's IP address when maps load). They may use your data only to provide their service to us.",
        "Authorities, when the law requires it.",
      ] },
      { h: "5. Where and how it is stored", p: [
        "Data is stored with Supabase in Singapore, encrypted in transit and at rest, with access rules that let each person see only their own records. Documents and prescriptions are kept in private storage and opened only through short-lived links.",
      ] },
      { h: "6. How long we keep it", p: [
        "We keep your account data while your account is open. When you delete your account, we remove your name, phone, family and addresses and close your sign-in. Booking, payment and visit records are kept in anonymised form, or in full where the law requires (for example tax and accounting records, usually 8 years), and then deleted.",
      ] },
      { h: "7. Your rights", p: [
        "You can see and correct your details in the app, download a receipt for each visit, and delete your account from Profile. You can also ask us for a summary of your data, ask us to correct or erase it, withdraw consent, or nominate someone to act for you, by writing to {email}. Withdrawing consent may mean we can no longer provide visits.",
      ] },
      { h: "8. Children", p: [
        "Accounts are for adults. A parent or guardian may book care for a child and gives consent on the child's behalf.",
      ] },
      { h: "9. Changes and contact", p: [
        "We will show the date of any change at the top of this page and tell you in the app about important changes. Questions or complaints: our grievance officer {grievance}, {email}, {phone}, {address}. You may also complain to the Data Protection Board of India.",
      ] },
    ],
  },
  {
    id: "refunds",
    title: "Refund and Cancellation Policy",
    summary: "When you can cancel for free, what is kept, and how refunds are paid.",
    sections: [
      { h: "1. Cancelling a booking", p: [
        "You can cancel from the Bookings tab in the app.",
        "Free: within {grace} minutes of booking, or any time up to {freeHours} hours before the visit time, as long as the caregiver has not set off.",
        "Later than that, or once the caregiver has set off: the home visit charge ({visitFee}) is kept and paid to the caregiver for their time and travel. We never keep more than the home visit charge for a cancellation.",
        "Once care has started, the visit cannot be cancelled.",
        "If the patient was admitted to hospital or their condition changed, tell support and we will waive the charge.",
      ] },
      { h: "2. If the caregiver is late or cancels", p: [
        "If the caregiver is more than {late} minutes late, or cancels, you can cancel free of charge and get a full refund. We will also try to find another caregiver.",
      ] },
      { h: "3. If nobody is home", p: [
        "The caregiver waits {wait} minutes at the door and tries to call. After that the visit counts as missed and the home visit charge is kept.",
      ] },
      { h: "4. If something went wrong", p: [
        "If a visit was not done as booked, or you are unhappy with it, report it from the visit in the app or through Help within 7 days. We will review it with the caregiver and may refund part or all of the amount paid.",
      ] },
      { h: "5. How refunds are paid", p: [
        "Online payments are refunded to the original payment method (card, UPI, net banking or wallet). We start the refund within 2 working days of approving it; your bank usually shows it within 5 to 7 working days. Cash and direct UPI payments to the caregiver are refunded by UPI or bank transfer to your account.",
        "No cancellation or refund charges apply beyond what this policy says.",
      ] },
      { h: "6. Contact", p: [
        "Refund questions: {email} or {phone} ({hours}).",
      ] },
    ],
  },
  {
    id: "caregivers",
    title: "Caregiver Terms",
    summary: "The agreement between Nurse at Home and the nurses and compounders who take visits.",
    sections: [
      { h: "1. Relationship", p: [
        "You join Nurse at Home as an independent professional, not as an employee, agent or partner of {business}. You choose when you are online, which requests you accept, and the area you work in. You are responsible for your own taxes and professional conduct. These terms are a draft and will be confirmed before launch.",
      ] },
      { h: "2. Who can join", p: [
        "Registered nurses (ANM, GNM, B.Sc Nursing or higher) with a valid State Nursing Council registration, and compounders or trained helpers with proof of training. You must be at least 18, give true details, and pass our checks of your ID, live photo, qualification and (for nurses) registration. You must tell us at once if your registration lapses or is suspended.",
      ] },
      { h: "3. What you may do", p: [
        "Nurses may take every service. Compounders may take wound dressing, elder-care dressing and vitals checks only. Never give an injection, drip or medicine without a matching, valid prescription, and never do anything outside the booked service. You may refuse or stop any procedure you believe is unsafe.",
      ] },
      { h: "4. Earnings and payouts", p: [
        "For each completed visit you earn your share of the service price, all of the home visit charge and part of any urgent charge, as shown on each request before you accept it. The shares are set in the app and may change with notice; a change never affects a visit you already accepted. Where the patient pays you directly in cash or UPI, the platform's share is settled from your next payout.",
        "Payouts are made weekly to the bank account or UPI ID you gave. You can see every visit and payout in Earnings.",
      ] },
      { h: "5. Cancellations and no-shows", p: [
        "Cancel only when you must, and as early as possible. Repeated late arrivals, cancellations or no-shows lower your rating and may lead to fewer requests or a pause. If a patient cancels late or is not home after you wait {wait} minutes, you receive the home visit charge.",
      ] },
      { h: "6. Conduct and safety", p: [
        "Follow the Code of Conduct in the app: arrive on time with ID, use sterile supplies, dispose of sharps safely, explain each step and ask consent, never ask for extra money or share your personal number, and report any incident the same day. Use the SOS button if you feel unsafe.",
      ] },
      { h: "7. Patient privacy", p: [
        "Use patient information only for the visit. Do not copy, photograph (except for the visit record in the app) or share it. Keep what you see and hear in the home confidential. These duties continue after you leave the platform.",
      ] },
      { h: "8. Pausing and removal", p: [
        "We may pause your account while we look into a complaint, and remove you for serious or repeated breaches, false documents, or a lapsed registration. We will tell you the reason and give you a chance to respond, except where patient safety requires immediate action.",
      ] },
      { h: "9. Complaints", p: [
        "Grievance officer: {grievance}, {email}, {phone}, {address}.",
      ] },
    ],
  },
  {
    id: "contact",
    title: "Contact us",
    summary: "How to reach Nurse at Home.",
    sections: [
      { h: "Support", p: ["Phone: {phone}", "Email: {email}", "Hours: {hours}"] },
      { h: "Business details", p: ["{business}", "{address}"] },
      { h: "Grievance officer", p: ["{grievance}", "{email}"] },
      { h: "Emergencies", p: ["Nurse at Home is not an emergency service. In an emergency call 112."] },
    ],
  },
];

export type LegalVars = Record<"business" | "address" | "grievance" | "email" | "phone" | "hours" | "grace" | "freeHours" | "late" | "wait" | "visitFee" | "urgentFee", string>;

export const LEGAL_DEFAULTS: LegalVars = {
  business: "[Business name]", address: "[Business address]", grievance: "[Grievance officer name]",
  email: "[Support email]", phone: "[Support phone]", hours: "[Support hours]",
  grace: "5", freeHours: "2", late: "30", wait: "10", visitFee: "₹49", urgentFee: "₹100",
};

export const fillLegal = (text: string, v: LegalVars) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k as keyof LegalVars] : m));

/** The live values from the settings table (anyone may read it). Missing ones keep the placeholders. */
export async function loadLegalVars(url: string, key: string): Promise<LegalVars> {
  const v = { ...LEGAL_DEFAULTS };
  try {
    const r = await fetch(`${url}/rest/v1/settings?select=key,value&key=in.(support,cancel_rule,charges)`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return v;
    const rows = (await r.json()) as { key: string; value: Record<string, unknown> }[];
    const get = (k: string) => rows.find((x) => x.key === k)?.value ?? {};
    const s = get("support"), c = get("cancel_rule"), ch = get("charges");
    const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? String(x) : null);
    v.business = str(s.business) ?? v.business; v.address = str(s.address) ?? v.address; v.grievance = str(s.grievance) ?? v.grievance;
    v.email = str(s.email) ?? v.email; v.phone = str(s.phone) ?? v.phone; v.hours = str(s.hours) ?? v.hours;
    v.grace = num(c.graceMinutes) ?? v.grace; v.freeHours = num(c.freeUntilHours) ?? v.freeHours; v.late = num(c.lateMinutes) ?? v.late; v.wait = num(c.noShowMinutes) ?? v.wait;
    const vf = num(ch.visitFee), uf = num(ch.urgentFee);
    if (vf) v.visitFee = `₹${vf}`;
    if (uf) v.urgentFee = `₹${uf}`;
  } catch { /* offline: placeholders */ }
  return v;
}
