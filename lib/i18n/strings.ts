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

export const STRINGS: [string, string, string][] = [
  ...STRINGS_1, ...STRINGS_2, ...STRINGS_3, ...STRINGS_4, ...STRINGS_5, ...STRINGS_6, ...STRINGS_7, ...STRINGS_8, ...STRINGS_9, ...STRINGS_10, ...STRINGS_11,
];
