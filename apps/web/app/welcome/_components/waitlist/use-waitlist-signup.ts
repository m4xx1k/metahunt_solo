"use client";

import { useCallback, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { usersApi, type SignupSource } from "@/lib/api/users";

export interface UseWaitlistSignup {
  email: string;
  setEmail: (value: string) => void;
  isSubmitting: boolean;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

export function useWaitlistSignup(source: SignupSource = "landing-cta"): UseWaitlistSignup {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isSubmitting) return;

      const normalized = email.trim().toLowerCase();
      if (!normalized) return;

      setIsSubmitting(true);
      try {
        const result = await usersApi.subscribe(normalized, source);
        setEmail("");
        if (result.status === "already_subscribed") {
          toast.info("Ви вже у waitlist");
        } else {
          toast.success("Заявку надіслано");
        }
      } catch {
        toast.error("Не вдалося надіслати");
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, isSubmitting, source],
  );

  return { email, setEmail, isSubmitting, handleSubmit };
}
