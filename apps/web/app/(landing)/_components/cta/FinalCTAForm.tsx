"use client";

import { useCallback, type ChangeEvent } from "react";
import { Button } from "@/components/ui-kit";
import { useWaitlistSignup } from "../waitlist/use-waitlist-signup";
import { ctaSection } from "./data";

export function FinalCTAForm() {
  const { email, setEmail, isSubmitting, handleSubmit } = useWaitlistSignup();

  const handleEmailChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value),
    [setEmail],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-[560px] items-center gap-1.5 border border-border bg-bg-card p-1.5 focus-within:border-accent/50"
    >
      <input
        type="email"
        name="email"
        required
        placeholder={ctaSection.placeholder}
        value={email}
        onChange={handleEmailChange}
        className="w-full bg-transparent px-4 font-body text-[15px] text-text-primary outline-none placeholder:text-text-muted"
      />
      <Button
        type="submit"
        variant="primary"
        size="md"
        className="rounded-xl px-6"
        disabled={isSubmitting}
      >
        <span className="sm:hidden">let{"'"}s go</span>
        <span className="hidden sm:block">{ctaSection.cta}</span>
      </Button>
    </form>
  );
}
