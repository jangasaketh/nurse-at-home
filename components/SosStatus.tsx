"use client";

// Shown inside the SOS box of a live visit: tells the support team at once (an urgent report with the
// phone's location), and says so. Pressing SOS again within 5 minutes does not send a second alert.

import { useEffect, useState } from "react";
import { sosAlert } from "@/lib/support";
import { t } from "@/lib/i18n";

export function SosStatus({ app, bookingId }: { app: "patient" | "caregiver"; bookingId: string }) {
  const [state, setState] = useState<{ code?: string; failed?: boolean }>({});
  const send = () => {
    setState({});
    sosAlert(app, bookingId).then((code) => setState({ code }), () => setState({ failed: true }));
  };
  useEffect(send, [app, bookingId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.failed) {
    return (
      <div className="small" role="alert">
        {t("We could not alert our support team. Check your internet, or call them.")}{" "}
        <button type="button" className="link-btn small" onClick={send}>{t("Try again")}</button>
      </div>
    );
  }
  return (
    <div className="small strong" role="status">
      {state.code ? t("Our support team has been alerted ({id}) with your location.", { id: state.code }) : t("Alerting our support team…")}
    </div>
  );
}
