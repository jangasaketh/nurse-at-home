"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { Icon } from "./Icon";

/** A strip at the top whenever the phone or computer has no internet connection. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline" role="status">
      <Icon name="offline" size={18} />
      {t("You are offline. Some things will not work until you reconnect.")}
    </div>
  );
}
