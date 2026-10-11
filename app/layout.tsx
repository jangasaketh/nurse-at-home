import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// Files in public/ are not given the GitHub Pages prefix automatically, so add it here.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// The patient app. The caregiver app (app/caregiver/layout.tsx) replaces the name, icon and manifest.
export const metadata: Metadata = {
  title: "Nurse at Home",
  description: "Book verified nurses and compounders for injections, IV drips and dressing at home.",
  manifest: `${BASE}/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${BASE}/icons/favicon-48.png`, sizes: "48x48", type: "image/png" }],
    apple: `${BASE}/icons/apple-touch-icon.png`,
  },
  appleWebApp: { capable: true, title: "Nurse at Home", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0E5C4A",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anek+Latin:wght@500;600;700&family=Mukta:wght@400;500;600&family=Noto+Sans+Telugu:wght@400;500;600&family=Noto+Sans+Kannada:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
