// All translations, joined. Each entry is [English, Telugu, Kannada].
// Add new texts to the newest file (or a new strings-N.ts per version) and list it here.
import { STRINGS_1 } from "./strings-1";
import { STRINGS_2 } from "./strings-2";
import { STRINGS_3 } from "./strings-3";
import { STRINGS_4 } from "./strings-4";
import { STRINGS_5 } from "./strings-5";

export const STRINGS: [string, string, string][] = [...STRINGS_1, ...STRINGS_2, ...STRINGS_3, ...STRINGS_4, ...STRINGS_5];
