"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/ui";
import { cn } from "@/lib/utils";
import { authApi, type TelegramAuthPayload } from "@/lib/api/auth";
import { useAnalytics } from "@/lib/analytics/use-analytics";
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

// Legacy login path, kept only as the fallback behind the bot deep-link flow
// (see telegram-login-button.tsx). Opens Telegram's auth popup and trades the
// payload for our session via /auth/telegram. Deleted once the deep-link flow
// has proven itself in prod — see MET-5.
export function TelegramWidgetButton({
  onDone,
  onPayload,
  className,
  label = "log in",
  variant = "primary",
}: {
  onDone?: () => void;
  /** Replaces sign-in with the caller's own use of the verified payload —
   *  linking Telegram to an account that already exists, for instance. */
  onPayload?: (payload: TelegramAuthPayload) => Promise<void>;
  className?: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const { login } = useSession();
  const analytics = useAnalytics();
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    const startedAt = Date.now();
    analytics.telegramLoginStarted("widget");
    if (!BOT_ID) {
      analytics.telegramLoginFailed("configuration", "widget");
      toast.error("Telegram login is not configured.");
      return;
    }
    setBusy(true);
    try {
      await loadWidget();
      window.Telegram!.Login!.auth({ bot_id: BOT_ID, request_access: "write" }, async (tgUser) => {
        if (!tgUser) {
          analytics.telegramLoginCancelled(Date.now() - startedAt, "widget");
          setBusy(false);
          return; // popup closed / access denied
        }
        try {
          if (onPayload) {
            await onPayload(tgUser);
          } else {
            const res = await authApi.loginTelegram(tgUser);
            login(res);
            if (res.isNewUser) analytics.signedUp("telegram");
            analytics.loggedIn("telegram");
            const name = res.user.username
              ? `@${res.user.username}`
              : (res.user.firstName ?? "you");
            toast.success(`logged in as ${name}`);
          }
          onDone?.();
        } catch {
          analytics.telegramLoginFailed("session", "widget");
          toast.error("Login failed. Please try again.");
        } finally {
          setBusy(false);
        }
      });
    } catch {
      analytics.telegramLoginFailed("widget", "widget");
      toast.error("Couldn't open Telegram login.");
      setBusy(false);
    }
  }, [login, analytics, onDone, onPayload]);

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={handleClick}
      disabled={busy}
      aria-label="Log in with the Telegram widget"
      className={cn(
        "gap-1.5",
        variant === "primary" && "bg-accent-secondary hover:bg-accent-secondary",
        className,
      )}
    >
      {variant === "ghost" ? null : (
        <PaperPlaneTiltIcon weight="fill" className="h-3.5 w-3.5" aria-hidden />
      )}
      {busy ? "opening…" : label}
    </Button>
  );
}
