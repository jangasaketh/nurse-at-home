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

export function RadioCard({ selected, onClick, label, sub }: { selected: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button type="button" className="radio-card" aria-pressed={selected} onClick={onClick}>
      <span className="radio-dot" />
      <span className="stack-xs">
        <span className="strong">{label}</span>
        <span className="small muted">{sub}</span>
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
