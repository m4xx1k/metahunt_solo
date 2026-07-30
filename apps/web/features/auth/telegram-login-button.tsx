"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/ui";
import { authApi } from "@/lib/api/auth";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { useSession } from "./use-session";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
const POLL_INTERVAL_MS = 2_000;
// Matches the backend request TTL (telegram-login.service.ts).
const POLL_TIMEOUT_MS = 5 * 60_000;

type Phase = "idle" | "opening" | "waiting" | "expired" | "conflict";
type Flow = "login" | "link";

interface Pending {
  nonce: string;
  pollSecret: string;
  verificationCode: string;
  /** Hands off to the installed app without navigating this tab away. */
  appLink: string;
  /** For anyone without the app — this one does leave the page. */
  webLink: string;
}

export function TelegramLoginButton({
  onDone,
  onInFlightChange,
  flow = "login",
  disabled = false,
}: {
  onDone?: () => void;
  /** True while a nonce is live, so the surface around us can stay mounted. */
  onInFlightChange?: (inFlight: boolean) => void;
  flow?: Flow;
  disabled?: boolean;
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
  const onInFlightRef = useRef(onInFlightChange);
  useEffect(() => {
    onDoneRef.current = onDone;
    onInFlightRef.current = onInFlightChange;
  });

  useEffect(() => {
    onInFlightRef.current?.(phase === "opening" || phase === "waiting");
  }, [phase]);
  useEffect(() => () => onInFlightRef.current?.(false), []);

  const reset = useCallback(() => {
    setPending(null);
    setPhase("idle");
  }, []);

  const handleClick = useCallback(async () => {
    startedAt.current = Date.now();
    analytics.telegramLoginStarted("deeplink");
    if (!BOT_USERNAME) {
      analytics.telegramLoginFailed("configuration", "deeplink");
      toast.error("Вхід через Telegram недоступний.");
      return;
    }
    setPhase("opening");
    try {
      const started =
        flow === "link" ? await authApi.startTelegramLink() : await authApi.startTelegramLogin();
      setPending({
        nonce: started.nonce,
        pollSecret: started.pollSecret,
        verificationCode: started.verificationCode,
        appLink: `tg://resolve?domain=${BOT_USERNAME}&start=${started.startPayload}`,
        webLink: `https://t.me/${BOT_USERNAME}?start=${started.startPayload}`,
      });
      setPhase("waiting");
    } catch {
      analytics.telegramLoginFailed("session", "deeplink");
      toast.error("Не вдалося. Спробуй ще раз.");
      setPhase("idle");
    }
  }, [analytics, flow]);

  useEffect(() => {
    if (phase !== "waiting" || !pending) return;
    let stopped = false;

    const expire = () => {
      stopped = true;
      analytics.telegramLoginFailed("expired", "deeplink");
      toast.error("Посилання застаріло.");
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
      if (result.status === "conflict") {
        stopped = true;
        analytics.identityLinkConflict("telegram");
        toast.error("Цей Telegram уже підключено до іншого акаунта.");
        setPending(null);
        setPhase("conflict");
        return;
      }

      // Deliberately ahead of the `stopped` check: the row is already consumed
      // and the token already minted, so dropping it would burn a real session.
      stopped = true;
      login(result);
      if (flow === "link") {
        analytics.identityLinked("telegram");
      } else {
        if (result.isNewUser) analytics.signedUp("telegram");
        analytics.loggedIn("telegram");
      }
      setPending(null);
      setPhase("idle");
      if (flow === "link") {
        toast.success("Telegram підключено");
      } else {
        const name = result.user.username
          ? `@${result.user.username}`
          : (result.user.firstName ?? "готово");
        toast.success(`Вхід: ${name}`);
      }
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
  }, [phase, pending, analytics, login, flow]);

  const handleCancel = useCallback(() => {
    if (phase === "waiting") {
      analytics.telegramLoginCancelled(Date.now() - startedAt.current, "deeplink");
    }
    reset();
  }, [phase, analytics, reset]);

  if (phase === "waiting" || phase === "expired" || phase === "conflict") {
    return (
      <div className="flex w-full flex-col gap-3">
        {pending ? (
          <>
            <p className="font-display text-2xl tracking-widest text-text-primary">
              {pending.verificationCode}
            </p>
            <p className="font-mono text-2xs text-text-secondary">підтвердь код у Telegram</p>
            {/* tg:// hands off to the app and leaves this tab where it is, so
                switching back lands on the site already logged in. */}
            <a
              href={pending.appLink}
              className="font-mono text-2xs uppercase tracking-wider text-accent underline"
            >
              відкрити Telegram →
            </a>
            <a
              href={pending.webLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-2xs text-text-muted underline"
            >
              у браузері
            </a>
            <p className="font-mono text-2xs text-text-muted">очікую…</p>
          </>
        ) : (
          <p className="font-mono text-2xs text-text-secondary">
            {phase === "conflict"
              ? "цей Telegram уже підключено до іншого акаунта"
              : "посилання застаріло"}
          </p>
        )}
        <Button variant="secondary" size="sm" onClick={handleCancel} className="w-full">
          {pending ? "скасувати" : "ще раз"}
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => void handleClick()}
      disabled={disabled || phase === "opening"}
      aria-label={flow === "link" ? "Підключити Telegram" : "Увійти через Telegram"}
      // 40px and full width to sit flush with the Google button GIS draws next
      // to it — the provider colour lives in the icon, not the fill.
      className="h-10 w-full justify-start gap-3 px-4"
    >
      <PaperPlaneTiltIcon weight="fill" className="h-4 w-4 text-accent-secondary" aria-hidden />
      {phase === "opening"
        ? "відкриваю…"
        : flow === "link"
          ? "Підключити Telegram"
          : "Увійти через Telegram"}
    </Button>
  );
}
