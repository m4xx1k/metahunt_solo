"use client";

import { cn } from "@/lib/utils";
import { GoogleLoginButton } from "./google-login-button";
import { TelegramLoginButton } from "./telegram-login-button";

// The one place that decides which sign-in methods exist. Telegram leads
// because it is also the delivery channel.
export function AuthChoice({ onDone, className }: { onDone?: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <TelegramLoginButton onDone={onDone} />
      <GoogleLoginButton onDone={onDone} />
    </div>
  );
}
