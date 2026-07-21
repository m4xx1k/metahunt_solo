import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppToaster } from "@/app/_components/AppToaster";
import { VercelAnalytics } from "@/lib/vercel-analytics";
import { PostHogProvider } from "@/lib/posthog";
import { Providers } from "@/app/providers";

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
  metadataBase: new URL("https://www.metahunt.app"),
  title: {
    default: "metahunt · Ukrainian tech jobs in one feed",
    template: "%s",
  },
  description:
    "Browse structured Ukrainian tech jobs from DOU and Djinni, match them to your CV, and get new results in Telegram.",
  openGraph: {
    title: "metahunt · Ukrainian tech jobs in one feed",
    description:
      "Browse DOU and Djinni in one structured feed, remove repeats, and get new matching jobs in Telegram.",
    url: "/",
    siteName: "metahunt",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "metahunt · Ukrainian tech jobs in one feed",
    description: "Structured jobs, CV matching, and Telegram alerts from DOU and Djinni.",
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
      lang="en"
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
