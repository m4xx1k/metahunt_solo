"use client";
import type { ChangeEvent, FormEvent } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../buttons/Button";

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  placeholder?: string;
  cta?: string;
  isSubmitting?: boolean;
  className?: string;
}

export function EmailInput({
  value,
  onValueChange,
  onSubmit,
  placeholder = "your@email.com",
  cta = "Отримати доступ",
  isSubmitting = false,
  className,
}: Props) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value);

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "flex w-full max-w-[520px] flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-[6px] border border-border bg-bg-card p-2 sm:p-[6px] shadow-[6px_6px_0_0_#000] focus-within:border-accent",
        className,
      )}
    >
      <input
        type="email"
        name="email"
        required
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        className="flex-1 bg-transparent px-4 py-3 font-body text-sm text-text-primary outline-none placeholder:text-text-muted"
      />
      <Button
        type="submit"
        variant="primary"
        size="sm"
        className="w-full sm:w-auto"
        disabled={isSubmitting}
      >
        {cta}
      </Button>
    </form>
  );
}
