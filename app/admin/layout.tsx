import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./admin.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// The admin panel, for the Nurse at Home team. Not meant for patients or caregivers, so search engines are told to skip it.
export const metadata: Metadata = {
  title: "Nurse at Home · Admin",
  description: "Team panel: caregiver verification, bookings, refunds, support, payouts and settings.",
  robots: { index: false, follow: false },
  manifest: null, // not an installable app
  icons: { icon: [{ url: `${BASE}/icons/favicon-48.png`, sizes: "48x48", type: "image/png" }] },
};

export const viewport: Viewport = { themeColor: "#10262E" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
