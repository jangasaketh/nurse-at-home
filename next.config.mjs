/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build the app into plain HTML, CSS and JS files in the "out" folder,
  // so it can be hosted on GitHub Pages (or any static host).
  output: "export",
  // GitHub Pages serves a project at /REPO-NAME/. The deploy workflow fills this in.
  basePath: process.env.PAGES_BASE_PATH || "",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
