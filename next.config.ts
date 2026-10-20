import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Disabled: Cache Components + post-login client navigations can leave a blank shell.
  // Re-enable once auth is wired through Cache Components–compatible patterns.
  cacheComponents: false,
  // Keep PDF tooling out of the serverless bundle graph (loaded only when generating PDFs).
  serverExternalPackages: [
    "pdfkit",
    "puppeteer",
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
