"use client";

// Small building blocks for the admin panel.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PhotoFile } from "@/lib/prescription";
import { PhotoViewer } from "../PhotoPicker";
import { Icon } from "../Icon";

export type Tone = "ok" | "warn" | "danger" | "info" | "muted" | "live";

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`abadge ${tone}`}>{children}</span>;
}

export const LiveBadge = () => <Badge tone="live">Live · caregiver app</Badge>;

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="adm-head">
      <div className="grow">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="adm-row">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "warn" | "danger"; onClick?: () => void }) {
  const body = (
    <>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </>
  );
  return onClick
    ? <button type="button" className={`astat ${tone ?? ""}`} onClick={onClick}>{body}</button>
    : <div className={`astat ${tone ?? ""}`}>{body}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; n?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="atabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={value === tab.id} onClick={() => onChange(tab.id)}>
          {tab.label}{tab.n !== undefined && <span className="n">{tab.n}</span>}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ label, value, onChange, options, id }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; id: string }) {
  return (
    <label className="afield" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Field({ label, id, value, onChange, type = "text", hint, error, placeholder, multiline, className, min, max, step }: {
  label: string; id: string; value: string; onChange: (v: string) => void; type?: string; hint?: string; error?: string; placeholder?: string;
  multiline?: boolean; className?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <label className={`afield ${className ?? ""}`} htmlFor={id}>
      <span>{label}</span>
      {multiline
        ? <textarea id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
        : <input id={id} type={type} value={value} placeholder={placeholder} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </label>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="adm-col" style={{ alignItems: "center", textAlign: "center", padding: "36px 16px" }}>
      <span style={{ color: "var(--a-primary)" }}><Icon name="check" size={28} /></span>
      <h3>{title}</h3>
      {body && <p className="adm-muted adm-small">{body}</p>}
    </div>
  );
}

/** A panel that slides in from the right. Escape or the backdrop closes it. */
export function Drawer({ title, sub, onClose, children, footer, narrow, label }: {
  title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; narrow?: boolean; label: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    // Only the panel on top closes with Escape (a booking can open over a patient, for example).
    const onKey = (e: KeyboardEvent) => {
      const panels = document.querySelectorAll(".adrawer-back");
      if (e.key === "Escape" && !document.querySelector(".viewer") && panels[panels.length - 1] === backRef.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div ref={backRef} className="adrawer-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={`adrawer ${narrow ? "narrow" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="adrawer-head">
          <div className="grow">
            <h2>{title}</h2>
            {sub && <div className="adm-muted adm-small">{sub}</div>}
          </div>
          <button ref={closeRef} type="button" className="abtn abtn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="adrawer-body">{children}</div>
        {footer && <div className="adrawer-foot">{footer}</div>}
      </section>
    </div>
  );
}

/** A document picture that opens full size. PDFs cannot be previewed until there is a server. */
export function Doc({ file, label, extra }: { file: PhotoFile | null; label: string; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="adoc">
      {file?.kind === "image" && file.dataUrl ? (
        <button type="button" className="thumb" aria-label={`View ${label}`} onClick={() => setOpen(true)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file.dataUrl} alt="" />
        </button>
      ) : (
        <div className="none">
          <Icon name="file" size={24} />
          {!file ? "Not sent"
            : file.kind === "pdf" && file.dataUrl ? <a className="alink" href={file.dataUrl} target="_blank" rel="noreferrer">Open the PDF ↗</a>
            : file.path ? (file.kind === "pdf" ? "PDF · loading…" : "Loading…")
            : `PDF · ${file.name}. Opens after the server is connected.`}
        </div>
      )}
      <div className="cap"><span>{label}</span>{extra}</div>
      {open && file?.dataUrl && <PhotoViewer src={file.dataUrl} title={label} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function Meter({ value, max }: { value: number; max: number }) {
  return <div className="ameter" role="presentation"><span style={{ width: `${Math.min(100, max ? (value / max) * 100 : 0)}%` }} /></div>;
}

/* ---------- Toast: a short message after an action ---------- */

const ToastContext = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {text && <div className="atoast" role="status">{text}</div>}
    </ToastContext.Provider>
  );
}

/** Downloads text as a file (CSV). */
export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const csvRow = (cells: (string | number)[]) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
