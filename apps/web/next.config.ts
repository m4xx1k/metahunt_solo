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
      // Vanity campaign links for channels where a long UTM tail can't survive
      // (spoken in a video, typed from a screen). 302 on purpose — the
      // destination campaign changes per post.
      {
        source: "/yt",
        destination: "/radar?utm_source=youtube&utm_medium=video&utm_campaign=vanity-yt",
        permanent: false,
      },
      {
        source: "/tt",
        destination: "/radar?utm_source=tiktok&utm_medium=video&utm_campaign=vanity-tt",
        permanent: false,
      },
      {
        source: "/tg",
        destination: "/radar?utm_source=telegram&utm_medium=post&utm_campaign=vanity-tg",
        permanent: false,
      },
      {
        source: "/ig",
        destination: "/radar?utm_source=instagram&utm_medium=post&utm_campaign=vanity-ig",
        permanent: false,
      },
      {
        source: "/th",
        destination: "/radar?utm_source=threads&utm_medium=post&utm_campaign=vanity-th",
        permanent: false,
      },
      {
        source: "/x",
        destination: "/radar?utm_source=x&utm_medium=post&utm_campaign=vanity-x",
        permanent: false,
      },
      { source: "/monitoring", destination: "/dashboard", permanent: true },
      { source: "/monitoring/:path*", destination: "/dashboard", permanent: true },
      // The operator console moved under /dashboard/* (one guarded subtree).
      { source: "/product-analytics", destination: "/dashboard/analytics", permanent: true },
      { source: "/sources", destination: "/dashboard/sources", permanent: true },
      { source: "/taxonomy", destination: "/dashboard/taxonomy", permanent: true },
      { source: "/unique-vacancies", destination: "/dashboard/dedupe", permanent: true },
      { source: "/vacancies", destination: "/dashboard/vacancies", permanent: true },
      { source: "/dashboard/extraction", destination: "/dashboard/costs", permanent: true },
      { source: "/dashboard/ingests/:id", destination: "/dashboard/runs/:id", permanent: true },
      // /merged (former beta) and standalone /reverse-ats folded into the home feed.
      // Permanent (308), not 307: these routes are gone for good, and only a
      // permanent redirect passes their accumulated link equity to the feed.
      { source: "/merged", destination: "/", permanent: true },
      { source: "/merged/:slug*", destination: "/:slug*", permanent: true },
      { source: "/reverse-ats", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
