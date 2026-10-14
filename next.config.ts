import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Disabled: Cache Components + post-login client navigations can leave a blank shell.
  // Re-enable once auth is wired through Cache Components–compatible patterns.
  cacheComponents: false,
  // Keep pdfkit out of the serverless bundle graph (loaded only when generating PDFs).
  serverExternalPackages: ["pdfkit"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
