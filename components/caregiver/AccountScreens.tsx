"use client";

// CAREGIVER APP: profile, help and support, terms and code of conduct.

import { useState } from "react";
import { useCg } from "@/lib/caregiver/store";
import { ID_TYPES } from "@/lib/caregiver/data";
import { cityName, maskAccount } from "@/lib/caregiver/rules";
import { SUPPORT } from "@/lib/data";
import { t } from "@/lib/i18n";
import { Icon } from "../Icon";
import { InstallCard } from "../InstallCard";
import { LanguageChips } from "../LanguageChips";
import { Header, Rows } from "../ui";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function CgProfileScreen() {
  const { state, set, go, open, reset } = useCg();
  const [askReset, setAskReset] = useState(false);
  const p = state.personal;
  const q = state.qualification;
  const nurse = state.role === "nurse";
  const completed = state.records.filter((r) => r.kind === "completed").length;
  const idName = ID_TYPES.find((x) => x.id === state.idProof?.type)?.name ?? "";

  return (
    <div className="screen">
      <div className="scroll scroll-top">
        <div className="row-inline" style={{ gap: 14 }}>
          {state.selfie?.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="avatar avatar-photo" src={state.selfie.dataUrl} alt="" width={60} height={60} />
          ) : (
            <span className="avatar avatar-solid display" style={{ width: 60, height: 60, fontSize: 22 }}>{(p?.name ?? "?").charAt(0).toUpperCase()}</span>
          )}
          <div className="stack-xs" style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24 }}>{p?.name ?? t("Your profile")}</h1>
            <div className="row-inline small" style={{ gap: 6 }}>
              {state.kycStatus === "approved" && <span className="pill pill-ok"><Icon name="shield" size={14} />{t("Verified")}</span>}
              <span className="muted">{nurse ? t("Registered nurse") : t("Compounder")}</span>
            </div>
          </div>
        </div>

        <Rows items={[
          { k: t("Phone"), v: `+91 ${state.phone}` },
          ...(p ? [{ k: t("Works in"), v: `${p.area}, ${cityName(p.cityId)}` }] : []),
          ...(q ? [{ k: nurse ? t("Registration") : t("Training"), v: nurse ? `${t(q.council)} · ${q.regNo}` : t(q.course) }] : []),
          { k: t("Rating"), v: completed > 0 ? t("4.9 (sample)") : t("No ratings yet") },
          { k: t("Visits done"), v: String(completed) },
        ]} />

        <div className="stack">
          <h2>{t("Language")}</h2>
          <LanguageChips value={state.lang} onChange={(lang) => set({ lang })} />
        </div>

        <div className="stack">
          <h2>{t("App on your phone")}</h2>
          <InstallCard />
        </div>

        <div className="stack">
          <h2>{t("Documents")}</h2>
          <div className="list">
            <DocRow label={t("Government ID")} value={idName ? `${t(idName)}${state.idProof?.type === "aadhaar" ? ` •••• ${state.idProof.number}` : ""}` : t("Not added")} ok={!!state.idProof} />
            <DocRow label={t("Selfie")} value={state.selfie ? t("Added") : t("Not added")} ok={!!state.selfie} />
            <DocRow label={nurse ? t("Registration certificate") : t("Training certificate")} value={q ? t(q.course) : t("Not added")} ok={!!q} />
            <DocRow label={t("Bank account for payouts")} value={state.bank ? `${maskAccount(state.bank.account)} · ${state.bank.ifsc}` : t("Not added")} ok={!!state.bank} />
          </div>
          <p className="small muted">{t("To change a verified document, contact support. It is checked again before the change.")}</p>
        </div>

        <div className="list">
          <button type="button" className="list-row" onClick={() => open("availability")}>
            <span className="row-inline"><Icon name="calendar" size={20} />{t("Work settings")}</span><span className="end"><Icon name="next" size={18} /></span>
          </button>
          <button type="button" className="list-row" onClick={() => open("help")}>
            <span className="row-inline"><Icon name="help" size={20} />{t("Help and support")}</span><span className="end"><Icon name="next" size={18} /></span>
          </button>
          <button type="button" className="list-row" onClick={() => open("legal", { legalDoc: "conduct" })}>
            <span className="row-inline"><Icon name="shield" size={20} />{t("Code of Conduct")}</span><span className="end"><Icon name="next" size={18} /></span>
          </button>
          <button type="button" className="list-row" onClick={() => open("legal", { legalDoc: "terms" })}>
            <span className="row-inline"><Icon name="file" size={20} />{t("Caregiver Terms")}</span><span className="end"><Icon name="next" size={18} /></span>
          </button>
          <a className="list-row" href={`${BASE}/`}>
            <span className="row-inline"><Icon name="logo" size={20} />{t("Open the patient app")}</span><span className="end"><Icon name="next" size={18} /></span>
          </a>
        </div>

        {/* Remove this block before launch. */}
        <div className="dashed-box stack">
          <h2>{t("Prototype tools")}</h2>
          {askReset ? (
            <div className="danger-box stack">
              <div className="strong">{t("Erase everything saved on this device?")}</div>
              <div className="actions">
                <button type="button" className="btn btn-danger-solid" style={{ minHeight: 48, fontSize: 16 }} onClick={reset}>{t("Yes, erase")}</button>
                <button type="button" className="btn btn-outline" onClick={() => setAskReset(false)}>{t("Keep")}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="link-btn" onClick={() => setAskReset(true)}>{t("Erase all data and start again")}</button>
          )}
        </div>

        <button type="button" className="btn btn-danger" onClick={() => go("login")}>{t("Log out")}</button>
        <div className="tiny muted" style={{ textAlign: "center" }}>{t("Version {v}", { v: process.env.NEXT_PUBLIC_APP_VERSION ?? "" })}</div>
      </div>
    </div>
  );
}

function DocRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="list-row">
      <span className="stack-xs" style={{ minWidth: 0 }}>
        <span className="strong">{label}</span>
        <span className="small muted">{value}</span>
      </span>
      <span className={ok ? "ok-text" : "muted"}><Icon name={ok ? "check" : "alert"} size={20} strokeWidth={2.5} /></span>
    </div>
  );
}

/* ---------- Help ---------- */

const CG_FAQ = [
  { q: "When do I get paid?", a: "Every Monday, for the visits you finished from Monday to Sunday. The money goes to the bank account in your profile. Cash you collected from patients is taken off the amount." },
  { q: "How much do I earn per visit?", a: "You see the exact amount before you accept. You keep 80% of the service price, the full Rs 49 home visit charge, and half of any urgent charge." },
  { q: "What if nobody is home?", a: "Wait 10 minutes at the door and keep calling. Then mark the visit as missed, and you get the Rs 49 home visit charge." },
  { q: "What if the prescription or medicine does not match?", a: "Do not give it. Tap “Something does not match”, explain kindly to the family and call support. You still get the home visit charge." },
  { q: "Can compounders give injections?", a: "No. Injections, IV drips and medication are only for registered nurses. Compounders take wound dressing, elder care dressing and vitals checks." },
  { q: "What if I feel unsafe at a visit?", a: "Leave and call 112. Press SOS on the visit screen so our team knows where you are." },
  { q: "Can I cancel a visit I accepted?", a: "Yes, from the visit. Do it as early as you can so the patient can find someone else. Frequent late cancellations are looked at by our team." },
];

export function CgHelpScreen() {
  const { back } = useCg();
  const [openQ, setOpenQ] = useState<number | null>(null);
  return (
    <div className="screen">
      <Header title={t("Help and support")} onBack={() => back()} />
      <div className="scroll gap-lg">
        <div className="danger-box stack-sm">
          <div className="strong">{t("In an emergency, call 112")}</div>
          <div className="small">{t("If a patient is seriously unwell, call 112 first, then tell support.")}</div>
        </div>
        <div className="stack">
          <h2>{t("Common questions")}</h2>
          <div className="list">
            {CG_FAQ.map((item, i) => (
              <div key={item.q} style={{ borderBottom: i < CG_FAQ.length - 1 ? "1px solid #edf1ee" : 0 }}>
                <button type="button" className="faq-q" aria-expanded={openQ === i} onClick={() => setOpenQ(openQ === i ? null : i)}>
                  <span>{t(item.q)}</span>
                  <span className="muted" style={{ transform: openQ === i ? "rotate(90deg)" : "none", display: "flex" }}><Icon name="next" size={20} /></span>
                </button>
                {openQ === i && <div className="faq-a">{t(item.a)}</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="stack">
          <h2>{t("Talk to us")}</h2>
          <Rows items={[
            { k: t("Phone"), v: SUPPORT.phone },
            { k: "WhatsApp", v: SUPPORT.whatsapp },
            { k: t("Email"), v: SUPPORT.email },
            { k: t("Hours"), v: SUPPORT.hours },
          ]} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Terms and Code of Conduct (placeholders) ---------- */

const CG_LEGAL = {
  terms: {
    title: "Caregiver Terms",
    points: [
      "Your relationship with the platform: independent professional or employee, and what that means for tax and insurance",
      "Who can join: checks of ID, qualification and state nursing council registration",
      "Which services you may take, by qualification",
      "Fees, your share of each visit, and weekly payouts",
      "Cancellations, late arrival and missed visits",
      "Patient privacy and health data",
      "Suspension and removal from the platform",
      "Complaints and the grievance officer",
    ],
  },
  conduct: {
    title: "Code of Conduct",
    points: [
      "Arrive on time, in clean clothes, and show your ID if asked",
      "Never give a medicine without a matching prescription",
      "Use new, sterile supplies for every patient and dispose of sharps safely",
      "Explain each step and ask for consent before you touch the patient",
      "Never ask for extra money, and do not share your personal number",
      "Keep everything you see and hear in the home private",
      "Report any accident, reaction or concern to support the same day",
    ],
  },
};

export function CgLegalScreen() {
  const { state, back } = useCg();
  const doc = CG_LEGAL[state.legalDoc];
  return (
    <div className="screen screen-white">
      <Header title={t(doc.title)} onBack={() => back()} />
      <div className="scroll">
        <h1>{t(doc.title)}</h1>
        <div className="legal-note">{t("Placeholder. The real text must be written by a lawyer before launch. These are the sections it needs to cover.")}</div>
        <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          {doc.points.map((point) => <li key={point}>{t(point)}</li>)}
        </ol>
      </div>
    </div>
  );
}
