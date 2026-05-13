"use client";

import * as React from "react";
import { Button } from "@/components/ui-kit";
import { usersApi } from "@/lib/api/users";
import { cn } from "@/lib/utils";
import { ctaSection } from "./data";

const EMAIL_LOCK_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_LOCK_KEY = "metahunt:waitlist:email-lock";

export function FinalCTAForm() {
  const [email, setEmail] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [toast, setToast] = React.useState<{
    type: "success" | "info" | "error";
    message: string;
  } | null>(null);

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (isSubmitting) return;

          const normalizedEmail = email.trim().toLowerCase();
          if (!normalizedEmail) return;

          try {
            const lockedAt = window.localStorage.getItem(
              `${EMAIL_LOCK_KEY}:${normalizedEmail}`,
            );
            if (lockedAt && Date.now() - Number(lockedAt) < EMAIL_LOCK_TTL_MS) {
              setToast({
                type: "info",
                message: "Цей email вже відправлявся сьогодні",
              });
              return;
            }
          } catch {
            // Ignore localStorage read errors and continue submit flow.
          }

          setIsSubmitting(true);
          try {
            const result = await usersApi.subscribe(normalizedEmail);
            setEmail("");
            try {
              window.localStorage.setItem(
                `${EMAIL_LOCK_KEY}:${normalizedEmail}`,
                String(Date.now()),
              );
            } catch {
              // Ignore localStorage write errors.
            }
            setToast(
              result.status === "already_subscribed"
                ? { type: "info", message: "Ви вже у waitlist" }
                : { type: "success", message: "Заявку надіслано" },
            );
          } catch {
            setToast({ type: "error", message: "Не вдалося надіслати" });
          } finally {
            setIsSubmitting(false);
          }
        }}
        className="flex w-full max-w-[560px] items-center gap-1.5 border border-border bg-bg-card p-1.5 focus-within:border-accent/50"
      >
        <input
          type="email"
          name="email"
          required
          placeholder={ctaSection.placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-transparent px-4 font-body text-[15px] text-text-primary outline-none placeholder:text-text-muted"
        />
        <Button type="submit" variant="primary" size="md" className="rounded-xl px-6" disabled={isSubmitting}>
          <span className="sm:hidden">let{"'"}s go</span>
          <span className="hidden sm:block">{ctaSection.cta}</span>
        </Button>
      </form>
      {toast ? (
        <div
          role="status"
          className={cn(
            "fixed right-4 bottom-4 z-50 rounded-lg border px-4 py-2 font-body text-sm shadow-[4px_4px_0_0_#000]",
            toast.type === "success"
              ? "border-accent bg-bg-card text-text-primary"
              : "border-border bg-bg-card text-text-primary",
          )}
        >
          {toast.message}
        </div>
      ) : null}
    </>
  );
}
