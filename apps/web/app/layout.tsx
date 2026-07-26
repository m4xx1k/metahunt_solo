import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppToaster } from "@/app/_components/AppToaster";
import { VercelAnalytics } from "@/lib/analytics/vercel-analytics";
import { PostHogProvider } from "@/lib/analytics/posthog-provider";
import { Providers } from "@/app/providers";
import { FEED_INDEX_DESCRIPTION, FEED_INDEX_TITLE } from "@/lib/seo/feed-meta";
import { SITE_LANG, SITE_LOCALE, SITE_NAME, SITE_URL } from "@/lib/seo/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Search Console ownership proof. Removing this un-verifies the property, which
  // silently stops sitemap reporting and Request Indexing — so it stays.
  verification: { google: "E0ojzUzPhmw0j-6FNXV2dMoP8wG0A5wVp59Ixwg1Wi4" },
  title: {
    default: FEED_INDEX_TITLE,
    // Pages supply the bare subject; the brand is appended here exactly once.
    template: `%s · ${SITE_NAME}`,
  },
  description: FEED_INDEX_DESCRIPTION,
  openGraph: {
    title: FEED_INDEX_TITLE,
    description: FEED_INDEX_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: FEED_INDEX_TITLE,
    description: FEED_INDEX_DESCRIPTION,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // suppressHydrationWarning on <html>/<body>: browser extensions (Grammarly,
  // password managers, dark-reader…) inject attributes on these root elements
  // before React hydrates, which otherwise logs a hydration-mismatch error on
  // every load. Shallow by design — silences only these two elements' own
  // attributes, never real mismatches inside the tree.
  return (
    <html
      lang={SITE_LANG}
      suppressHydrationWarning
      className={cn(
        "h-full antialiased",
        inter.variable,
        spaceGrotesk.variable,
        jetbrainsMono.variable,
      )}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-bg text-text-primary">
        <PostHogProvider>
          <Providers>
            <VercelAnalytics>{children}</VercelAnalytics>
            <AppToaster />
          </Providers>
        </PostHogProvider>
      </body>
    </html>
  );
}
