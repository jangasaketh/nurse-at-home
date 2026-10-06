// SAMPLE DATA. Every caregiver name, price, rating and review here is a placeholder.
// When the backend exists, these lists come from the API instead.

import type { IconName } from "@/components/Icon";

export type Service = {
  id: string;
  name: string;
  short: string;
  price: number; // rupees per visit
  mins: string;
  needsPrescription: boolean;
  nurseOnly: boolean; // true = only registered nurses may do it
  nurseBrings: string;
  youKeepReady: string;
  icon: IconName;
  includes: string[];
  note: string; // sample visit note shown after the visit
};

export const SERVICES: Service[] = [
  {
    id: "inj",
    name: "Injection at home",
    short: "Into the muscle, vein or under the skin, as your doctor prescribed.",
    price: 250,
    mins: "20 minutes",
    needsPrescription: true,
    nurseOnly: true,
    icon: "syringe",
    nurseBrings: "Syringe, needle, swabs, gloves and a sharps box",
    youKeepReady: "The prescribed medicine and the prescription",
    includes: [
      "Checks the prescription against the medicine label",
      "Gives the injection with a new sterile syringe",
      "Stays 15 minutes to watch for any reaction",
    ],
    note: "Injection given as prescribed, left upper arm. Watched for 15 minutes, no reaction.",
  },
  {
    id: "iv",
    name: "IV drip and fluids",
    short: "Glucose, saline or prescribed medicine through a drip.",
    price: 600,
    mins: "60 to 90 minutes",
    needsPrescription: true,
    nurseOnly: true,
    icon: "drop",
    nurseBrings: "Cannula, IV set, drip stand, tape and gloves",
    youKeepReady: "The prescribed fluid or medicine and the prescription",
    includes: [
      "Places the cannula and sets up the drip",
      "Stays and monitors until the bottle finishes",
      "Removes the cannula and dresses the site",
    ],
    note: "IV line placed in the right hand. Drip finished in 70 minutes. Cannula removed, site clean.",
  },
  {
    id: "dress",
    name: "Wound dressing",
    short: "Cleaning and bandaging for cuts, burns, stitches and accident injuries.",
    price: 300,
    mins: "30 minutes",
    needsPrescription: false,
    nurseOnly: false,
    icon: "bandage",
    nurseBrings: "Sterile gauze, bandage, cleaning solution and gloves",
    youKeepReady: "Any ointment your doctor prescribed",
    includes: [
      "Removes the old dressing and cleans the wound",
      "Applies fresh sterile dressing and bandage",
      "Tells you if the wound needs a doctor",
    ],
    note: "Wound cleaned and re-dressed. No sign of infection. Next dressing due in 2 days.",
  },
  {
    id: "elder",
    name: "Elder care dressing",
    short: "Bedsore and ulcer dressing with a skin check, for people who cannot travel.",
    price: 350,
    mins: "40 minutes",
    needsPrescription: false,
    nurseOnly: false,
    icon: "heart",
    nurseBrings: "Dressing material, gloves and skin-care supplies",
    youKeepReady: "Any prescribed ointment and a clean sheet",
    includes: [
      "Changes bedsore or ulcer dressings gently",
      "Checks pressure points and skin",
      "Shows the family how to turn and position",
    ],
    note: "Dressing changed and skin checked. Advised turning every 2 hours.",
  },
  {
    id: "med",
    name: "Scheduled medication",
    short: "Timed doses given and written down, once or every day.",
    price: 200,
    mins: "15 minutes",
    needsPrescription: true,
    nurseOnly: true,
    icon: "pill",
    nurseBrings: "Gloves, swabs and a dose chart",
    youKeepReady: "All prescribed medicines and the prescription",
    includes: [
      "Gives each dose at the prescribed time",
      "Writes down what was given and when",
      "Flags missed doses or side effects to the family",
    ],
    note: "Morning doses given at the prescribed time and recorded. No side effects reported.",
  },
  {
    id: "vitals",
    name: "Vitals check",
    short: "Blood pressure, sugar, temperature and oxygen, recorded for your doctor.",
    price: 30, // "from" price. The real price is the total of the checks chosen
    mins: "15 minutes",
    needsPrescription: false,
    nurseOnly: false,
    icon: "pulse",
    nurseBrings: "BP monitor, glucometer, thermometer and pulse oximeter",
    youKeepReady: "Earlier reports, if you have them",
    includes: [
      "Takes only the checks you choose",
      "Explains each reading in plain words",
      "Saves the readings to your records",
    ],
    note: "All readings taken and saved below.",
  },
];

export type Caregiver = {
  id: string;
  name: string;
  first: string;
  initials: string;
  qualification: string;
  isNurse: boolean;
  experience: string;
  distance: string;
  rating: string;
  visitCount: string;
  speaks: string[]; // "LOCAL" stands for the main language of the patient's city
  gender: "F" | "M";
  regNo: string; // nursing council registration, or certificate number for a compounder
  busyAt: string[]; // SAMPLE: arrival times when this person is already booked
};

export const CAREGIVERS: Caregiver[] = [
  { id: "c1", name: "Anjali Thomas", first: "Anjali", initials: "AT", qualification: "Registered nurse · GNM", isNurse: true, experience: "8 years", distance: "1.2 km", rating: "4.9", visitCount: "212", speaks: ["LOCAL", "English", "Hindi"], gender: "F", regNo: "48213", busyAt: ["10:00 PM"] },
  { id: "c2", name: "Mohammed Irfan", first: "Irfan", initials: "MI", qualification: "Registered nurse · B.Sc Nursing", isNurse: true, experience: "5 years", distance: "2.4 km", rating: "4.8", visitCount: "147", speaks: ["LOCAL", "Hindi", "Urdu", "English"], gender: "M", regNo: "51907", busyAt: ["12:00 PM"] },
  { id: "c3", name: "Sunita Yadav", first: "Sunita", initials: "SY", qualification: "Registered nurse · GNM", isNurse: true, experience: "11 years", distance: "3.1 km", rating: "4.7", visitCount: "389", speaks: ["Hindi", "English"], gender: "F", regNo: "33684", busyAt: ["10:00 PM", "6:00 AM", "within 60 minutes"] },
  { id: "c4", name: "Ravi Kumar", first: "Ravi", initials: "RK", qualification: "Compounder · wound-care trained", isNurse: false, experience: "14 years", distance: "0.9 km", rating: "4.6", visitCount: "501", speaks: ["LOCAL", "Hindi"], gender: "M", regNo: "7716", busyAt: ["6:00 AM"] },
];

// Launch cities. Nurses register with their STATE nursing council, so verification is per state.
export type City = { id: string; name: string; state: string; language: string; area: string };

export const CITIES: City[] = [
  { id: "hyd", name: "Hyderabad", state: "Telangana", language: "Telugu", area: "Madhapur" },
  { id: "blr", name: "Bengaluru", state: "Karnataka", language: "Kannada", area: "Indiranagar" },
  { id: "bom", name: "Mumbai", state: "Maharashtra", language: "Marathi", area: "Andheri West" },
  { id: "maa", name: "Chennai", state: "Tamil Nadu", language: "Tamil", area: "Adyar" },
  { id: "trv", name: "Thiruvananthapuram", state: "Kerala", language: "Malayalam", area: "Kowdiar" },
];

export const VISIT_FEE = 49; // home visit charge per visit, rupees
// Early-morning and late-night slots are on purpose: insulin before breakfast, night-time injections.
export const SLOTS = ["6:00 AM", "9:00 AM", "12:00 PM", "4:00 PM", "7:00 PM", "10:00 PM"];
export const URGENT_SLOT = "within 60 minutes";
export const URGENT_FEE = 100; // extra charge for "As soon as possible", rupees
export const VISIT_COUNTS = [3, 5, 7, 10, 14];
export const ARRIVAL_CODE = "4821";

export const SAMPLE_REVIEWS = [
  { text: "Came on time and was gentle with my mother. Explained every step before doing it.", who: "Sample review · daughter of a patient" },
  { text: "Clean, careful work and the visit notes were easy to share with our doctor.", who: "Sample review · son of a patient" },
];

// The checks a patient can choose inside "Vitals check". Each has its own price and explanation.
export type VitalCheck = { id: string; name: string; price: number; what: string; how: string; prepare: string; sample: string };

export const VITALS_SERVICE_ID = "vitals";

export const VITAL_CHECKS: VitalCheck[] = [
  {
    id: "bp",
    name: "Blood pressure",
    price: 50,
    what: "The force of blood pushing on the walls of your arteries. High or low readings help your doctor adjust treatment.",
    how: "A cuff is wrapped around the upper arm and inflated. It takes about 2 minutes.",
    prepare: "Sit quietly for 5 minutes first. Avoid tea, coffee and smoking for 30 minutes before.",
    sample: "128/82 mmHg",
  },
  {
    id: "sugar",
    name: "Blood sugar",
    price: 70,
    what: "The amount of glucose in your blood. It is the main check for people with diabetes.",
    how: "A small finger prick gives one drop of blood, read on a glucometer in a few seconds.",
    prepare: "For a fasting reading, do not eat for 8 hours. Otherwise tell the nurse when you last ate.",
    sample: "112 mg/dL",
  },
  {
    id: "temp",
    name: "Temperature",
    price: 30,
    what: "Your body temperature, to check for fever.",
    how: "A digital thermometer under the arm or at the forehead, for less than a minute.",
    prepare: "No preparation needed. Avoid a hot drink or bath just before.",
    sample: "98.4 °F",
  },
  {
    id: "spo2",
    name: "Oxygen level (SpO2)",
    price: 40,
    what: "How much oxygen your blood is carrying. It matters in breathing and heart problems.",
    how: "A small clip on the fingertip shines a light through the finger. It does not hurt.",
    prepare: "Remove nail polish from one finger. Keep the hand warm and still.",
    sample: "98%",
  },
  {
    id: "pulse",
    name: "Pulse (heart rate)",
    price: 30,
    what: "How many times your heart beats in a minute, and whether the rhythm is steady.",
    how: "Counted at the wrist for one minute, or read from the fingertip clip.",
    prepare: "Rest for 5 minutes before the check.",
    sample: "76 beats per minute",
  },
  {
    id: "weight",
    name: "Weight and BMI",
    price: 30,
    what: "Your weight, and BMI, which compares weight with height. Useful for tracking over time.",
    how: "A digital scale on a flat floor. The nurse works out BMI from your height.",
    prepare: "Wear light clothes and no shoes. Know your height if you can.",
    sample: "64 kg · BMI 24.1",
  },
];

// Readings a nurse notes on every visit, whatever the service.
export const ROUTINE_CHECK_IDS = ["bp", "pulse", "temp", "spo2"];

// ---------- Cancellation and reschedule rule ----------
// PROVISIONAL RULE, applied 6 Oct 2026. The owner may change or remove it.
// To go back to the simple rule ("free until the nurse sets off, then the home visit charge is kept"),
// set TIMED_CANCEL_RULE to false. Nothing else needs to change. Then update the FAQ answer below to match.
export const TIMED_CANCEL_RULE = true;
export const GRACE_MINUTES = 5; // free to cancel this long after booking, whatever the visit time
export const FREE_UNTIL_HOURS = 2; // free to cancel or move a visit until this long before it starts
export const LATE_MINUTES = 30; // if the caregiver is later than this, cancelling is free
export const NO_SHOW_MINUTES = 10; // caregiver waits this long at the door before the visit counts as missed

// ---------- Account, bookings and support ----------

export const RELATIONS = ["Mother", "Father", "Spouse", "Son", "Daughter", "Brother", "Sister", "Grandparent", "Other"];
export const ADDRESS_LABELS = ["Home", "Work", "Parents' home", "Other"];

export const CANCEL_REASONS = [
  "The patient is feeling better",
  "The doctor changed the treatment",
  "I need a different day or time",
  "I booked by mistake",
  "Something else",
];

// PLACEHOLDERS: put your real support details here before launch.
export const SUPPORT = {
  phone: "[Your support number]",
  whatsapp: "[Your WhatsApp number]",
  email: "[Your support email]",
  hours: "[Your support hours]",
};

export const HELP_TOPICS = ["A visit that went wrong", "Payment or refund", "The app is not working", "Something else"];

export const FAQ = [
  {
    q: "How are nurses and compounders checked?",
    a: "Before anyone can take a booking we check a government ID and their qualification certificate. For nurses we also check their registration with the state nursing council. The registration number is shown on every profile.",
  },
  {
    q: "Why do I need a prescription?",
    a: "Injections, IV drips and scheduled medication are given only against a doctor's prescription. We do not arrange doctor consultations, so please get it from your own doctor. Dressing and vitals checks do not need one.",
  },
  {
    q: "What can a compounder do?",
    a: "Compounders are trained helpers, not registered nurses. They do wound dressing and vitals checks only. Injections, drips and medication always go to a registered nurse.",
  },
  {
    // PROVISIONAL RULE: matches changeFee() in lib/booking.ts and the settings above. Change them together.
    q: "Can I cancel or change a booking?",
    a: "Yes, from the Bookings tab. It is free within 5 minutes of booking, and any time up to 2 hours before the visit. After that, or once the nurse has set off, the home visit charge is kept and paid to the nurse. We never keep more than that. Once care has started the visit cannot be cancelled. If the patient was hospitalised or got worse, tell support and we will waive the charge.",
  },
  {
    q: "What if the nurse is late or does not come?",
    a: "If the nurse is more than 30 minutes late, or has to cancel, you can cancel free of charge and you get a full refund.",
  },
  {
    q: "What if nobody is home when the nurse arrives?",
    a: "The nurse waits 10 minutes at the door and tries to call. After that the visit counts as missed and the home visit charge is kept.",
  },
  {
    q: "Is this for emergencies?",
    a: "No. For chest pain, heavy bleeding, trouble breathing or signs of a stroke, call 112.",
  },
];

// PLACEHOLDER legal pages. A lawyer must write the real text. These are only the headings to cover.
export const LEGAL = {
  terms: {
    title: "Terms of Use",
    points: [
      "Who can use the app, and booking on behalf of family members",
      "What the service is: connecting patients with verified nurses and compounders. It is not an emergency service",
      "Prescription rule for injections, IV drips and medication",
      "Bookings, cancellations and refunds",
      "Prices, payments and the urgent visit charge",
      "Behaviour and safety during a home visit",
      "Limits of liability",
      "Complaints and the grievance officer",
    ],
  },
  privacy: {
    title: "Privacy Policy",
    points: [
      "What we collect: phone number, name, address, family members, prescriptions, visit notes and readings, location during a visit",
      "Why we collect it, and the consent you gave",
      "Who sees it: the caregiver you book, and the family contact you choose",
      "How it is stored and protected",
      "Your rights: to see, correct or delete your data, and to withdraw consent",
      "How long records are kept",
      "Who to contact with a complaint",
    ],
  },
};
