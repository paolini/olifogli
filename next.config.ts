import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  //standalone: true,
  output: 'standalone',
};

console.log(
"      _ _  __           _    \n" +
"  ___| (_)/ _|___  __ _| (_) \n" +
" / _ \\ | |  _/ _ \\/ _` | | | \n" +
" \\___/_|_|_| \\___/\\__, |_|_| \n" +
"                  |___/      \n" +
"\n");

export default nextConfig;
