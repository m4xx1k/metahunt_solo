import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppToaster } from "@/components/shared/AppToaster";
import { VercelAnalytics } from '@/lib/vercel-analytics';
import { PostHogProvider } from '@/lib/posthog';

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
  title: "MetaHunt",
  description: "Neo-brutalist UI kit for MetaHunt",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        inter.variable,
        spaceGrotesk.variable,
        jetbrainsMono.variable,
      )}
    >
      <body className="min-h-full flex flex-col bg-bg text-text-primary">
        <ClerkProvider afterSignOutUrl="/">
          <PostHogProvider>
            <VercelAnalytics>
            {children}
            </VercelAnalytics>
            <AppToaster />
          </PostHogProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
