import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Header } from "@/app/_components/Header";
import { HeaderAuth } from "@/features/auth/header-auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header cta={<HeaderAuth />} />
      <main className="page-dot-grid min-h-screen bg-bg px-4 py-8 sm:px-6 md:py-12">
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </main>
    </>
  );
}
