import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppToaster } from "@/app/_components/AppToaster";
import { VercelAnalytics } from '@/lib/vercel-analytics';
import { PostHogProvider } from '@/lib/posthog';
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
  title: "[metahunt]",
  description: "Neo-brutalist UI kit for MetaHunt",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-bg text-text-primary"
      >
        <ClerkProvider afterSignOutUrl="/">
          <PostHogProvider>
            <Providers>
              <VercelAnalytics>
              {children}
              </VercelAnalytics>
              <AppToaster />
            </Providers>
          </PostHogProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
