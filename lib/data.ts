// SAMPLE DATA. Every name, price, rating and review here is a placeholder.
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
    price: 150,
    mins: "15 minutes",
    needsPrescription: false,
    nurseOnly: false,
    icon: "pulse",
    nurseBrings: "BP monitor, glucometer, thermometer and pulse oximeter",
    youKeepReady: "Earlier reports, if you have them",
    includes: [
      "Measures BP, pulse, temperature and oxygen",
      "Finger-prick blood sugar if needed",
      "Saves the readings to your records",
    ],
    note: "All readings taken and saved below.",
  },
];

export type Patient = { id: string; name: string; chip: string; meta: string; full: string };

export const PATIENTS: Patient[] = [
  { id: "p1", name: "Kavya", chip: "Me", meta: "You, 34", full: "Kavya (you), 34" },
  { id: "p2", name: "Lakshmi", chip: "Lakshmi · Mother", meta: "Mother, 62", full: "Lakshmi (mother), 62" },
  { id: "p3", name: "Ramesh", chip: "Ramesh · Father", meta: "Father, 68", full: "Ramesh (father), 68" },
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
};

export const CAREGIVERS: Caregiver[] = [
  { id: "c1", name: "Anjali Thomas", first: "Anjali", initials: "AT", qualification: "Registered nurse · GNM", isNurse: true, experience: "8 years", distance: "1.2 km", rating: "4.9", visitCount: "212", speaks: ["LOCAL", "English", "Hindi"], gender: "F", regNo: "48213" },
  { id: "c2", name: "Mohammed Irfan", first: "Irfan", initials: "MI", qualification: "Registered nurse · B.Sc Nursing", isNurse: true, experience: "5 years", distance: "2.4 km", rating: "4.8", visitCount: "147", speaks: ["LOCAL", "Hindi", "Urdu", "English"], gender: "M", regNo: "51907" },
  { id: "c3", name: "Sunita Yadav", first: "Sunita", initials: "SY", qualification: "Registered nurse · GNM", isNurse: true, experience: "11 years", distance: "3.1 km", rating: "4.7", visitCount: "389", speaks: ["Hindi", "English"], gender: "F", regNo: "33684" },
  { id: "c4", name: "Ravi Kumar", first: "Ravi", initials: "RK", qualification: "Compounder · wound-care trained", isNurse: false, experience: "14 years", distance: "0.9 km", rating: "4.6", visitCount: "501", speaks: ["LOCAL", "Hindi"], gender: "M", regNo: "7716" },
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

export const HOUSE = "Flat 204, Green Park Residency"; // sample address; the area comes from the city
export const VISIT_FEE = 49; // home visit charge per visit, rupees
// Early-morning and late-night slots are on purpose: insulin before breakfast, night-time injections.
export const SLOTS = ["6:00 AM", "9:00 AM", "12:00 PM", "4:00 PM", "7:00 PM", "10:00 PM"];
export const URGENT_SLOT = "within 60 minutes";
export const FAMILY_CONTACT = "Suresh (brother)";
export const VISIT_COUNTS = [3, 5, 7, 10, 14];
export const ARRIVAL_CODE = "4821";

export const SAMPLE_REVIEWS = [
  { text: "Came on time and was gentle with my mother. Explained every step before doing it.", who: "Sample review · daughter of a patient" },
  { text: "Clean, careful work and the visit notes were easy to share with our doctor.", who: "Sample review · son of a patient" },
];

export const SAMPLE_VITALS = [
  { k: "Blood pressure", v: "128/82 mmHg" },
  { k: "Pulse", v: "76 bpm" },
  { k: "Temperature", v: "98.4 °F" },
  { k: "Oxygen (SpO2)", v: "98%" },
];

export const SAMPLE_PAST_VISITS = [
  { title: "Wound dressing", when: "28 Sep, 9:00 AM", who: "Ramesh · Father", by: "Ravi Kumar", note: "Stitches site cleaned and re-dressed. Healing well, no swelling." },
  { title: "Vitals check", when: "21 Sep, 6:30 PM", who: "Lakshmi · Mother", by: "Sunita Yadav", note: "BP 134/86 mmHg, fasting sugar 118 mg/dL, SpO2 97%." },
];
