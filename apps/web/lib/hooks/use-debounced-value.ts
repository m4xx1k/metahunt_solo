"use client";

import { useEffect, useRef, useState } from "react";

// Trailing debounce. The first value passes through immediately, so an
// SSR-seeded react-query key still matches on mount; only later changes wait
// out the delay.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return settled;
}
