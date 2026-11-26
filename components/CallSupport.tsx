"use client";

// "Call support" (2.2.0): while private calls through us (Exotel) are not set up, or a call fails, the patient
// and caregiver can ring the support number the owner set in the admin panel (Settings → Support contacts).

import { SUPPORT, SUPPORT_PLACEHOLDER } from "@/lib/data";
import { t } from "@/lib/i18n";

/** The support number as a tel: link, or null while it is still the placeholder. */
export function supportTel(): string | null {
  const raw = SUPPORT.phone.trim();
  if (!raw || raw === SUPPORT_PLACEHOLDER.phone) return null;
  const d = raw.replace(/[^\d+]/g, "");
  if (d.replace(/\D/g, "").length < 6) return null;
  return d.startsWith("+") ? d : d.length === 10 ? `+91${d}` : `+${d}`;
}

export function CallSupportButton({ compact = false }: { compact?: boolean }) {
  const tel = supportTel();
  if (!tel) return null;
  return (
    <a className={`btn btn-outline${compact ? " btn-sm" : ""}`} href={`tel:${tel}`} style={{ minHeight: 44 }}>
      {t("Call support ({phone})", { phone: SUPPORT.phone })}
    </a>
  );
}
