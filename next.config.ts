import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Request URLs can contain OAuth codes, state and personal query parameters.
  logging: { incomingRequests: false },
  //standalone: true,
  output: 'standalone',
};

export default nextConfig;
