import { readFileSync } from "node:fs";

// The app version comes from package.json, so it only has to be changed in one place.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build the app into plain HTML, CSS and JS files in the "out" folder,
  // so it can be hosted on GitHub Pages (or any static host).
  output: "export",
  // GitHub Pages serves a project at /REPO-NAME/. The deploy workflow fills this in.
  basePath: process.env.PAGES_BASE_PATH || "",
  trailingSlash: true,
  images: { unoptimized: true },
  // Shown at the bottom of Profile, so you can see which version is live.
  env: { NEXT_PUBLIC_APP_VERSION: version, NEXT_PUBLIC_BASE_PATH: process.env.PAGES_BASE_PATH || "" },
};

export default nextConfig;
