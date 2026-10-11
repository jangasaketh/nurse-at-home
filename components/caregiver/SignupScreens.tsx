"use client";

// CAREGIVER APP: sign in, choose a role, and get verified (KYC).

import { useState, type FormEvent } from "react";
import { approvalPatch, useCg, KYC_STEPS, type CgState, type KycStep, type Qualification } from "@/lib/caregiver/store";
import { sampleValidUntil } from "@/lib/caregiver/engine";
import { COMPOUNDER_TRAINING, ID_TYPES, NURSE_COURSES, servicesForRole, SPOKEN_LANGUAGES, type IdType } from "@/lib/caregiver/data";
import { cityState, idNumberError, IFSC_RE, isAdult, STEP_TITLES, stepDone, UPI_RE } from "@/lib/caregiver/rules";
import { CITIES } from "@/lib/data";
import { useAction } from "@/lib/fake-api";
import { t } from "@/lib/i18n";
import type { PhotoFile } from "@/lib/prescription";
import { Icon } from "../Icon";
import { LanguageChips } from "../LanguageChips";
import { PhotoPicker } from "../PhotoPicker";
import { ActionError, BottomBar, CheckRow, Chip, Header, RadioCard, TextField } from "../ui";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

/** Prototype: a grey "SAMPLE" picture standing in for a document photo. */
const samplePhoto = (name: string): PhotoFile => ({
  kind: "image",
  name,
  size: 1200,
  dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#e9eef3"/><text x="200" y="260" font-family="sans-serif" font-size="42" font-weight="700" fill="#7a8794" text-anchor="middle">SAMPLE</text></svg>')}`,
  addedAt: Date.now(),
});

/* ---------- Sign in ---------- */

export function CgLoginScreen() {
  const { state, set } = useCg();
  const [error, setError] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (state.phone.length === 10) set({ screen: "otp", trail: [] });
    else setError(true);
  };
  return (
    <form className="screen screen-white login" onSubmit={submit} noValidate>
      <div className="row-inline" style={{ gap: 10 }}>
        <div className="logo"><Icon name="bag" size={24} /></div>
        <div className="stack-xs" style={{ gap: 0 }}>
          <div className="brand">Nurse at Home</div>
          <div className="brand-sub">{t("For caregivers")}</div>
        </div>
      </div>
      <LanguageChips value={state.lang} onChange={(lang) => set({ lang })} />
      <div className="stack">
        <h1>{t("Home-visit work for nurses and compounders.")}</h1>
        <p className="muted" style={{ fontSize: 17 }}>
          {t("Get visit requests near you, follow each visit step by step, and get paid every week.")}
        </p>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <label htmlFor="cg-phone">{t("Mobile number")}</label>
        <div className="field">
          <span className="strong" style={{ fontSize: 18 }}>+91</span>
          <input id="cg-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={state.phone}
            onChange={(e) => { set({ phone: digits(e.target.value, 10) }); setError(false); }} />
        </div>
        {error && <div role="alert" className="error">{t("Enter a 10-digit mobile number.")}</div>}
        <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>{t("Send OTP")}</button>
      </div>
      <div className="spacer" />
      <div className="stack-sm">
        <a className="link-btn small" href={`${BASE}/`}>{t("Need a nurse at home? Open the patient app")}</a>
        <p className="tiny muted">{t("Prototype. Requests, patients and earnings are examples. What you enter stays on this device.")}</p>
      </div>
    </form>
  );
}

export function CgOtpScreen() {
  const { state, set, go } = useCg();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return setError(true);
    const screen = state.kycStatus === "approved" ? "jobs" : state.kycStatus === "submitted" ? "review" : state.role ? "kyc" : "role";
    set({ screen, trail: [] });
  };
  return (
    <form className="screen screen-white" onSubmit={submit} noValidate>
      <Header title="" onBack={() => go("login")} />
      <div className="scroll gap-lg" style={{ padding: "16px 24px 24px" }}>
        <div className="stack" style={{ gap: 8 }}>
          <h1 style={{ fontSize: 30 }}>{t("Enter the 6-digit code")}</h1>
          <p className="muted">{t("Sent by SMS to +91 {phone}", { phone: state.phone })}</p>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <label htmlFor="cg-otp">{t("One-time code")}</label>
          <input id="cg-otp" className="otp-input" type="tel" inputMode="numeric" autoComplete="one-time-code" value={otp}
            onChange={(e) => { setOtp(digits(e.target.value, 6)); setError(false); }} />
          {error && <div role="alert" className="error">{t("Enter all 6 digits of the code.")}</div>}
          <p className="small muted">{t("Prototype: any 6 digits work.")}</p>
        </div>
        <button type="submit" className="btn btn-primary">{t("Verify and continue")}</button>
      </div>
    </form>
  );
}

/* ---------- Role ---------- */

export function RoleScreen() {
  const { state, set, go } = useCg();
  const [role, setRole] = useState(state.role);
  const [tried, setTried] = useState(false);
  const next = () => {
    setTried(true);
    if (!role) return;
    // Switching role means a different qualification, so that step starts again.
    set({ role, qualification: role === state.role ? state.qualification : null, screen: "kyc", trail: ["role"] });
  };
  return (
    <div className="screen">
      <Header title={t("Get started")} onBack={() => go("login")} />
      <div className="scroll">
        <h1>{t("How do you work?")}</h1>
        <p className="muted">{t("This decides which visits you are offered.")}</p>
        <RadioCard selected={role === "nurse"} onClick={() => setRole("nurse")} label={t("Registered nurse")}
          sub={t("ANM, GNM or B.Sc Nursing, registered with a state nursing council. You can take every service.")} />
        <RadioCard selected={role === "compounder"} onClick={() => setRole("compounder")} label={t("Compounder or trained helper")}
          sub={t("Trained in dressing and basic care. You can take wound dressing, elder care dressing and vitals checks.")} />
        {role === "compounder" && (
          <div className="warn-box small">{t("Injections, IV drips and medication are only for registered nurses. This keeps patients safe.")}</div>
        )}
        {tried && !role && <div role="alert" className="error">{t("Choose one to continue.")}</div>}
      </div>
      <BottomBar><button type="button" className="btn btn-primary" onClick={next}>{t("Continue")}</button></BottomBar>
    </div>
  );
}

/* ---------- Verification checklist ---------- */

export function KycScreen() {
  const { state, set, update, open, go } = useCg();
  const action = useAction(false);
  const [tried, setTried] = useState(false);
  const done = KYC_STEPS.filter((s) => stepDone(s, state)).length;
  const allDone = done === KYC_STEPS.length;
  const needsFix = state.rejected?.step;

  const screenFor: Record<KycStep, "kyc-personal" | "kyc-id" | "kyc-selfie" | "kyc-qualification" | "kyc-bank"> = {
    personal: "kyc-personal", id: "kyc-id", selfie: "kyc-selfie", qualification: "kyc-qualification", bank: "kyc-bank",
  };

  const submit = () => {
    setTried(true);
    if (!allDone || !state.agreed || needsFix) return;
    // TODO: send the documents to the verification service (admin panel review).
    action.run(() => set({ kycStatus: "submitted", rejected: null, screen: "review", trail: [] }));
  };

  // Prototype only: fill whatever is missing with sample data and approve, so every caregiver screen can be tried.
  const skipVerification = () => {
    const city = state.personal?.cityId ?? "hyd";
    const nurse = state.role !== "compounder";
    const filled: Partial<CgState> = {
      personal: state.personal ?? { name: "Kavya Reddy", gender: "F", dob: "1992-05-14", languages: ["Telugu", "English"], cityId: city, area: "Kondapur", pincode: "500084" },
      idProof: state.idProof?.photo ? state.idProof : { type: "aadhaar", number: "1234", photo: samplePhoto("id.jpg") },
      selfie: state.selfie ?? samplePhoto("selfie.jpg"),
      qualification: state.qualification?.certificate ? state.qualification : {
        course: nurse ? "GNM" : "First aid and wound care course", council: nurse ? cityState(city) : "", regNo: nurse ? "48213" : "",
        years: "5", certificate: samplePhoto("certificate.jpg"), refName: "", refPhone: "",
        // About six weeks away, so the renewal reminder can be seen.
        validUntil: nurse ? sampleValidUntil() : undefined,
      },
      bank: state.bank ?? { holder: state.personal?.name ?? "Kavya Reddy", account: "123456789012", ifsc: "SBIN0001234", upi: "" },
      agreed: true,
    };
    update((prev) => ({ ...filled, ...approvalPatch({ ...prev, ...filled }), screen: "review", trail: [] }));
  };

  return (
    <div className="screen">
      <Header title={t("Get verified")} onBack={() => go(state.kycStatus === "rejected" ? "review" : "role")} />
      <div className="scroll">
        <div className="stack" style={{ gap: 6 }}>
          <h1>{t("We check every caregiver before their first visit")}</h1>
          <p className="muted">{t("Patients see that you are verified. It usually takes 2 working days after you send your documents.")}</p>
        </div>
        <div className="stack-sm">
          <div className="between small"><span className="strong">{t("{n} of {total} done", { n: done, total: KYC_STEPS.length })}</span></div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={KYC_STEPS.length} aria-valuenow={done}>
            <span style={{ width: `${(done / KYC_STEPS.length) * 100}%` }} />
          </div>
        </div>
        {/* Prototype only: there is no verification team yet. Remove before launch. */}
        <div className="dashed-box stack-sm">
          <button type="button" className="btn btn-demo" onClick={skipVerification}>{t("Prototype: skip verification")}</button>
          <span className="small muted">{t("Fills sample details and documents for any step not done yet, and approves you straight away. Fill “Your details” first if you want your own name or city.")}</span>
        </div>
        {state.rejected && (
          <div className="danger-box stack-sm" role="alert">
            <div className="strong">{t("One document needs another look")}</div>
            <div className="small">{t(state.rejected.reason)}</div>
          </div>
        )}
        <div className="list">
          {KYC_STEPS.map((step, i) => {
            const fix = needsFix === step;
            const ok = stepDone(step, state) && !fix;
            return (
              <button type="button" key={step} className="list-row kyc-row" onClick={() => open(screenFor[step])}>
                <span className={`kyc-num ${ok ? "ok" : fix ? "fix" : ""}`}>{ok ? <Icon name="check" size={16} strokeWidth={3} /> : i + 1}</span>
                <span className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
                  <span className="strong">{t(STEP_TITLES[step])}</span>
                  <span className={`small ${fix ? "error" : ok ? "ok-text" : "muted"}`}>
                    {fix ? t("Needs a new photo") : ok ? t("Done") : t("Not started")}
                  </span>
                </span>
                <span className="end"><Icon name="next" size={18} /></span>
              </button>
            );
          })}
        </div>
        <CheckRow id="cg-agree" checked={state.agreed} onChange={(v) => set({ agreed: v })}>
          <span className="stack-xs">
            <span>{t("I agree to the Caregiver Terms and the Code of Conduct, and I allow my documents to be checked.")}</span>
            <span className="row-inline" style={{ gap: 14 }}>
              <button type="button" className="link-btn small" onClick={(e) => { e.preventDefault(); open("legal", { legalDoc: "terms" }); }}>{t("Caregiver Terms")}</button>
              <button type="button" className="link-btn small" onClick={(e) => { e.preventDefault(); open("legal", { legalDoc: "conduct" }); }}>{t("Code of Conduct")}</button>
            </span>
          </span>
        </CheckRow>
        {tried && !allDone && <div role="alert" className="error">{t("Finish every step first.")}</div>}
        {tried && allDone && needsFix && <div role="alert" className="error">{t("Fix the document marked in red first.")}</div>}
        {tried && allDone && !needsFix && !state.agreed && <div role="alert" className="error">{t("Tick the box to continue.")}</div>}
      </div>
      <BottomBar>
        {action.failed && <ActionError />}
        <button type="button" className="btn btn-primary" disabled={action.busy} onClick={submit}>
          {action.busy ? t("Sending…") : t("Send for verification")}
        </button>
      </BottomBar>
    </div>
  );
}

/* ---------- Step: your details ---------- */

export function PersonalScreen() {
  const { state, back } = useCg();
  const p = state.personal;
  const [name, setName] = useState(p?.name ?? "");
  const [gender, setGender] = useState<"F" | "M" | "">(p?.gender ?? "");
  const [dob, setDob] = useState(p?.dob ?? "");
  const [languages, setLanguages] = useState<string[]>(p?.languages ?? []);
  const [cityId, setCityId] = useState(p?.cityId ?? "");
  const [area, setArea] = useState(p?.area ?? "");
  const [pincode, setPincode] = useState(p?.pincode ?? "");
  const [tried, setTried] = useState(false);

  const errors = {
    name: name.trim().length < 3 ? t("Enter your full name as on your ID.") : "",
    gender: !gender ? t("Choose one.") : "",
    dob: !dob ? t("Enter your date of birth.") : !isAdult(dob) ? t("You must be at least 18 years old.") : "",
    languages: languages.length === 0 ? t("Choose at least one language.") : "",
    city: !cityId ? t("Choose the city you work in.") : "",
    area: area.trim().length < 2 ? t("Enter your area.") : "",
    pincode: pincode.length !== 6 ? t("Enter the 6-digit PIN code.") : "",
  };
  const save = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    back({ personal: { name: name.trim(), gender, dob, languages, cityId, area: area.trim(), pincode } });
  };
  const toggle = (l: string) => setLanguages((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));

  return (
    <div className="screen">
      <Header title={t("Your details")} onBack={() => back()} />
      <div className="scroll">
        <TextField id="cg-name" label={t("Full name (as on your ID)")} value={name} onChange={setName} error={tried ? errors.name : ""} autoComplete="name" />
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">{t("You are a")}</span>
          <div className="grid grid-2" role="group" aria-label={t("You are a")}>
            <Chip selected={gender === "F"} onClick={() => setGender("F")}>{t("Woman")}</Chip>
            <Chip selected={gender === "M"} onClick={() => setGender("M")}>{t("Man")}</Chip>
          </div>
          <span className="small muted">{t("Some patients ask for a woman caregiver. Only matching requests are sent to you.")}</span>
          {tried && errors.gender && <div role="alert" className="error">{errors.gender}</div>}
        </div>
        <TextField id="cg-dob" type="date" label={t("Date of birth")} value={dob} onChange={setDob} error={tried ? errors.dob : ""} />
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">{t("Languages you speak")}</span>
          <div className="wrap" role="group" aria-label={t("Languages you speak")}>
            {SPOKEN_LANGUAGES.map((l) => (
              <Chip key={l} className="chip-pill chip-toggle" selected={languages.includes(l)} onClick={() => toggle(l)}>{t(l)}</Chip>
            ))}
          </div>
          {tried && errors.languages && <div role="alert" className="error">{errors.languages}</div>}
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">{t("City you work in")}</span>
          <div className="wrap" role="group" aria-label={t("City you work in")}>
            {CITIES.map((c) => (
              <Chip key={c.id} className="chip-pill" selected={cityId === c.id} onClick={() => setCityId(c.id)}>{t(c.name)}</Chip>
            ))}
          </div>
          {tried && errors.city && <div role="alert" className="error">{errors.city}</div>}
        </div>
        <TextField id="cg-area" label={t("Your area")} placeholder={t("For example, Madhapur")} value={area} onChange={setArea} error={tried ? errors.area : ""} />
        <TextField id="cg-pin" label={t("PIN code")} inputMode="numeric" value={pincode} onChange={(v) => setPincode(digits(v, 6))} error={tried ? errors.pincode : ""} />
      </div>
      <BottomBar><button type="button" className="btn btn-primary" onClick={save}>{t("Save")}</button></BottomBar>
    </div>
  );
}

/* ---------- Step: government ID ---------- */

export function IdScreen() {
  const { state, back, set } = useCg();
  const cur = state.idProof;
  const [type, setType] = useState<IdType | "">(cur?.type ?? "");
  const [number, setNumber] = useState(cur?.number ?? "");
  const [photo, setPhoto] = useState<PhotoFile | null>(state.rejected?.step === "id" ? null : cur?.photo ?? null);
  const [tried, setTried] = useState(false);
  const numberError = type ? idNumberError(type, number) : t("Choose the type of ID.");
  const save = () => {
    setTried(true);
    if (!type || numberError || !photo) return;
    const fixed = state.rejected?.step === "id";
    set({ rejected: fixed ? null : state.rejected, kycStatus: fixed ? "draft" : state.kycStatus });
    back({ idProof: { type, number: number.trim().toUpperCase(), photo } });
  };
  return (
    <div className="screen">
      <Header title={t("Government ID")} onBack={() => back()} />
      <div className="scroll">
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">{t("Type of ID")}</span>
          <div className="grid grid-2" role="group" aria-label={t("Type of ID")}>
            {ID_TYPES.map((x) => (
              <Chip key={x.id} selected={type === x.id} onClick={() => { setType(x.id); setNumber(""); }}>{t(x.name)}</Chip>
            ))}
          </div>
          {tried && !type && <div role="alert" className="error">{t("Choose the type of ID.")}</div>}
        </div>
        {type && (
          <TextField id="cg-idno" label={type === "aadhaar" ? t("Last 4 digits of Aadhaar") : t("ID number")}
            inputMode={type === "aadhaar" ? "numeric" : "text"} value={number}
            onChange={(v) => setNumber(type === "aadhaar" ? digits(v, 4) : v.toUpperCase().slice(0, 18))}
            hint={type === "aadhaar" ? t("For your privacy we only ask for the last 4 digits. You can cover the first 8 digits in the photo.") : undefined}
            error={tried && numberError ? t(numberError) : ""} />
        )}
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">{t("Photo of the front of your ID")}</span>
          {state.rejected?.step === "id" && <div className="error" role="alert">{t(state.rejected.reason)}</div>}
          <PhotoPicker value={photo} onChange={setPhoto} testId="cg-id" allowPdf={false} tone="primary" label={t("Government ID")}
            tip={t("Lay the card flat in good light. All four corners and your name should be clear.")} />
          {tried && !photo && <div role="alert" className="error">{t("Add a photo of your ID.")}</div>}
        </div>
      </div>
      <BottomBar><button type="button" className="btn btn-primary" onClick={save}>{t("Save")}</button></BottomBar>
    </div>
  );
}

/* ---------- Step: selfie ---------- */

export function SelfieScreen() {
  const { state, back } = useCg();
  const [photo, setPhoto] = useState<PhotoFile | null>(state.selfie);
  const [tried, setTried] = useState(false);
  const save = () => {
    setTried(true);
    if (!photo) return;
    back({ selfie: photo });
  };
  return (
    <div className="screen">
      <Header title={t("Selfie")} onBack={() => back()} />
      <div className="scroll">
        <h1>{t("Take a selfie")}</h1>
        <p className="muted">{t("We match your face with the photo on your ID. Patients also see this photo before you arrive.")}</p>
        <ul className="install-steps">
          <li>{t("Face the light. No cap, mask or sunglasses.")}</li>
          <li>{t("Hold the phone at eye level, with your whole face in the picture.")}</li>
        </ul>
        <PhotoPicker value={photo} onChange={setPhoto} testId="cg-selfie" allowPdf={false} camera="user" tone="primary"
          takeLabel={t("Take a selfie")} chooseLabel={t("Choose a photo")} label={t("Selfie")} />
        {tried && !photo && <div role="alert" className="error">{t("Add a selfie to continue.")}</div>}
      </div>
      <BottomBar><button type="button" className="btn btn-primary" onClick={save}>{t("Save")}</button></BottomBar>
    </div>
  );
}

/* ---------- Step: qualification ---------- */

export function QualificationScreen() {
  const { state, back } = useCg();
  const nurse = state.role !== "compounder";
  const q = state.qualification;
  const defaultCouncil = cityState(state.personal?.cityId ?? "hyd");
  const [course, setCourse] = useState(q?.course ?? "");
  const [council, setCouncil] = useState(q?.council ?? defaultCouncil);
  const [regNo, setRegNo] = useState(q?.regNo ?? "");
  const [years, setYears] = useState(q?.years ?? "");
  const [validUntil, setValidUntil] = useState(q?.validUntil ?? "");
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [certificate, setCertificate] = useState<PhotoFile | null>(q?.certificate ?? null);
  const [refName, setRefName] = useState(q?.refName ?? "");
  const [refPhone, setRefPhone] = useState(q?.refPhone ?? "");
  const [tried, setTried] = useState(false);

  const errors = {
    course: !course ? (nurse ? t("Choose your nursing course.") : t("Choose your training.")) : "",
    regNo: nurse && !/^[A-Za-z0-9/-]{3,20}$/.test(regNo.trim()) ? t("Enter your registration number as on the certificate.") : "",
    validUntil: !nurse ? "" : !/^\d{4}-\d{2}$/.test(validUntil) ? t("Enter the month and year, like 2031-03.") : validUntil < thisMonth ? t("This registration has expired. Renew it with your council first.") : "",
    years: years === "" || Number(years) > 50 ? t("Enter your years of experience.") : "",
    certificate: !certificate ? (nurse ? t("Add a photo of your registration certificate.") : t("Add a photo of your training certificate.")) : "",
    refPhone: refPhone && refPhone.length !== 10 ? t("Enter a 10-digit mobile number.") : "",
  };
  const save = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    const value: Qualification = { course, council: nurse ? council : "", regNo: regNo.trim().toUpperCase(), years, certificate, refName: refName.trim(), refPhone, validUntil: nurse ? validUntil : undefined };
    back({ qualification: value });
  };

  return (
    <div className="screen">
      <Header title={t("Qualification")} onBack={() => back()} />
      <div className="scroll">
        {!nurse && (
          <div className="tint-box small">{t("As a compounder you can take wound dressing, elder care dressing and vitals checks.")}</div>
        )}
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">{nurse ? t("Nursing course") : t("Training")}</span>
          <div className="wrap" role="group" aria-label={nurse ? t("Nursing course") : t("Training")}>
            {(nurse ? NURSE_COURSES : COMPOUNDER_TRAINING).map((c) => (
              <Chip key={c} className="chip-pill" selected={course === c} onClick={() => setCourse(c)}>{t(c)}</Chip>
            ))}
          </div>
          {tried && errors.course && <div role="alert" className="error">{errors.course}</div>}
        </div>
        {nurse && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">{t("State nursing council")}</span>
            <div className="wrap" role="group" aria-label={t("State nursing council")}>
              {Array.from(new Set(CITIES.map((c) => c.state))).map((st) => (
                <Chip key={st} className="chip-pill" selected={council === st} onClick={() => setCouncil(st)}>{t(st)}</Chip>
              ))}
            </div>
            <span className="small muted">{t("Nurses must be registered in the state where they work.")}</span>
          </div>
        )}
        <TextField id="cg-reg" label={nurse ? t("Registration number") : t("Certificate number (if any)")} value={regNo} onChange={setRegNo} error={tried ? errors.regNo : ""} />
        {nurse && (
          <div className="stack" style={{ gap: 6 }}>
            <label htmlFor="cg-valid">{t("Registration valid until")}</label>
            <input id="cg-valid" className={`text-input ${tried && errors.validUntil ? "invalid" : ""}`} type="month" min={thisMonth} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            {tried && errors.validUntil ? <div role="alert" className="error">{errors.validUntil}</div> : <div className="small muted">{t("Printed on your registration certificate. We remind you before it expires.")}</div>}
          </div>
        )}
        <TextField id="cg-years" label={t("Years of experience")} inputMode="numeric" value={years} onChange={(v) => setYears(digits(v, 2))} error={tried ? errors.years : ""} />
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">{nurse ? t("Registration certificate") : t("Training certificate")}</span>
          <PhotoPicker value={certificate} onChange={setCertificate} testId="cg-cert" tone="primary" genericPdfMessage
            label={nurse ? t("Registration certificate") : t("Training certificate")}
            tip={t("The whole certificate, with your name and number readable.")} />
          {tried && errors.certificate && <div role="alert" className="error">{errors.certificate}</div>}
        </div>
        {!nurse && (
          <div className="stack">
            <h2>{t("A doctor or clinic who knows your work")}</h2>
            <p className="small muted">{t("Optional, but it helps us verify you faster.")}</p>
            <TextField id="cg-ref-name" label={t("Doctor or clinic name")} value={refName} onChange={setRefName} />
            <TextField id="cg-ref-phone" label={t("Their phone number")} inputMode="numeric" value={refPhone} onChange={(v) => setRefPhone(digits(v, 10))} error={tried ? errors.refPhone : ""} />
          </div>
        )}
      </div>
      <BottomBar><button type="button" className="btn btn-primary" onClick={save}>{t("Save")}</button></BottomBar>
    </div>
  );
}

/* ---------- Step: bank account ---------- */

export function BankScreen() {
  const { state, back } = useCg();
  const b = state.bank;
  const [holder, setHolder] = useState(b?.holder ?? state.personal?.name ?? "");
  const [account, setAccount] = useState(b?.account ?? "");
  const [confirm, setConfirm] = useState(b?.account ?? "");
  const [ifsc, setIfsc] = useState(b?.ifsc ?? "");
  const [upi, setUpi] = useState(b?.upi ?? "");
  const [tried, setTried] = useState(false);
  const errors = {
    holder: holder.trim().length < 3 ? t("Enter the name on the bank account.") : "",
    account: !/^\d{9,18}$/.test(account) ? t("Enter an account number of 9 to 18 digits.") : "",
    confirm: confirm !== account ? t("The account numbers do not match.") : "",
    ifsc: !IFSC_RE.test(ifsc) ? t("Enter an IFSC code like SBIN0001234.") : "",
    upi: upi && !UPI_RE.test(upi) ? t("Enter a UPI ID like name@bank, or leave it empty.") : "",
  };
  const save = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    back({ bank: { holder: holder.trim(), account, ifsc, upi: upi.trim() } });
  };
  return (
    <div className="screen">
      <Header title={t("Bank account for payouts")} onBack={() => back()} />
      <div className="scroll">
        <div className="tint-box small">{t("Your earnings are paid to this account every Monday. We never ask for your bank PIN or OTP.")}</div>
        <TextField id="cg-holder" label={t("Account holder name")} value={holder} onChange={setHolder} error={tried ? errors.holder : ""} />
        <TextField id="cg-acc" label={t("Account number")} inputMode="numeric" value={account} onChange={(v) => setAccount(digits(v, 18))} error={tried ? errors.account : ""} />
        <TextField id="cg-acc2" label={t("Account number again")} inputMode="numeric" value={confirm} onChange={(v) => setConfirm(digits(v, 18))} error={tried ? errors.confirm : ""} />
        <TextField id="cg-ifsc" label={t("IFSC code")} value={ifsc} onChange={(v) => setIfsc(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))} error={tried ? errors.ifsc : ""}
          hint={t("Printed on your cheque book or passbook.")} />
        <TextField id="cg-upi" label={t("UPI ID (optional)")} value={upi} onChange={setUpi} error={tried ? errors.upi : ""} />
      </div>
      <BottomBar><button type="button" className="btn btn-primary" onClick={save}>{t("Save")}</button></BottomBar>
    </div>
  );
}

/* ---------- Waiting for verification ---------- */

export function ReviewScreen() {
  const { state, set, update, go, open } = useCg();
  const status = state.kycStatus;
  const services = servicesForRole(state.role ?? "nurse");

  if (status === "approved") {
    return (
      <div className="screen">
        <div className="scroll" style={{ paddingTop: 36 }}>
          <div className="done-check"><Icon name="check" size={26} strokeWidth={3} /></div>
          <h1>{t("You are verified")}</h1>
          <p className="muted">{state.role === "nurse" ? t("Your nursing registration is confirmed.") : t("Your training is confirmed.")}</p>
          <div className="card stack">
            <h2>{t("Visits you can take")}</h2>
            {services.map((s) => (
              <div key={s.id} className="row-inline"><span className="primary-text"><Icon name={s.icon} size={20} /></span>{t(s.name)}</div>
            ))}
          </div>
          <p className="small muted">{t("Next: go online on the Jobs screen to start getting requests near you.")}</p>
        </div>
        <BottomBar><button type="button" className="btn btn-primary" onClick={() => go("jobs")}>{t("Start taking visits")}</button></BottomBar>
      </div>
    );
  }

  if (status === "rejected" && state.rejected) {
    return (
      <div className="screen">
        <Header title={t("Verification")} />
        <div className="scroll">
          <span className="state-icon danger"><Icon name="alert" size={24} /></span>
          <h1>{t("One document needs another look")}</h1>
          <div className="danger-box">{t(state.rejected.reason)}</div>
          <p className="muted">{t("Fix it and send it again. Everything else you sent is kept.")}</p>
        </div>
        <BottomBar>
          <button type="button" className="btn btn-primary" onClick={() => open("kyc")}>{t("Fix it")}</button>
        </BottomBar>
      </div>
    );
  }

  const steps = [t("Documents sent"), t("Being checked by our team"), t("Approved")];
  return (
    <div className="screen">
      <Header title={t("Verification")} />
      <div className="scroll">
        <span className="state-icon"><Icon name="clock" size={24} /></span>
        <h1>{t("Your documents are with our team")}</h1>
        <p className="muted">{t("We check your ID, selfie and qualification. This usually takes 2 working days. We will send you an SMS.")}</p>
        <div className="card stack" style={{ gap: 14 }}>
          {steps.map((label, i) => (
            <div key={label} className={`step ${i <= 1 ? "done" : ""} ${i === 1 ? "current" : ""}`}>
              <span className="dot"><Icon name="check" size={12} strokeWidth={4} /></span>
              <span>{label}</span>
            </div>
          ))}
        </div>
        {/* There is no admin panel yet, so these buttons stand in for the verification team. Remove before launch. */}
        <div className="dashed-box stack">
          <button type="button" className="btn btn-demo" onClick={() => update((prev) => approvalPatch(prev))}>{t("Prototype: approve me")}</button>
          <button type="button" className="link-btn" onClick={() => set({ kycStatus: "rejected", rejected: { step: "id", reason: "The ID photo is blurred. Take it again in good light." } })}>
            {t("Prototype: ask for a new ID photo")}
          </button>
        </div>
      </div>
    </div>
  );
}
