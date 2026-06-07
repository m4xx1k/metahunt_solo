import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Never forward browser console output to the dev terminal (Next 16.2+
  // `logging.browserToTerminal`). Browser extensions mutate <html>/<body>
  // before React hydrates → a stream of hydration-mismatch console.errors that
  // would otherwise flood `pnpm dev:web`. The root cause is silenced with
  // `suppressHydrationWarning` in app/layout.tsx; this is the belt-and-braces
  // guard so no client noise reaches the terminal regardless of the upstream
  // default. See apps/web/CLAUDE.md ("Dev-server noise").
  logging: { browserToTerminal: false },

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
