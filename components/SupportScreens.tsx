"use client";

// Notifications, help and support, and the legal pages.

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { FAQ, HELP_TOPICS, LEGAL, SUPPORT } from "@/lib/data";
import { timeAgo } from "@/lib/booking";
import { useAction, useLoad } from "@/lib/fake-api";
import { Icon } from "./Icon";
import { ActionError, Chip, EmptyState, ErrorState, Header, Rows, Skeleton } from "./ui";

export function NotificationsScreen() {
  const { state, set, back } = useApp();
  const load = useLoad(state.simulateFailure);
  // Remember which ones were unread when the screen opened, so they stay highlighted while it is open.
  const [fresh] = useState(() => new Set(state.notifications.filter((n) => !n.read).map((n) => n.id)));

  useEffect(() => {
    if (load.status === "ready" && state.notifications.some((n) => !n.read)) {
      set({ notifications: state.notifications.map((n) => ({ ...n, read: true })) });
    }
    // Only when loading finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load.status]);

  return (
    <div className="screen">
      <Header title="Notifications" onBack={() => back()} />
      <div className="scroll">
        {load.status === "loading" && <Skeleton rows={3} />}
        {load.status === "error" && <ErrorState title="We could not load your notifications" onRetry={load.retry} />}
        {load.status === "ready" && state.notifications.length === 0 && (
          <EmptyState
            icon="bell"
            title="Nothing here yet"
            body="You will see a message here when a booking is confirmed, when the nurse sets off and arrives, and when a visit record is ready."
          />
        )}
        {load.status === "ready" && state.notifications.map((n) => (
          <div key={n.id} className={`card notice ${fresh.has(n.id) ? "" : "read"}`}>
            <span className="dot" />
            <div className="stack-xs" style={{ minWidth: 0 }}>
              <span className="strong">{n.title}</span>
              <span className="small" style={{ color: "var(--ink-soft)" }}>{n.body}</span>
              <span className="tiny muted">{timeAgo(n.at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HelpScreen() {
  const { state, open, back } = useApp();
  const action = useAction(state.simulateFailure);
  const [openQ, setOpenQ] = useState<number | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState(false);

  const send = () => {
    setTried(true);
    if (!topic || message.trim().length < 10) return;
    // TODO: create a support ticket through the API.
    action.run(() => setSent(true));
  };

  return (
    <div className="screen">
      <Header title="Help and support" onBack={() => back()} />
      <div className="scroll gap-lg">
        <div className="danger-box stack-sm">
          <div className="strong">In an emergency, call 112</div>
          <div className="small">This app is not an emergency service.</div>
        </div>

        <div className="stack">
          <h2>Common questions</h2>
          <div className="list">
            {FAQ.map((item, i) => (
              <div key={item.q} style={{ borderBottom: i < FAQ.length - 1 ? "1px solid #edf1ee" : 0 }}>
                <button type="button" className="faq-q" aria-expanded={openQ === i} onClick={() => setOpenQ(openQ === i ? null : i)}>
                  <span>{item.q}</span>
                  <span className="muted" style={{ transform: openQ === i ? "rotate(90deg)" : "none", display: "flex" }}><Icon name="next" size={20} /></span>
                </button>
                {openQ === i && <div className="faq-a">{item.a}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <h2>Talk to us</h2>
          <Rows
            items={[
              { k: "Phone", v: SUPPORT.phone },
              { k: "WhatsApp", v: SUPPORT.whatsapp },
              { k: "Email", v: SUPPORT.email },
              { k: "Hours", v: SUPPORT.hours },
            ]}
          />
        </div>

        <div className="stack">
          <h2>Report a problem</h2>
          {sent ? (
            <div className="tint-box stack-sm">
              <div className="strong">We have your message</div>
              <div className="small" style={{ color: "var(--ink-soft)" }}>Our support team will reply on +91 {state.phone}.</div>
            </div>
          ) : (
            <>
              <div className="wrap" role="group" aria-label="What is it about?">
                {HELP_TOPICS.map((t) => (
                  <Chip key={t} className="chip-toggle" selected={topic === t} onClick={() => setTopic(t)}>{t}</Chip>
                ))}
              </div>
              {tried && !topic && <div role="alert" className="error">Choose what it is about.</div>}
              <label htmlFor="help-message">What happened?</label>
              <textarea id="help-message" className="text-input" value={message} onChange={(e) => setMessage(e.target.value)} />
              {tried && message.trim().length < 10 && <div role="alert" className="error">Tell us a little more, at least a sentence.</div>}
              {action.failed && <ActionError>Your message was not sent. Check your internet connection and try again.</ActionError>}
              <button type="button" className="btn btn-primary" disabled={action.busy} onClick={send}>
                {action.busy ? "Sending…" : "Send to support"}
              </button>
            </>
          )}
        </div>

        <div className="list">
          <button type="button" className="list-row" onClick={() => open("legal", { legalDoc: "terms" })}>
            <span>Terms of Use</span><span className="end"><Icon name="next" size={18} /></span>
          </button>
          <button type="button" className="list-row" onClick={() => open("legal", { legalDoc: "privacy" })}>
            <span>Privacy Policy</span><span className="end"><Icon name="next" size={18} /></span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function LegalScreen() {
  const { state, back } = useApp();
  const doc = LEGAL[state.legalDoc];
  return (
    <div className="screen screen-white">
      <Header title={doc.title} onBack={() => back()} />
      <div className="scroll">
        <h1>{doc.title}</h1>
        <div className="legal-note">
          Placeholder. The real text must be written by a lawyer before launch. These are the sections it needs to cover.
        </div>
        <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          {doc.points.map((point) => <li key={point}>{point}</li>)}
        </ol>
      </div>
    </div>
  );
}
