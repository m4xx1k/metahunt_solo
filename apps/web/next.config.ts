import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PostHog reverse proxy: serve analytics through our own origin so ad/tracker
  // blockers (which blacklist *.posthog.com) can't drop events. posthog-js
  // points api_host at "/ingest"; Next proxies those requests to PostHog EU
  // server-side, making them first-party. Region hardcoded to EU (matches the
  // backend default + EU data residency); flip both hosts for US/self-host.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      { source: "/ingest/:path*", destination: "https://eu.i.posthog.com/:path*" },
    ];
  },
  async redirects() {
    return [
      { source: "/monitoring", destination: "/dashboard", permanent: true },
      { source: "/monitoring/:path*", destination: "/dashboard", permanent: true },
    ];
  },
};

export default nextConfig;
