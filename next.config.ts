import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "26mb",
    },
    proxyClientMaxBodySize: "26mb",
  },
};

export default nextConfig;
