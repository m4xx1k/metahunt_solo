"use client";

import { Button } from "@/ui";
import type { AuthUser } from "@/lib/api/auth";
export function AccountHeader({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const name = user.username ? `@${user.username}` : user.firstName || "твій акаунт";

  return (
    <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate font-display text-xl font-bold tracking-tight text-text-primary">
          {name}
        </h1>
        <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
          {user.identities.map((i) => i.provider).join(" + ")}
          {user.roles.includes("admin") ? " · admin" : ""}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onLogout} className="self-start sm:self-auto">
        вийти
      </Button>
    </header>
  );
}
