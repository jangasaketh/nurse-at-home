"use client";

// Profile → "Delete my account" (1.9.0), in the patient and caregiver apps (signed in only).

import { useState } from "react";
import { accountBlocker, deleteMyAccount } from "@/lib/account";
import { t } from "@/lib/i18n";

type Props = { app: "patient" | "caregiver"; onDeleted: () => void };

export function DeleteAccount({ app, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const start = async () => {
    setOpen(true); setProblem(""); setSure(false);
    const why = await accountBlocker(app).catch(() => null);
    if (why) setProblem(t(why));
  };
  const go = async () => {
    setBusy(true); setProblem("");
    try { await deleteMyAccount(app); onDeleted(); }
    catch (e) { setProblem(t((e as Error).message)); setBusy(false); }
  };

  if (!open) return <button type="button" className="link-btn small" style={{ color: "var(--danger, #B42318)" }} onClick={() => void start()}>{t("Delete my account")}</button>;
  return (
    <div className="card stack" style={{ gap: 12, borderColor: "var(--danger, #B42318)" }} role="region" aria-label={t("Delete my account")}>
      <div className="strong">{t("Delete my account")}</div>
      <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
        {app === "patient" ? <>
          <li>{t("Your name, phone number, family, addresses and emergency contact are removed.")}</li>
          <li>{t("Prescriptions and photos you sent are deleted.")}</li>
        </> : <>
          <li>{t("Your details, documents, qualification and bank account are removed.")}</li>
          <li>{t("You stop getting requests, and you cannot sign in to this account again.")}</li>
        </>}
        <li>{t("Records of past payments are kept without your name, because the law requires it.")}</li>
        <li>{t("This cannot be undone. You can sign up again later with the same number as a new account.")}</li>
      </ul>
      {problem ? <div className="small error" role="alert">{problem}</div> : (
        <label className="row-inline small" style={{ gap: 8 }} htmlFor={`del-${app}`}>
          <input id={`del-${app}`} type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
          <span>{t("I understand. Delete my account.")}</span>
        </label>
      )}
      <div className="row-inline" style={{ gap: 8, flexWrap: "wrap" }}>
        {!problem && <button type="button" className="btn btn-danger btn-sm" disabled={!sure || busy} onClick={() => void go()}>{busy ? t("Deleting…") : t("Delete my account")}</button>}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>{t("Keep my account")}</button>
      </div>
    </div>
  );
}
