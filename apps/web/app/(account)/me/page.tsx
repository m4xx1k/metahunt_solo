"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { EmptyState } from "@/ui/feedback/EmptyState";
import { AuthChoice } from "@/features/auth/auth-choice";
import { useSession } from "@/features/auth/use-session";
import { AccountNav } from "./_components/AccountNav";
import { AccountHeader } from "./_components/AccountHeader";
import { ConnectionsPanel } from "./_components/ConnectionsPanel";
import { DeleteAccountPanel } from "./_components/DeleteAccountPanel";
import { MyCvPanel } from "./_components/MyCvPanel";
import { SubscriptionList } from "./_components/SubscriptionList";

export default function MePage() {
  const { isLoggedIn, isLoading, user, logout } = useSession();
  const router = useRouter();

  const handleLogout = useCallback(() => {
    void logout();
    router.replace("/");
  }, [logout, router]);

  const handleAccountDeleted = useCallback(async () => {
    await logout();
    router.replace("/");
  }, [logout, router]);

  if (isLoading)
    return <EmptyState title="завантаження…" titleAs="h1" className="mx-auto max-w-md" />;

  if (!isLoggedIn || !user) {
    return (
      <EmptyState
        title="увійди до кабінету"
        titleAs="h1"
        hint="тут твої CV, підписки та способи входу"
        action={<AuthChoice align="start" />}
        className="mx-auto max-w-md"
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-10">
      <AccountNav />
      <div className="min-w-0 space-y-8">
        <AccountHeader user={user} onLogout={handleLogout} />
        <section id="subscriptions" className="scroll-mt-24">
          <SubscriptionList canEdit={user.roles.includes("admin")} />
        </section>
        <section id="cv" className="scroll-mt-24">
          <MyCvPanel />
        </section>
        <section id="account" className="scroll-mt-24 space-y-6">
          <ConnectionsPanel user={user} />
          <DeleteAccountPanel onDeleted={handleAccountDeleted} />
        </section>
      </div>
    </div>
  );
}
