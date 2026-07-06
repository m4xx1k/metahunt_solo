"use client";

import { useState } from "react";

import { TelegramLoginButton } from "./telegram-login-button";
import { useSession } from "./use-session";

// Value-moment nudge in the warm lens: prompt an anonymous visitor to log in via
// Telegram so their CV + feed persist. Self-hides once logged in or dismissed.
export function SaveCvNudge() {
  const { isLoggedIn, isLoading } = useSession();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || isLoggedIn || dismissed) return null;

  return (
    <div className="border border-accent-secondary/40 bg-bg-card p-3 shadow-brut-sm">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="font-mono text-2xs uppercase tracking-wider text-accent-secondary">
          save this match
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="dismiss"
          className="-mt-0.5 font-mono text-2xs text-text-muted hover:text-text-primary"
        >
          ✕
        </button>
      </div>
      <p className="mb-2.5 font-body text-xs leading-relaxed text-text-secondary">
        Log in with Telegram to keep this CV and get new matches in your chat.
      </p>
      <TelegramLoginButton className="w-full" onDone={() => setDismissed(true)} />
    </div>
  );
}
