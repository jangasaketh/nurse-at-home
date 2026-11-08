"use client";

// Notifications, help and support, and the legal pages.

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { FAQ, faqVars, HELP_TOPICS, LEGAL, SUPPORT } from "@/lib/data";
import { timeAgo, tx } from "@/lib/booking";
import { useAction, useLoad, useServerAction } from "@/lib/fake-api";
import { myTickets, sendTicket, type MyTicket } from "@/lib/support";
import { t } from "@/lib/i18n";
import { markPatientNoticesRead } from "@/lib/patient-bookings";
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
      if (state.mode === "live" && state.userId) void markPatientNoticesRead(state.userId).catch(() => {});
    }
    // Only when loading finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load.status]);

  return (
    <div className="screen">
      <Header title={t("Notifications")} onBack={() => back()} />
      <div className="scroll">
        {load.status === "loading" && <Skeleton rows={3} />}
        {load.status === "error" && <ErrorState title={t("We could not load your notifications")} onRetry={load.retry} />}
        {load.status === "ready" && state.notifications.length === 0 && (
          <EmptyState
            icon="bell"
            title={t("Nothing here yet")}
            body={t("You will see a message here when a booking is confirmed, when the nurse sets off and arrives, and when a visit record is ready.")}
          />
        )}
        {load.status === "ready" && state.notifications.map((n) => (
          <div key={n.id} className={`card notice ${fresh.has(n.id) ? "" : "read"}`}>
            <span className="dot" />
            <div className="stack-xs" style={{ minWidth: 0 }}>
              <span className="strong">{tx(n.title)}</span>
              <span className="small" style={{ color: "var(--ink-soft)" }}>{tx(n.body)}</span>
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
  const demoAction = useAction(state.simulateFailure);
  const server = useServerAction();
  const live = state.mode === "live" && !!state.userId;
  const action = live ? { busy: server.busy, failed: server.failed } : demoAction;
  const [openQ, setOpenQ] = useState<number | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState<string | true | null>(null);
  const [mine, setMine] = useState<MyTicket[]>([]);

  // Signed in: the reports already sent, with the team's replies.
  const loadMine = () => { if (live) myTickets("patient").then(setMine).catch(() => {}); };
  useEffect(loadMine, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    setTried(true);
    if (!topic || message.trim().length < 10) return;
    if (live) {
      void server.run(() => sendTicket("patient", state.userId!, topic, message.trim(), { bookingId: state.booking?.live?.id ?? null }), (code) => { setSent(code); loadMine(); });
      return;
    }
    demoAction.run(() => setSent(true));
  };

  return (
    <div className="screen">
      <Header title={t("Help and support")} onBack={() => back()} />
      <div className="scroll gap-lg">
        <div className="danger-box stack-sm">
          <div className="strong">{t("In an emergency, call 112")}</div>
          <div className="small">{t("This app is not an emergency service.")}</div>
        </div>

        <div className="stack">
          <h2>{t("Common questions")}</h2>
          <div className="list">
            {FAQ.map((item, i) => (
              <div key={item.q} style={{ borderBottom: i < FAQ.length - 1 ? "1px solid #edf1ee" : 0 }}>
                <button type="button" className="faq-q" aria-expanded={openQ === i} onClick={() => setOpenQ(openQ === i ? null : i)}>
                  <span>{t(item.q)}</span>
                  <span className="muted" style={{ transform: openQ === i ? "rotate(90deg)" : "none", display: "flex" }}><Icon name="next" size={20} /></span>
                </button>
                {openQ === i && <div className="faq-a">{t(item.a, faqVars())}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <h2>{t("Talk to us")}</h2>
          <Rows
            items={[
              { k: t("Phone"), v: SUPPORT.phone },
              { k: "WhatsApp", v: SUPPORT.whatsapp },
              { k: t("Email"), v: SUPPORT.email },
              { k: t("Hours"), v: SUPPORT.hours },
            ]}
          />
        </div>

        <div className="stack">
          <h2>{t("Report a problem")}</h2>
          {sent ? (
            <div className="tint-box stack-sm">
              <div className="strong">{typeof sent === "string" ? t("We have your message ({id})", { id: sent }) : t("We have your message")}</div>
              <div className="small" style={{ color: "var(--ink-soft)" }}>{t("Our support team will reply on +91 {phone}.", { phone: state.phone })}</div>
            </div>
          ) : (
            <>
              <div className="wrap" role="group" aria-label={t("What is it about?")}>
                {HELP_TOPICS.map((topicName) => (
                  <Chip key={topicName} className="chip-toggle" selected={topic === topicName} onClick={() => setTopic(topicName)}>{t(topicName)}</Chip>
                ))}
              </div>
              {tried && !topic && <div role="alert" className="error">{t("Choose what it is about.")}</div>}
              <label htmlFor="help-message">{t("What happened?")}</label>
              <textarea id="help-message" className="text-input" value={message} onChange={(e) => setMessage(e.target.value)} />
              {tried && message.trim().length < 10 && <div role="alert" className="error">{t("Tell us a little more, at least a sentence.")}</div>}
              {action.failed && <ActionError>{t("Your message was not sent. Check your internet connection and try again.")}</ActionError>}
              <button type="button" className="btn btn-primary" disabled={action.busy} onClick={send}>
                {action.busy ? t("Sending…") : t("Send to support")}
              </button>
            </>
          )}
        </div>

        {live && mine.length > 0 && (
          <div className="stack">
            <h2>{t("Your messages to support")}</h2>
            <div className="list">
              {mine.map((tk) => (
                <div key={tk.id} className="list-row" style={{ alignItems: "flex-start" }}>
                  <span className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
                    <span className="strong">{tk.code} · {t(tk.topic)}</span>
                    <span className="small muted">{tk.message.length > 80 ? `${tk.message.slice(0, 80)}…` : tk.message}</span>
                    <span className="tiny muted">{timeAgo(tk.at)}</span>
                    {tk.replies.map((r, i) => (
                      <span key={i} className="tint-box small" style={{ marginTop: 4 }}><span className="strong">{t("Reply from support")}: </span>{r.text}</span>
                    ))}
                  </span>
                  <span className={`pill ${tk.status === "open" ? "pill-role" : "pill-ok"}`}>{tk.status === "open" ? t("Open") : t("Resolved")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="list">
          <button type="button" className="list-row" onClick={() => open("legal", { legalDoc: "terms" })}>
            <span>{t("Terms of Use")}</span><span className="end"><Icon name="next" size={18} /></span>
          </button>
          <button type="button" className="list-row" onClick={() => open("legal", { legalDoc: "privacy" })}>
            <span>{t("Privacy Policy")}</span><span className="end"><Icon name="next" size={18} /></span>
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
      <Header title={t(doc.title)} onBack={() => back()} />
      <div className="scroll">
        <h1>{t(doc.title)}</h1>
        <div className="legal-note">
          {t("Placeholder. The real text must be written by a lawyer before launch. These are the sections it needs to cover.")}
        </div>
        <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          {doc.points.map((point) => <li key={point}>{t(point)}</li>)}
        </ol>
      </div>
    </div>
  );
}
