import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Omit an empty list from a query (undefined = "no filter").
export function nonEmpty<T>(a: T[]): T[] | undefined {
  return a.length > 0 ? a : undefined
}

// Comma-join a list for a flat query param, or undefined when empty.
export function toCsv(a: string[]): string | undefined {
  return a.length > 0 ? a.join(",") : undefined
}

// Caps a sticky sidebar's height and lets it self-scroll, so a rail taller
// than the viewport keeps its bottom reachable instead of clipped below the fold.
export const STICKY_RAIL =
  "xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto xl:overscroll-contain [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]"
