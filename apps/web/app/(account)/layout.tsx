import type { ReactNode } from "react";

import { Header } from "@/app/_components/Header";
import { AccountMenu } from "@/features/auth/account-menu";

// Account chrome. The per-page client components enforce the auth guard (the
// session token is client-side), so this layout is just header + container.
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header cta={<AccountMenu />} />
      <main className="mx-auto min-h-screen w-full max-w-[900px] px-6 py-10">
        {children}
      </main>
    </>
  );
}
