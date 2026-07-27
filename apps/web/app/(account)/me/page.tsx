"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { EmptyState } from "@/ui/feedback/EmptyState";
import { AuthChoice } from "@/features/auth/auth-choice";
import { useSession } from "@/features/auth/use-session";
import { AccountHeader } from "./_components/AccountHeader";
import { ConnectionsPanel } from "./_components/ConnectionsPanel";
import { DeleteAccountPanel } from "./_components/DeleteAccountPanel";
import { MyCvPanel } from "./_components/MyCvPanel";
import { SubscriptionList } from "./_components/SubscriptionList";

// Client-rendered because the session token lives in localStorage — SSR has no
// token. Guards inline so a logged-out visitor lands on an explanation.
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

  if (isLoading) return <EmptyState title="loading…" titleAs="h1" className="mx-auto max-w-md" />;

  if (!isLoggedIn || !user) {
    return (
      <EmptyState
        title="sign in to see your account"
        titleAs="h1"
        hint="your CV, your subscriptions and your sign-in methods live here"
        action={<AuthChoice align="start" />}
        className="mx-auto max-w-md"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AccountHeader user={user} onLogout={handleLogout} />
      {/* Two columns only once there is room for two panels side by side; the
          CV panel spans both because its skill manager needs the width. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ConnectionsPanel user={user} />
        <SubscriptionList />
        <MyCvPanel className="lg:col-span-2" />
      </div>
      <DeleteAccountPanel onDeleted={handleAccountDeleted} />
    </div>
  );
}
