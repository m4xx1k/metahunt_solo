"use client";

import { EmailInput } from "@/components/ui-kit";
import { useWaitlistSignup } from "../waitlist/use-waitlist-signup";

interface Props {
  cta: string;
}

export function HeroWaitlist({ cta }: Props) {
  const { email, setEmail, isSubmitting, handleSubmit } = useWaitlistSignup();
  return (
    <EmailInput
      value={email}
      onValueChange={setEmail}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      cta={cta}
    />
  );
}
