"use client";

// Adding a document photo: take one with the camera, or choose a photo (or a PDF, where allowed).
// Shows a preview that opens full size. Used for prescriptions (patient app) and for ID, selfie and
// certificates (caregiver app).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { fileSizeText, preparePhoto, PrescriptionProblem, type PhotoFile, type PrescriptionError } from "@/lib/prescription";
import { t } from "@/lib/i18n";
import { Icon } from "./Icon";

const ERRORS: Record<PrescriptionError, string> = {
  type: "This file type cannot be used. Choose a photo (JPG or PNG) or a PDF.",
  "too-big": "This photo is too large (over 20 MB). Choose another photo.",
  "pdf-too-big": "This PDF is larger than 5 MB. Take a photo of the prescription instead.",
  unreadable: "This photo could not be opened. Take a new photo, or choose a JPG or PNG.",
  small: "This photo is too small to read. Take it closer, in good light.",
};
const PHOTO_ONLY_TYPE = "This file type cannot be used. Choose a photo (JPG or PNG).";
const GENERIC_PDF_TOO_BIG = "This PDF is larger than 5 MB. Take a photo instead.";

export type PhotoPickerProps = {
  value: PhotoFile | null;
  onChange: (p: PhotoFile | null) => void;
  /** Prefix for test ids: "<testId>-camera" and "<testId>-file". */
  testId: string;
  allowPdf?: boolean;
  /** "environment" = back camera (documents), "user" = front camera (selfie). */
  camera?: "environment" | "user";
  takeLabel?: string;
  chooseLabel?: string;
  tip?: string;
  /** What the photo is, for the full-size view and screen readers. Already translated. */
  label?: string;
  /** Use the generic "take a photo instead" wording for a large PDF (not the prescription one). */
  genericPdfMessage?: boolean;
  tone?: "warn" | "primary";
};

export function PhotoPicker({
  value, onChange, testId, allowPdf = true, camera = "environment", takeLabel, chooseLabel, tip, label, genericPdfMessage, tone = "warn",
}: PhotoPickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PrescriptionError | null>(null);

  const message = (e: PrescriptionError) =>
    t(e === "type" && !allowPdf ? PHOTO_ONLY_TYPE : e === "pdf-too-big" && genericPdfMessage ? GENERIC_PDF_TOO_BIG : ERRORS[e]);

  const handle = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ""; // so choosing the same file again still works
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await preparePhoto(file, allowPdf));
    } catch (e) {
      setError(e instanceof PrescriptionProblem ? e.reason : "unreadable");
    } finally {
      setBusy(false);
    }
  };

  const inputs = (
    <>
      {/* capture opens the camera on phones (back or front). On a computer it opens the file chooser. */}
      <input ref={cameraRef} type="file" accept="image/*" capture={camera} hidden data-testid={`${testId}-camera`} onChange={(e) => handle(e.currentTarget)} />
      <input ref={fileRef} type="file" accept={allowPdf ? "image/*,application/pdf" : "image/*"} hidden data-testid={`${testId}-file`} onChange={(e) => handle(e.currentTarget)} />
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
        <PhotoCard p={value} label={label}>
          <button type="button" className="link-btn small" onClick={() => (camera === "user" ? cameraRef : fileRef).current?.click()}>{t("Replace")}</button>
          <button type="button" className="link-btn small" style={{ color: "var(--danger)" }} onClick={() => onChange(null)}>{t("Remove")}</button>
        </PhotoCard>
        {error && <div role="alert" className="error">{message(error)}</div>}
      </div>
    );
  }

  return (
    <div className="stack-sm">
      {inputs}
      <div className="stack-sm">
        <button type="button" className={tone === "warn" ? "btn btn-warn" : "btn btn-primary"} onClick={() => cameraRef.current?.click()}>
          <Icon name="camera" size={20} />
          {takeLabel ?? t("Take a photo")}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={20} />
          {chooseLabel ?? (allowPdf ? t("Choose a photo or PDF") : t("Choose a photo"))}
        </button>
      </div>
      {tip && <div className="small" style={{ color: tone === "warn" ? "var(--warn-ink)" : "var(--ink-soft)" }}>{tip}</div>}
      {error && <div role="alert" className="error">{message(error)}</div>}
    </div>
  );
}

/** A saved photo or PDF: thumbnail, name, and a full-size view. Extra buttons go in children. */
export function PhotoCard({ p, label, children }: { p: PhotoFile; label?: string; children?: ReactNode }) {
  const [viewing, setViewing] = useState(false);
  const title = label ?? t("Photo");
  return (
    <div className="rx-card">
      {p.kind === "image" && p.dataUrl ? (
        <button type="button" className="rx-thumb" aria-label={t("View {item}", { item: title })} onClick={() => setViewing(true)}>
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
      {viewing && p.dataUrl && <PhotoViewer src={p.dataUrl} title={title} onClose={() => setViewing(false)} />}
    </div>
  );
}

export function PhotoViewer({ src, title, onClose, children }: { src?: string; title: string; onClose: () => void; children?: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={title} onClick={(e) => e.stopPropagation()} />
      ) : (
        <div className="viewer-body" onClick={(e) => e.stopPropagation()}>{children}</div>
      )}
      <button ref={closeRef} type="button" className="btn btn-outline viewer-close" onClick={onClose}>{t("Close")}</button>
    </div>
  );
}
