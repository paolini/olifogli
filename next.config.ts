import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Do not advertise the framework in every response (X-Powered-By).
  poweredByHeader: false,
  // Request URLs can contain OAuth codes, state and personal query parameters.
  logging: { incomingRequests: false },
  //standalone: true,
  output: 'standalone',
};

export default nextConfig;
