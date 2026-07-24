import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE } from "@/lib/api/session-cookie";
import { AdminGuard } from "./_components/AdminGuard";
import { Sidebar } from "./_components/Sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Console", template: "%s · metahunt console" },
  robots: { index: false, follow: false },
};

// Every protected screen lives under /dashboard, so this is the one place that
// gates access and paints the console chrome.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // No session at all (never logged in / logged out) — bounce home before any
  // nested page fetches admin APIs, instead of letting those SSR calls 401.
  // A present-but-invalid/non-admin session still reaches the pages below,
  // where error.tsx and the client-side AdminGuard handle it.
  const jar = await cookies();
  if (!jar.get(SESSION_COOKIE)) redirect("/");

  const asOf = new Date();
  return (
    <AdminGuard>
      <div className="flex min-h-screen bg-bg">
        <Sidebar asOf={asOf} />
        <main className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">{children}</main>
      </div>
    </AdminGuard>
  );
}
