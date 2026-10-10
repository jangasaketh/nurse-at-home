"use client";

// Adding a prescription: take a photo, or choose a photo or PDF. Shows a preview that can be opened full size.

import { useEffect, useRef, useState } from "react";
import { fileSizeText, preparePrescription, PrescriptionProblem, type Prescription, type PrescriptionError } from "@/lib/prescription";
import { t } from "@/lib/i18n";
import { Icon } from "./Icon";

const ERRORS: Record<PrescriptionError, string> = {
  type: "This file type cannot be used. Choose a photo (JPG or PNG) or a PDF.",
  "too-big": "This photo is too large (over 20 MB). Choose another photo.",
  "pdf-too-big": "This PDF is larger than 5 MB. Take a photo of the prescription instead.",
  unreadable: "This photo could not be opened. Take a new photo, or choose a JPG or PNG.",
  small: "This photo is too small to read. Take it closer, in good light.",
};

export function PrescriptionPicker({ value, onChange }: { value: Prescription | null; onChange: (p: Prescription | null) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PrescriptionError | null>(null);

  const handle = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ""; // so choosing the same file again still works
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await preparePrescription(file));
    } catch (e) {
      setError(e instanceof PrescriptionProblem ? e.reason : "unreadable");
    } finally {
      setBusy(false);
    }
  };

  const inputs = (
    <>
      {/* capture="environment" opens the back camera on phones. On a computer it opens the file chooser. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden data-testid="rx-camera" onChange={(e) => handle(e.currentTarget)} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden data-testid="rx-file" onChange={(e) => handle(e.currentTarget)} />
    </>
  );

  if (busy) {
    return (
      <div className="rx-card" role="status">
        <span className="rx-thumb rx-thumb-empty"><span className="spinner" /></span>
        <span className="strong">{t("Preparing the photo…")}</span>
      </div>
    );
  }

  if (value) {
    return (
      <div className="stack-sm">
        {inputs}
        <PrescriptionCard p={value}>
          <button type="button" className="link-btn small" onClick={() => fileRef.current?.click()}>{t("Replace")}</button>
          <button type="button" className="link-btn small" style={{ color: "var(--danger)" }} onClick={() => onChange(null)}>{t("Remove")}</button>
        </PrescriptionCard>
        {error && <div role="alert" className="error">{t(ERRORS[error])}</div>}
      </div>
    );
  }

  return (
    <div className="stack-sm">
      {inputs}
      <div className="stack-sm">
        <button type="button" className="btn btn-warn" onClick={() => cameraRef.current?.click()}>
          <Icon name="camera" size={20} />
          {t("Take a photo")}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={20} />
          {t("Choose a photo or PDF")}
        </button>
      </div>
      <div className="small" style={{ color: "var(--warn-ink)" }}>
        {t("Make sure the doctor's name, the date, and each medicine and dose can be read.")}
      </div>
      {error && <div role="alert" className="error">{t(ERRORS[error])}</div>}
    </div>
  );
}

/** A saved prescription: thumbnail, name, and a full-size view. Extra buttons go in children. */
export function PrescriptionCard({ p, children }: { p: Prescription; children?: React.ReactNode }) {
  const [viewing, setViewing] = useState(false);
  return (
    <div className="rx-card">
      {p.kind === "image" && p.dataUrl ? (
        <button type="button" className="rx-thumb" aria-label={t("View prescription")} onClick={() => setViewing(true)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.dataUrl} alt="" />
        </button>
      ) : (
        <span className="rx-thumb rx-thumb-empty"><Icon name="file" size={26} /></span>
      )}
      <span className="stack-xs" style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <span className="row-inline strong" style={{ color: "var(--ok)", gap: 6 }}>
          <Icon name="check" size={18} strokeWidth={2.5} />
          {p.kind === "pdf" ? t("PDF added") : t("Photo added")}
        </span>
        <span className="tiny muted rx-name">{p.name} · {fileSizeText(p.size)}</span>
        {(children || (p.kind === "image" && p.dataUrl)) && (
          <span className="row-inline" style={{ gap: "0 16px", flexWrap: "wrap" }}>
            {p.kind === "image" && p.dataUrl && (
              <button type="button" className="link-btn small" onClick={() => setViewing(true)}>{t("View")}</button>
            )}
            {children}
          </span>
        )}
      </span>
      {viewing && p.dataUrl && <PhotoViewer src={p.dataUrl} onClose={() => setViewing(false)} />}
    </div>
  );
}

function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={t("Prescription")} onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={t("Prescription")} onClick={(e) => e.stopPropagation()} />
      <button ref={closeRef} type="button" className="btn btn-outline viewer-close" onClick={onClose}>{t("Close")}</button>
    </div>
  );
}
