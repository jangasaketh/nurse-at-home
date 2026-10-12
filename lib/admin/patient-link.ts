// ADMIN PANEL ↔ PATIENT APP, for the prototype: the patient signed in to the patient app in this browser is
// shown in the Patients list (read only). When the backend exists, patients come from the API instead.

import type { AppState } from "@/lib/store";
import { SELF, serviceById, tx } from "@/lib/booking";
import type { PatientAccount } from "./data";

export const PATIENT_STORAGE_KEY = "nurse-at-home:v3";

export type LivePatient = {
  account: PatientAccount;
  booking: { service: string; when: string; visits: number; visitNo: number; pay: string; prescription: boolean } | null;
  records: { title: string; when: string; status: string; by: string }[];
};

export function readPatient(): LivePatient | null {
  try {
    const raw = window.localStorage.getItem(PATIENT_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<AppState>;
    if (!p.profileDone) return null;
    const people = p.patients ?? [];
    const me = people.find((x) => x.relation === SELF);
    const name = me?.name || p.nameDraft || "Patient";
    const addresses = (p.addresses ?? []).map((a) => ({ label: a.label, line: a.line, area: a.area, cityId: a.cityId, pincode: a.pincode }));
    const b = p.booking;
    return {
      account: {
        id: "live-patient",
        live: true,
        name,
        phone: p.phone ?? "",
        cityId: addresses[0]?.cityId ?? "hyd",
        joinedAt: Date.now(),
        family: people.map((x) => ({ name: x.relation === SELF ? name : x.name, relation: x.relation === SELF ? "Self" : x.relation, age: x.age ?? 0, gender: (x.gender || "F") as "F" | "M" })),
        addresses,
        dues: p.arrears ?? 0,
        contact: p.contact ? `${p.contact.name} (${p.contact.relation.toLowerCase()}), ${p.contact.phone}` : null,
      },
      booking: b ? {
        service: serviceById(b.serviceId).name,
        when: `${b.startDate}, ${b.slot}`,
        visits: b.visits,
        visitNo: b.visitNo,
        pay: b.pay === "cash" ? "Cash" : b.pay.toUpperCase(),
        prescription: !!b.prescription,
      } : null,
      records: (p.history ?? []).map((r) => ({ title: tx(r.title), when: tx(r.when), status: r.status, by: r.by })),
    };
  } catch {
    return null;
  }
}
