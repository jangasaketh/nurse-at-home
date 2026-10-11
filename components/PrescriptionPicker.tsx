"use client";

// Adding a prescription in the patient app: take a photo, or choose a photo or PDF.
// The picker itself is shared with the caregiver app (components/PhotoPicker.tsx).

import type { ReactNode } from "react";
import type { Prescription } from "@/lib/prescription";
import { t } from "@/lib/i18n";
import { PhotoCard, PhotoPicker } from "./PhotoPicker";

export function PrescriptionPicker({ value, onChange }: { value: Prescription | null; onChange: (p: Prescription | null) => void }) {
  return (
    <PhotoPicker
      value={value}
      onChange={onChange}
      testId="rx"
      label={t("Prescription")}
      tip={t("Make sure the doctor's name, the date, and each medicine and dose can be read.")}
    />
  );
}

/** A saved prescription: thumbnail, name, and a full-size view. Extra buttons go in children. */
export function PrescriptionCard({ p, children }: { p: Prescription; children?: ReactNode }) {
  return <PhotoCard p={p} label={t("Prescription")}>{children}</PhotoCard>;
}
