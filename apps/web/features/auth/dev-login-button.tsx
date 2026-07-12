"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/ui";
import { cn } from "@/lib/utils";
import { authApi } from "@/lib/api/auth";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import { useSaved } from "@/lib/hooks/use-saved";
import { useSession } from "./use-session";

// Dev-only shortcut that logs in via POST /auth/dev-login — no Telegram widget,
// so no public HTTPS domain / BotFather /setdomain dance. Shown only in dev
// builds (build-time constant, like use-feature-flag); the backend independently
// refuses it unless DEV_LOGIN_ENABLED=1. See md/runbook/telegram-auth.md.
const DEV = process.env.NODE_ENV !== "production";

export function DevLoginButton({ className }: { className?: string }) {
  const { login } = useSession();
  const saved = useSaved();
  const analytics = useAnalytics();
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    setBusy(true);
    try {
      const res = await authApi.loginDev(saved.cvs.map((c) => c.candidateId));
      login(res);
      analytics.loggedIn(res.user.telegramId, res.user.id);
      toast.success("dev login");
    } catch {
      toast.error("dev login failed — set DEV_LOGIN_ENABLED=1 in .env");
    } finally {
      setBusy(false);
    }
  }, [login, saved.cvs, analytics]);

  if (!DEV) return null;

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleClick}
      disabled={busy}
      aria-label="Dev login"
      className={cn("gap-1.5", className)}
    >
      {busy ? "…" : "dev login"}
    </Button>
  );
}
