import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function Header({ title, onBack, backLabel = "Back", right }: { title: string; onBack?: () => void; backLabel?: string; right?: ReactNode }) {
  return (
    <div className="header">
      <div className="header-left">
        {onBack && (
          <button type="button" className="icon-btn" onClick={onBack} aria-label={backLabel}>
            <Icon name="back" size={24} />
          </button>
        )}
        <div className="header-title">{title}</div>
      </div>
      {right}
    </div>
  );
}

export function BottomBar({ children }: { children: ReactNode }) {
  return <div className="bottom-bar">{children}</div>;
}

export function Chip({ selected, onClick, className = "", children }: { selected: boolean; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button type="button" className={`chip ${className}`} aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  );
}

export function RadioCard({ selected, onClick, label, sub }: { selected: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <button type="button" className="radio-card" aria-pressed={selected} onClick={onClick}>
      <span className="radio-dot" />
      <span className="stack-xs">
        <span className="strong">{label}</span>
        {sub && <span className="small muted">{sub}</span>}
      </span>
    </button>
  );
}

export function Rows({ items }: { items: { k: string; v: string }[] }) {
  return (
    <div className="rows">
      {items.map((item) => (
        <div className="row" key={item.k}>
          <span className="k">{item.k}</span>
          <span className="v">{item.v}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Forms ---------- */

export function TextField({
  id, label, value, onChange, error, hint, type = "text", inputMode, placeholder, autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "tel";
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`text-input ${error ? "invalid" : ""}`}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <div id={`${id}-error`} role="alert" className="error">{error}</div> : hint ? <div className="small muted">{hint}</div> : null}
    </div>
  );
}

export function CheckRow({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="check-card" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/* ---------- Loading, error and empty states ---------- */

/** Grey placeholder cards shown while a list is loading. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card skeleton-card">
          <div className="skeleton-line" style={{ width: "55%" }} />
          <div className="skeleton-line" style={{ width: "85%" }} />
          <div className="skeleton-line" style={{ width: "40%" }} />
        </div>
      ))}
    </div>
  );
}

/** Shown when something could not be loaded. Always offers a way to try again. */
export function ErrorState({ title = "We could not load this", body = "Check your internet connection and try again.", onRetry }: { title?: string; body?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="state-box">
      <span className="state-icon danger"><Icon name="alert" size={24} /></span>
      <div className="strong">{title}</div>
      <div className="small muted">{body}</div>
      <button type="button" className="btn btn-outline" onClick={onRetry}>Try again</button>
    </div>
  );
}

/** Shown when a list has nothing in it yet. Says what will appear and how to start. */
export function EmptyState({ icon, title, body, action }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="state-box">
      <span className="state-icon"><Icon name={icon} size={24} /></span>
      <div className="strong">{title}</div>
      <div className="small muted">{body}</div>
      {action}
    </div>
  );
}

/** Inline message when a save or payment did not go through. */
export function ActionError({ children = "That did not go through. Check your internet connection and try again." }: { children?: ReactNode }) {
  return <div role="alert" className="error" style={{ marginBottom: 10 }}>{children}</div>;
}
