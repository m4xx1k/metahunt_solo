"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/ui";
import { cn } from "@/lib/utils";
import { authApi, type TelegramAuthPayload } from "@/lib/api/auth";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import { useSession } from "./use-session";

// Numeric bot id (the part before ":" in the bot token). Required for
// Telegram.Login.auth — the widget's <script> tag uses @username, but the
// programmatic entry point keys on the id.
const BOT_ID = process.env.NEXT_PUBLIC_TELEGRAM_BOT_ID;
const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";

interface TelegramLogin {
  auth: (
    opts: { bot_id: string; request_access?: "write"; lang?: string },
    callback: (user: TelegramAuthPayload | false) => void,
  ) => void;
}
declare global {
  interface Window {
    Telegram?: { Login?: TelegramLogin };
  }
}

// Load Telegram's widget script once so window.Telegram.Login.auth exists.
function loadWidget(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Telegram?.Login) return resolve();
    const base = WIDGET_SRC.split("?")[0];
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="${base}"]`);
    const done = () => resolve();
    const fail = () => reject(new Error("telegram widget failed to load"));
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", fail);
      return;
    }
    const s = document.createElement("script");
    s.src = WIDGET_SRC;
    s.async = true;
    s.addEventListener("load", done);
    s.addEventListener("error", fail);
    document.head.appendChild(s);
  });
}

// House-styled trigger (blue ui-kit accent, not Telegram's iframe button) that
// opens the Telegram auth popup on click, then trades the payload for our
// session via /auth/telegram. CV uploads require that authenticated session.
export function TelegramLoginButton({
  onDone,
  className,
}: {
  onDone?: () => void;
  className?: string;
}) {
  const { login } = useSession();
  const analytics = useAnalytics();
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    analytics.telegramLoginStarted();
    if (!BOT_ID) {
      analytics.telegramLoginFailed("configuration");
      toast.error("Telegram login is not configured.");
      return;
    }
    setBusy(true);
    try {
      await loadWidget();
      window.Telegram!.Login!.auth({ bot_id: BOT_ID, request_access: "write" }, async (tgUser) => {
        if (!tgUser) {
          analytics.telegramLoginCancelled();
          setBusy(false);
          return; // popup closed / access denied
        }
        try {
          const res = await authApi.loginTelegram(tgUser);
          login(res);
          analytics.loggedIn();
          const name = res.user.username ? `@${res.user.username}` : (res.user.firstName ?? "you");
          toast.success(`logged in as ${name}`);
          onDone?.();
        } catch {
          analytics.telegramLoginFailed("session");
          toast.error("Login failed. Please try again.");
        } finally {
          setBusy(false);
        }
      });
    } catch {
      analytics.telegramLoginFailed("widget");
      toast.error("Couldn't open Telegram login.");
      setBusy(false);
    }
  }, [login, analytics, onDone]);

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={handleClick}
      disabled={busy}
      aria-label="Log in with Telegram"
      className={cn("gap-1.5 bg-accent-secondary hover:bg-accent-secondary", className)}
    >
      <PaperPlaneTiltIcon weight="fill" className="h-3.5 w-3.5" aria-hidden />
      {busy ? "opening…" : "log in"}
    </Button>
  );
}
