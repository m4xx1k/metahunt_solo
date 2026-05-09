import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/monitoring", destination: "/dashboard", permanent: true },
      { source: "/monitoring/:path*", destination: "/dashboard", permanent: true },
    ];
  },
};

export default nextConfig;
