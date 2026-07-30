"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/overlay/Popover";
import { GoogleLoginButton } from "./google-login-button";
import { TelegramLoginButton } from "./telegram-login-button";

// One trigger, one surface — two bare provider buttons never agreed on size.
export function AuthChoice({
  onDone,
  align = "center",
  className,
}: {
  onDone?: () => void;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Closing unmounts the content, which would kill the Telegram poller the user
  // is waiting on — so stay mounted while, and only while, that is in flight.
  const [inFlight, setInFlight] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closedOutside = useRef(false);

  // Force-mounting keeps Radix's FocusScope from ever unmounting, so its
  // focus-in-on-open / focus-back-on-close never fire. Drive them by hand.
  useEffect(() => {
    if (!inFlight) return;
    if (open) return contentRef.current?.focus();
    // Clicking elsewhere is how people leave a login running; pulling focus
    // back out of whatever they just clicked is what Radix avoids too.
    if (!closedOutside.current) triggerRef.current?.focus();
  }, [open, inFlight]);

  const done = useCallback(() => {
    setInFlight(false);
    setOpen(false);
    onDone?.();
  }, [onDone]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button ref={triggerRef} variant="primary" size="sm" className={className}>
          sign in
        </Button>
      </PopoverTrigger>

      <PopoverContent
        ref={contentRef}
        align={align}
        onInteractOutside={() => {
          closedOutside.current = true;
        }}
        onPointerDownCapture={() => {
          closedOutside.current = false;
        }}
        // Focus is driven by the effect above; Radix's own restore would fire
        // on the delayed unmount, minutes after the user moved on.
        onCloseAutoFocus={(e) => e.preventDefault()}
        aria-label="sign in"
        forceMount={inFlight ? true : undefined}
        className="flex w-64 flex-col gap-3"
      >
        <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
          new roles, every hour
        </p>

        <TelegramLoginButton onDone={done} onInFlightChange={setInFlight} />
        <GoogleLoginButton onDone={done} width={224} size="large" text="continue_with" />
      </PopoverContent>
    </Popover>
  );
}
