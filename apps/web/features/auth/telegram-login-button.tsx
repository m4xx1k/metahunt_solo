"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/overlay/Popover";
import { cn } from "@/lib/utils";
import { authApi } from "@/lib/api/auth";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { TelegramWidgetButton } from "./telegram-widget-button";
import { useSession } from "./use-session";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
const POLL_INTERVAL_MS = 2_000;
// Matches the backend request TTL (telegram-login.service.ts).
const POLL_TIMEOUT_MS = 5 * 60_000;

type Phase = "idle" | "opening" | "waiting" | "expired";

interface Pending {
  nonce: string;
  pollSecret: string;
  verificationCode: string;
  deepLink: string;
}

/**
 * Login by deep-linking into the bot instead of Telegram's login widget. On
 * mobile this hands off to the native app, where the user is already signed in
 * — the widget's phone-number-and-code path is what people were failing at.
 */
export function TelegramLoginButton({
  onDone,
  className,
}: {
  onDone?: () => void;
  className?: string;
}) {
  const { login } = useSession();
  const analytics = useAnalytics();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pending, setPending] = useState<Pending | null>(null);
  const startedAt = useRef(0);
  const inFlight = useRef(false);
  // Held in a ref so an inline `onDone` from the caller doesn't restart the
  // polling effect on every render.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const reset = useCallback(() => {
    setPending(null);
    setPhase("idle");
  }, []);

  const handleClick = useCallback(async () => {
    startedAt.current = Date.now();
    analytics.telegramLoginStarted("deeplink");
    if (!BOT_USERNAME) {
      analytics.telegramLoginFailed("configuration", "deeplink");
      toast.error("Telegram login is not configured.");
      return;
    }
    setPhase("opening");
    try {
      const started = await authApi.startTelegramLogin();
      setPending({
        nonce: started.nonce,
        pollSecret: started.pollSecret,
        verificationCode: started.verificationCode,
        deepLink: `https://t.me/${BOT_USERNAME}?start=${started.startPayload}`,
      });
      setPhase("waiting");
    } catch {
      analytics.telegramLoginFailed("session", "deeplink");
      toast.error("Couldn't start Telegram login. Please try again.");
      setPhase("idle");
    }
  }, [analytics]);

  useEffect(() => {
    if (phase !== "waiting" || !pending) return;
    let stopped = false;

    const expire = () => {
      stopped = true;
      analytics.telegramLoginFailed("expired", "deeplink");
      setPending(null);
      setPhase("expired");
    };

    const poll = async () => {
      // The interval and the visibilitychange trigger can overlap. Without this
      // guard the loser of the backend's single-use race answers `expired` and
      // discards the session the winner is about to deliver.
      if (stopped || inFlight.current) return;
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) return expire();

      inFlight.current = true;
      let result;
      try {
        result = await authApi.pollTelegramLogin(pending.nonce, pending.pollSecret);
      } catch {
        return; // transient — keep polling until the deadline
      } finally {
        inFlight.current = false;
      }
      if (result.status === "pending") return;
      if (result.status === "expired") return stopped ? undefined : expire();

      // Deliberately ahead of the `stopped` check: the row is already consumed
      // and the token already minted, so dropping it would burn a real session.
      stopped = true;
      login(result);
      if (result.isNewUser) analytics.signedUp();
      analytics.loggedIn();
      setPending(null);
      setPhase("idle");
      const name = result.user.username
        ? `@${result.user.username}`
        : (result.user.firstName ?? "you");
      toast.success(`logged in as ${name}`);
      onDoneRef.current?.();
    };

    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    // Coming back from the Telegram app doesn't wait for the next tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, pending, analytics, login]);

  const handleCancel = useCallback(() => {
    if (phase === "waiting") {
      analytics.telegramLoginCancelled(Date.now() - startedAt.current, "deeplink");
    }
    reset();
  }, [phase, analytics, reset]);

  return (
    <Popover
      open={phase === "waiting" || phase === "expired"}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="primary"
          size="sm"
          // Radix toggles the popover after this fires, so a click while a
          // request is live must not mint a second one and orphan the first.
          onClick={() => {
            if (phase === "idle") void handleClick();
          }}
          disabled={phase === "opening"}
          aria-label="Log in with Telegram"
          className={cn("gap-1.5 bg-accent-secondary hover:bg-accent-secondary", className)}
        >
          <PaperPlaneTiltIcon weight="fill" className="h-3.5 w-3.5" aria-hidden />
          {phase === "opening" ? "opening…" : "log in"}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="flex flex-col gap-3">
        {pending ? (
          <>
            <p>
              open the bot and confirm the code{" "}
              <b className="text-text-primary">{pending.verificationCode}</b>. it will ask — that is
              how you know nobody else started this.
            </p>
            <a
              href={pending.deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="uppercase tracking-wider text-accent underline"
            >
              open telegram →
            </a>
            <p className="text-text-muted">waiting for your confirmation…</p>
          </>
        ) : (
          <p>that login link expired. links live 5 minutes.</p>
        )}
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button variant="secondary" size="sm" onClick={reset}>
            {pending ? "cancel" : "try again"}
          </Button>
          <TelegramWidgetButton
            variant="secondary"
            label="use the widget"
            onDone={() => {
              reset(); // also stops the deep-link poll we no longer need
              onDoneRef.current?.();
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
