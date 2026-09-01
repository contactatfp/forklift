import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pg",
    "@solarisdk/sandbox",
    "@solarisdk/browser",
    "@solarisdk/core",
    "patchright-core",
  ],
};

export default nextConfig;
