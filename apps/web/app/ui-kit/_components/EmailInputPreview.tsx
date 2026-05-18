"use client";

import { useCallback, useState, type FormEvent } from "react";
import { EmailInput } from "@/components/ui-kit";

export function EmailInputPreview() {
  const [email, setEmail] = useState("");

  const handleSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEmail("");
  }, []);

  return (
    <EmailInput value={email} onValueChange={setEmail} onSubmit={handleSubmit} />
  );
}
