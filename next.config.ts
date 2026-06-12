import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Railway runs `node .next/standalone/server.js` (ADR-002)
  output: "standalone",
};

export default withNextIntl(nextConfig);
