"use client";

// "Install the app" card. On Home it can be dismissed; in Profile it is always there until the app is installed.

import { useState } from "react";
import { useInstall } from "@/lib/install";
import { t } from "@/lib/i18n";
import { Icon } from "./Icon";

export function InstallCard({ onDismiss }: { onDismiss?: () => void }) {
  const install = useInstall();
  const [showSteps, setShowSteps] = useState(false);

  if (install.installed) {
    // Only Profile shows this line; Home shows nothing.
    return onDismiss ? null : (
      <div className="tint-box row-inline" style={{ gap: 10 }}>
        <Icon name="check" size={20} strokeWidth={2.5} />
        <span>{t("The app is installed on this phone.")}</span>
      </div>
    );
  }
  // On Home, offer it only where we can help: Android's install dialog, or the iPhone steps.
  if (onDismiss && !install.canPrompt && !install.ios) return null;

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="install-card">
        <span className="app-icon"><Icon name="logo" size={24} /></span>
        <div className="stack-xs">
          <div className="strong">{t("Install the app")}</div>
          <div className="small" style={{ color: "var(--ink-soft)" }}>
            {t("Add it to your home screen and open it like any other app. It takes no extra space and works on slow internet.")}
          </div>
        </div>
      </div>

      {install.canPrompt ? (
        <button type="button" className="btn btn-primary" onClick={() => install.prompt()}>
          <Icon name="download" size={20} />
          {t("Install")}
        </button>
      ) : showSteps || !onDismiss ? (
        <ol className="install-steps">
          {install.ios ? (
            <>
              <li>{t("Open this page in Safari.")}</li>
              <li>{t("Tap the Share button at the bottom of the screen.")}</li>
              <li>{t("Scroll down and tap “Add to Home Screen”, then “Add”.")}</li>
            </>
          ) : (
            <>
              <li>{t("Open this page in Chrome.")}</li>
              <li>{t("Tap the menu (⋮) at the top right.")}</li>
              <li>{t("Tap “Install app” or “Add to Home screen”.")}</li>
            </>
          )}
        </ol>
      ) : (
        <button type="button" className="btn btn-outline" onClick={() => setShowSteps(true)}>
          <Icon name="share" size={20} />
          {t("Show me how")}
        </button>
      )}

      {onDismiss && (
        <button type="button" className="link-btn small" style={{ alignSelf: "center" }} onClick={onDismiss}>{t("Not now")}</button>
      )}
    </div>
  );
}
