"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "../buttons/Button";

const EMAIL_LOCK_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_LOCK_KEY = "web3forms:hero:email-lock";

export function EmailInput({
  className,
  placeholder = "your@email.com",
  cta = "Отримати доступ",
  onSubmit,
}: {
  className?: string;
  placeholder?: string;
  cta?: string;
  onSubmit?: (email: string) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [toast, setToast] = React.useState<{
    type: "success" | "error";
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
        action="https://api.web3forms.com/submit"
        method="POST"
        onSubmit={async (e) => {
          e.preventDefault();
          if (isSubmitting) return;

          const normalizedEmail = email.trim().toLowerCase();
          if (!normalizedEmail) return;

          try {
            const lockedAt = window.localStorage.getItem(`${EMAIL_LOCK_KEY}:${normalizedEmail}`);
            if (lockedAt && Date.now() - Number(lockedAt) < EMAIL_LOCK_TTL_MS) {
              setToast({ type: "error", message: "Цей email вже відправлявся сьогодні" });
              return;
            }
          } catch {
            // Ignore localStorage read errors and continue submit flow.
          }

          setIsSubmitting(true);
          try {
            onSubmit?.(email);
            const formData = new FormData(e.currentTarget);
            const response = await fetch("https://api.web3forms.com/submit", {
              method: "POST",
              body: formData,
              headers: { Accept: "application/json" },
            });
            const result = (await response.json()) as { success?: boolean };

            if (response.ok && result.success) {
              setEmail("");
              try {
                window.localStorage.setItem(
                  `${EMAIL_LOCK_KEY}:${normalizedEmail}`,
                  String(Date.now()),
                );
              } catch {
                // Ignore localStorage write errors.
              }
              setToast({ type: "success", message: "Заявку надіслано" });
              return;
            }
            setToast({ type: "error", message: "Не вдалося надіслати" });
          } catch {
            setToast({ type: "error", message: "Помилка мережі" });
          } finally {
            setIsSubmitting(false);
          }
        }}
        className={cn(
          "flex w-full max-w-[520px] flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-[6px] border border-border bg-bg-card p-2 sm:p-[6px] shadow-[6px_6px_0_0_#000] focus-within:border-accent",
          className,
        )}
      >
        <input
          type="hidden"
          name="access_key"
          value="f56f6630-deb4-40b3-8c37-38e212a821be"
        />
        <input type="hidden" name="name" value="Website lead" />
        <input type="hidden" name="message" value="Email signup from hero form" />
        <input
          type="email"
          name="email"
          required
          placeholder={placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 bg-transparent px-4 py-3 font-body text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
        <Button type="submit" variant="primary" size="sm" className="w-full sm:w-auto" disabled={isSubmitting}>
          {cta}
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
