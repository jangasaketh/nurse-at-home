import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// The caregiver app: its own name, icon and manifest, so it installs as a separate app on the phone.
export const metadata: Metadata = {
  title: "Nurse at Home · Caregiver",
  description: "For nurses and compounders: get home-visit requests, run each visit, and track your earnings.",
  manifest: `${BASE}/caregiver/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${BASE}/caregiver/icons/favicon-48.png`, sizes: "48x48", type: "image/png" }],
    apple: `${BASE}/caregiver/icons/apple-touch-icon.png`,
  },
  appleWebApp: { capable: true, title: "NAH Caregiver", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1D4E89" };

export default function CaregiverLayout({ children }: { children: ReactNode }) {
  return children;
}
