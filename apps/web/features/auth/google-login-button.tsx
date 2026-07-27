"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { authApi, type GoogleCredentialResponse } from "@/lib/api/auth";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { useSession } from "./use-session";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GIS_SRC = "https://accounts.google.com/gsi/client";

interface GoogleIdentity {
  initialize: (opts: {
    client_id: string;
    callback: (res: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, opts: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentity } };
  }
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("gis failed to load")));
    if (!existing) {
      s.src = GIS_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

// GIS registers exactly ONE callback per page, so a second `initialize()` would
// silently steal the first button's credential — and a link-mode button
// receiving a login-mode credential would replace the live session with
// whichever account owns that Google id. One init, explicit routing instead.
type CredentialHandler = (credential: string) => void;
const mounted = new Set<CredentialHandler>();
let armed: CredentialHandler | null = null;
let gisReady: Promise<void> | undefined;

function dispatchCredential(credential: string): void {
  const only = mounted.size === 1 ? [...mounted][0] : null;
  // A stale `armed` still gets a late chooser result, but never hands it to a
  // different button: sign-in and link are opposite actions on one credential.
  const target = armed ? (mounted.has(armed) || mounted.size === 0 ? armed : null) : only;
  armed = null;
  target?.(credential);
}

function ensureGis(clientId: string): Promise<void> {
  gisReady ??= loadGis().then(() => {
    window.google?.accounts?.id?.initialize({
      client_id: clientId,
      callback: (res) => dispatchCredential(res.credential),
      // One Tap stays off: under FedCM the browser owns the prompt, and an
      // unprompted card on a cold first visit is a distraction, not a funnel.
      auto_select: false,
      cancel_on_tap_outside: true,
    });
  });
  return gisReady;
}

/**
 * Google's own rendered button. GIS does not allow a custom trigger for the
 * ID-token flow — `renderButton` draws it inside an iframe we cannot restyle —
 * so this is the black square variant rather than a house-kit button.
 *
 * `onCredential` overrides the default (sign in) with linking, so the same
 * button serves both the logged-out and account-settings cases.
 */
export function GoogleLoginButton({
  onDone,
  onCredential,
  width = 220,
  size = "medium",
  text = "signin_with",
  disabled = false,
  className,
}: {
  onDone?: () => void;
  onCredential?: (credential: string) => Promise<void>;
  /** Google draws into an iframe, so these are told, not styled. */
  width?: number;
  size?: "medium" | "large";
  text?: "signin_with" | "continue_with";
  /** GIS owns the iframe, so `inert` is the only real disable available. */
  disabled?: boolean;
  className?: string;
}) {
  const { login } = useSession();
  const analytics = useAnalytics();
  const slot = useRef<HTMLDivElement>(null);
  const handlers = useRef({ login, analytics, onDone, onCredential });
  useEffect(() => {
    handlers.current = { login, analytics, onDone, onCredential };
  });

  const handleCredential = useCallback((credential: string) => {
    void (async () => {
      const {
        login: doLogin,
        analytics: track,
        onDone: done,
        onCredential: link,
      } = handlers.current;
      try {
        if (link) {
          await link(credential);
        } else {
          const res = await authApi.loginGoogle(credential);
          doLogin(res);
          if (res.isNewUser) track.signedUp("google");
          track.loggedIn("google");
          toast.success(`logged in as ${res.user.firstName ?? res.user.email ?? "you"}`);
        }
        done?.();
      } catch {
        track.googleLoginFailed("session");
        toast.error("login failed, try again");
      }
    })();
  }, []);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    const container = slot.current;
    mounted.add(handleCredential);
    void ensureGis(CLIENT_ID)
      .then(() => {
        const gis = window.google?.accounts?.id;
        if (cancelled || !gis || !slot.current) return;
        gis.renderButton(slot.current, {
          type: "standard",
          theme: "filled_black",
          shape: "square",
          size,
          text,
          width,
        });
      })
      .catch(() => {
        if (!cancelled) handlers.current.analytics.googleLoginFailed("widget");
      });
    return () => {
      cancelled = true;
      mounted.delete(handleCredential);
      // renderButton appends; without this a re-render stacks a second button.
      if (container) container.innerHTML = "";
    };
  }, [handleCredential, width, size, text]);

  // The rendered button lives in a Google iframe, so its clicks never reach us;
  // entering the wrapper is the last signal we get before the credential lands.
  const arm = useCallback(() => {
    armed = handleCredential;
  }, [handleCredential]);

  if (!CLIENT_ID) return null;
  return (
    <div
      ref={slot}
      inert={disabled}
      onPointerEnter={disabled ? undefined : arm}
      onFocusCapture={disabled ? undefined : arm}
      className={cn(
        size === "large" ? "min-h-[40px]" : "min-h-[36px]",
        disabled && "opacity-50",
        className,
      )}
    />
  );
}
