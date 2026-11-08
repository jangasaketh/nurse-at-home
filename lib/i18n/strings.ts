// All translations, joined. Each entry is [English, Telugu, Kannada].
// Add new texts to the newest file (or a new strings-N.ts per version) and list it here.
import { STRINGS_1 } from "./strings-1";
import { STRINGS_2 } from "./strings-2";
import { STRINGS_3 } from "./strings-3";
import { STRINGS_4 } from "./strings-4";
import { STRINGS_5 } from "./strings-5";
import { STRINGS_6 } from "./strings-6"; // caregiver app: sign-in, verification, jobs
import { STRINGS_7 } from "./strings-7"; // caregiver app: visit, record, schedule, earnings, profile
import { STRINGS_8 } from "./strings-8"; // caregiver app 1.0.5: notifications, ratings, reports, payouts, renewal
import { STRINGS_9 } from "./strings-9"; // caregiver app 1.0.6: decisions from the admin panel
import { STRINGS_10 } from "./strings-10"; // 1.1.0: real sign-in, demo link, saving to the account
import { STRINGS_11 } from "./strings-11"; // 1.2.0: sending verification documents
import { STRINGS_12 } from "./strings-12"; // 1.3.0: real bookings
import { STRINGS_13 } from "./strings-13"; // 1.4.0: settings from the server
import { STRINGS_14 } from "./strings-14"; // 1.5.0: online payment
import { STRINGS_15 } from "./strings-15"; // 1.6.0: notifications on the phone
import { STRINGS_16 } from "./strings-16"; // 1.7.0: maps and private calls
import { STRINGS_17 } from "./strings-17"; // 1.8.0: support for real, SOS

export const STRINGS: [string, string, string][] = [
  ...STRINGS_1, ...STRINGS_2, ...STRINGS_3, ...STRINGS_4, ...STRINGS_5, ...STRINGS_6, ...STRINGS_7, ...STRINGS_8, ...STRINGS_9, ...STRINGS_10, ...STRINGS_11, ...STRINGS_12, ...STRINGS_13, ...STRINGS_14, ...STRINGS_15, ...STRINGS_16, ...STRINGS_17,
];
